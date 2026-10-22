import { performance } from "node:perf_hooks";

const base = new URL(process.env.LOAD_BASE_URL ?? "http://127.0.0.1:3000");
if (
  !["http:", "https:"].includes(base.protocol) ||
  base.username ||
  base.password ||
  base.pathname !== "/" ||
  base.search ||
  base.hash
) {
  throw new Error(
    "LOAD_BASE_URL must be an HTTP(S) origin without credentials",
  );
}
const requests = Number(process.env.LOAD_REQUESTS ?? 100);
const concurrency = Number(process.env.LOAD_CONCURRENCY ?? 4);
if (
  !Number.isInteger(requests) ||
  requests < 1 ||
  requests > 1000 ||
  !Number.isInteger(concurrency) ||
  concurrency < 1 ||
  concurrency > 16
) {
  throw new Error("Load budget: 1–1000 requests, 1–16 concurrent requests");
}
const paths = ["/", "/usa", "/usa/midterms/2026", "/usa/midterms/2026/polls"];
const timings = [];
let next = 0;
let failed = 0;
const started = performance.now();
await Promise.all(
  Array.from({ length: concurrency }, async () => {
    while (next < requests && performance.now() - started < 60_000) {
      const index = next++;
      const before = performance.now();
      try {
        const response = await fetch(
          new URL(paths[index % paths.length], base),
          { signal: AbortSignal.timeout(5000), redirect: "error" },
        );
        if (!response.ok) failed++;
        await response.body?.cancel();
        timings.push(performance.now() - before);
      } catch {
        failed++;
        timings.push(performance.now() - before);
      }
    }
  }),
);
timings.sort((a, b) => a - b);
console.log(
  JSON.stringify(
    {
      measuredAt: new Date().toISOString(),
      origin: base.origin,
      attempted: timings.length,
      planned: requests,
      concurrency,
      failed,
      durationMs: Math.round(performance.now() - started),
      responseHeadersP95Ms: Math.round(
        timings[Math.ceil(timings.length * 0.95) - 1],
      ),
      note: "Headers latency only; record dataset, warm-up, hardware and simultaneous worker load separately.",
    },
    null,
    2,
  ),
);
if (failed || timings.length !== requests) process.exitCode = 1;
