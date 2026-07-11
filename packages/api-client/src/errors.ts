/**
 * Typed errors for the shared API client.
 * Safe to throw or embed in ApiFailure — no DOM / Next types.
 */

export type ApiErrorCode =
  | "not_authenticated"
  | "timeout"
  | "network"
  | "http_error"
  | "parse_error"
  | "aborted";

export class ApiClientError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly body?: unknown;

  constructor(
    message: string,
    opts: { code: ApiErrorCode; status?: number; body?: unknown; cause?: unknown },
  ) {
    super(message);
    this.name = "ApiClientError";
    this.code = opts.code;
    this.status = opts.status ?? 0;
    this.body = opts.body;
    if (opts.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = opts.cause;
    }
  }
}

export function isApiClientError(value: unknown): value is ApiClientError {
  return value instanceof ApiClientError;
}
