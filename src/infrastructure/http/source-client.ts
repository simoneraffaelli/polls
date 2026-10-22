import { CollectionError } from "../../platform/collection/errors";

/** Adding an origin requires a code review; source configuration cannot extend this list. */
const allowedOrigins = new Set([
  "https://api.votehub.com",
  "https://www.federalreserve.gov",
  "https://clob.polymarket.com",
]);

export interface HttpBudget {
  maxPages: number;
  maxRequests: number;
  maxBytes: number;
  maxResponseBytes: number;
  maxDurationMs: number;
  maxAttemptsPerGet: number;
}

export interface SourceHttpResponse {
  status: number;
  headers: Headers;
  body: Uint8Array;
  receivedAt: string;
}

type Dependencies = {
  fetch?: typeof fetch;
  now?: () => number;
  random?: () => number;
  sleep?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
};

function safeUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new CollectionError("unsafe_url", "Invalid source URL");
  }
  if (
    url.protocol !== "https:" ||
    !allowedOrigins.has(url.origin) ||
    url.username ||
    url.password ||
    url.port
  ) {
    throw new CollectionError("unsafe_url", "Source URL is not allowed");
  }
  return url;
}

function validateBudget(budget: HttpBudget): void {
  if (
    Object.values(budget).some(
      (value) => !Number.isSafeInteger(value) || value < 1,
    )
  ) {
    throw new CollectionError(
      "budget",
      "HTTP budget must use positive integers",
    );
  }
  if (budget.maxResponseBytes > budget.maxBytes) {
    throw new CollectionError(
      "budget",
      "Response limit exceeds total byte budget",
    );
  }
}

function retryAfterMs(header: string | null, now: number): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0)
    return Math.ceil(seconds * 1000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

function defaultSleep(
  milliseconds: number,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted)
      return reject(new CollectionError("aborted", "Collection aborted"));
    const timer = setTimeout(done, milliseconds);
    function done() {
      signal.removeEventListener("abort", abort);
      resolve();
    }
    function abort() {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(new CollectionError("aborted", "Collection aborted"));
    }
    signal.addEventListener("abort", abort, { once: true });
  });
}

async function responseRetryDelay(
  response: Response,
  attempts: number,
  requests: number,
  budget: HttpBudget,
  now: () => number,
  random: () => number,
  remainingMs: () => number,
): Promise<number> {
  const code =
    response.status === 429
      ? "rate_limited"
      : response.status >= 500
        ? "server"
        : "http_status";
  const retryable = response.status === 429 || response.status >= 500;
  const statedDelay = retryAfterMs(response.headers.get("retry-after"), now());
  await response.body?.cancel().catch(() => undefined);
  const error = new CollectionError(
    code,
    `Source returned HTTP ${response.status}`,
    {
      retryable,
      retryAfterMs: statedDelay,
    },
  );
  if (
    !retryable ||
    attempts >= budget.maxAttemptsPerGet ||
    requests >= budget.maxRequests
  )
    throw error;
  const jitter = Math.max(0, Math.min(1, random()));
  const backoff =
    Math.min(30_000, 500 * 2 ** Math.min(attempts - 1, 8)) * (0.5 + jitter);
  const delay = statedDelay ?? Math.ceil(backoff);
  if (delay >= remainingMs())
    throw new CollectionError(code, error.message, {
      retryable: true,
      retryAfterMs: delay,
    });
  return delay;
}

/** One client is scoped to one job cycle; beginPage accounts for provider pagination. */
export function createSourceHttpClient(
  budget: HttpBudget,
  dependencies: Dependencies = {},
) {
  validateBudget(budget);
  const fetchImpl = dependencies.fetch ?? fetch;
  const now = dependencies.now ?? Date.now;
  const random = dependencies.random ?? Math.random;
  const sleep = dependencies.sleep ?? defaultSleep;
  const startedAt = now();
  let pages = 0;
  let requests = 0;
  let bytes = 0;

  function remainingMs(): number {
    return budget.maxDurationMs - (now() - startedAt);
  }

  async function get(
    url: URL,
    signal: AbortSignal,
  ): Promise<SourceHttpResponse> {
    let attempts = 0;
    while (true) {
      if (signal.aborted)
        throw new CollectionError("aborted", "Collection aborted");
      if (remainingMs() <= 0 || requests >= budget.maxRequests) {
        throw new CollectionError(
          "budget",
          "HTTP time or request budget exhausted",
          { retryable: true },
        );
      }
      attempts += 1;
      requests += 1;
      const timeout = new AbortController();
      const combined = AbortSignal.any([signal, timeout.signal]);
      let rejectAbort!: (error: CollectionError) => void;
      const aborted = new Promise<never>((_, reject) => {
        rejectAbort = reject;
      });
      const onAbort = () =>
        rejectAbort(new CollectionError("aborted", "Collection aborted"));
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) onAbort();
      let timer: ReturnType<typeof setTimeout> | undefined;
      function stopTimer() {
        if (timer) clearTimeout(timer);
        timer = undefined;
      }
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          timeout.abort();
          reject(
            new CollectionError("timeout", "Source request timed out", {
              retryable: true,
            }),
          );
        }, remainingMs());
      });
      try {
        const response = await Promise.race([
          fetchImpl(url, {
            method: "GET",
            redirect: "manual",
            credentials: "omit",
            cache: "no-store",
            referrerPolicy: "no-referrer",
            signal: combined,
          }),
          deadline,
          aborted,
        ]);
        if (combined.aborted)
          throw new CollectionError(
            signal.aborted ? "aborted" : "timeout",
            "Source request interrupted",
            { retryable: !signal.aborted },
          );
        if (
          response.status >= 300 &&
          response.status < 400 &&
          response.status !== 304
        ) {
          await response.body?.cancel().catch(() => undefined);
          throw new CollectionError("unsafe_url", "Source redirect refused");
        }
        if (
          (response.status >= 200 && response.status < 300) ||
          response.status === 304
        ) {
          const body = await Promise.race([
            readBody(
              response,
              combined,
              signal,
              budget,
              () => bytes,
              (count) => {
                bytes += count;
              },
            ),
            deadline,
            aborted,
          ]);
          return {
            status: response.status,
            headers: response.headers,
            body,
            receivedAt: new Date(now()).toISOString(),
          };
        }
        const delay = await responseRetryDelay(
          response,
          attempts,
          requests,
          budget,
          now,
          random,
          remainingMs,
        );
        stopTimer();
        await Promise.race([sleep(delay, signal), aborted]);
      } catch (error) {
        if (error instanceof CollectionError) throw error;
        if (signal.aborted)
          throw new CollectionError("aborted", "Collection aborted");
        const delay = networkRetryDelay(
          error,
          attempts,
          requests,
          budget,
          random,
          remainingMs,
        );
        stopTimer();
        await Promise.race([sleep(delay, signal), aborted]);
      } finally {
        stopTimer();
        signal.removeEventListener("abort", onAbort);
      }
    }
  }

  return {
    beginPage() {
      if (pages >= budget.maxPages)
        throw new CollectionError("budget", "HTTP page budget exhausted");
      pages += 1;
      return {
        async get(rawUrl: string, signal: AbortSignal) {
          return get(safeUrl(rawUrl), signal);
        },
      };
    },
    usage() {
      return { pages, requests, bytes, elapsedMs: now() - startedAt };
    },
  };
}

function networkRetryDelay(
  error: unknown,
  attempts: number,
  requests: number,
  budget: HttpBudget,
  random: () => number,
  remainingMs: () => number,
): number {
  if (
    attempts >= budget.maxAttemptsPerGet ||
    requests >= budget.maxRequests ||
    remainingMs() <= 0
  )
    throw new CollectionError("network", "Source network request failed", {
      retryable: true,
      cause: error,
    });
  const delay = Math.ceil(
    Math.min(30_000, 500 * 2 ** Math.min(attempts - 1, 8)) *
      (0.5 + Math.max(0, Math.min(1, random()))),
  );
  if (delay >= remainingMs())
    throw new CollectionError("network", "Source network request failed", {
      retryable: true,
      retryAfterMs: delay,
    });
  return delay;
}

async function readBody(
  response: Response,
  signal: AbortSignal,
  callerSignal: AbortSignal,
  budget: HttpBudget,
  totalBytes: () => number,
  addBytes: (count: number) => void,
): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length"));
  if (
    Number.isFinite(declared) &&
    declared > Math.min(budget.maxResponseBytes, budget.maxBytes - totalBytes())
  ) {
    await response.body?.cancel().catch(() => undefined);
    throw new CollectionError("budget", "Source response exceeds byte budget");
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let responseBytes = 0;
  try {
    while (true) {
      if (signal.aborted)
        throw new CollectionError(
          callerSignal.aborted ? "aborted" : "timeout",
          "Source response interrupted",
          {
            retryable: !callerSignal.aborted,
          },
        );
      const { done, value } = await reader.read();
      if (done) break;
      responseBytes += value.byteLength;
      addBytes(value.byteLength);
      if (
        responseBytes > budget.maxResponseBytes ||
        totalBytes() > budget.maxBytes
      ) {
        throw new CollectionError(
          "budget",
          "Source response exceeds byte budget",
        );
      }
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(responseBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}
