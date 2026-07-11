/**
 * @shalean/api-client — isomorphic HTTP infrastructure for Shalean APIs.
 *
 * Pure TypeScript. No React, Next.js, Expo, or browser globals required
 * (uses globalThis.fetch when available; inject config.fetch otherwise).
 *
 * Domain wrappers (booking, cleaner, customer, payments) are intentionally
 * not included — add them in a later phase.
 */

export type {
  ApiClient,
  ApiClientConfig,
  ApiFailure,
  ApiRequestOptions,
  ApiResult,
  ApiSuccess,
  RequestContext,
  ResponseContext,
  RetryPolicy,
  TokenProvider,
} from "./types";

export { ApiClientError, isApiClientError } from "./errors";
export type { ApiErrorCode } from "./errors";

export {
  DEFAULT_RETRY_POLICY,
  DEFAULT_TIMEOUT_MS,
  resolveRequestUrl,
  resolveTimeoutMs,
} from "./config";

export { buildBearerHeaders, staticTokenProvider } from "./token";

export {
  parseJsonBody,
  readErrorMessage,
  responseToApiResult,
  toApiFailure,
  toApiSuccess,
} from "./parse";

export { createApiClient } from "./createApiClient";
