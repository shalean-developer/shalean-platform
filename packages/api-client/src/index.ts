/**
 * @shalean/api-client — isomorphic HTTP infrastructure for Shalean APIs.
 *
 * Pure TypeScript. No React, Next.js, Expo, or browser globals required
 * (uses globalThis.fetch when available; inject config.fetch otherwise).
 *
 * Domain factories live under `./domains` — thin path wrappers only.
 * Server owns pricing, discounts, ownership, and payment finalization.
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

export {
  createAuthApi,
  createHealthApi,
  createCustomerBookingsApi,
  createBookingV2Api,
  createCustomerDashboardApi,
  createCustomerRecurringApi,
  createRebookApi,
  createReferralsApi,
  createPromotionsApi,
  createPaystackApi,
  createCustomerProfileApi,
  createCustomerAddressesApi,
  createCustomerInvoicesApi,
  createCustomerNotificationsApi,
  createCustomerDevicesApi,
  createCustomerReviewsApi,
} from "./domains";

export type {
  AuthApi,
  ResolveProfileResponse,
  ResolveProfileFailureBody,
  HealthApi,
  HealthResponse,
  CustomerBookingsApi,
  BookingV2Api,
  CustomerDashboardApi,
  CustomerRecurringApi,
  RebookApi,
  ReferralsApi,
  PromotionsApi,
  PaystackApi,
  CustomerProfileApi,
  CustomerAddressesApi,
  CustomerInvoicesApi,
  CustomerNotificationsApi,
  CustomerDevicesApi,
  CustomerReviewsApi,
} from "./domains";
