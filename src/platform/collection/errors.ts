export type CollectionErrorCode =
  | "network"
  | "timeout"
  | "rate_limited"
  | "server"
  | "http_status"
  | "schema"
  | "budget"
  | "unsafe_url"
  | "source_disabled"
  | "cursor_conflict"
  | "aborted";

/** Safe to persist as a job status; raw provider bodies and credentials stay out of messages. */
export class CollectionError extends Error {
  readonly code: CollectionErrorCode;
  readonly retryable: boolean;
  readonly retryAfterMs: number | null;

  constructor(
    code: CollectionErrorCode,
    message: string,
    options: {
      retryable?: boolean;
      retryAfterMs?: number | null;
      cause?: unknown;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "CollectionError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.retryAfterMs = options.retryAfterMs ?? null;
  }
}
