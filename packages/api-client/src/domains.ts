/**
 * Domain API factories — thin path wrappers over {@link createApiClient}.
 * No pricing, discounts, or ownership logic. Server remains authority.
 */
export { createAuthApi } from "./domains/auth";
export type {
  AuthApi,
  ResolveProfileResponse,
  ResolveProfileFailureBody,
} from "./domains/auth";

export { createHealthApi } from "./domains/health";
export type { HealthApi, HealthResponse } from "./domains/health";

export { createCustomerBookingsApi } from "./domains/customerBookings";
export type { CustomerBookingsApi } from "./domains/customerBookings";

export { createBookingV2Api } from "./domains/bookingV2";
export type { BookingV2Api } from "./domains/bookingV2";

export { createCustomerDashboardApi } from "./domains/dashboard";
export type { CustomerDashboardApi } from "./domains/dashboard";

export { createCustomerRecurringApi } from "./domains/recurring";
export type { CustomerRecurringApi } from "./domains/recurring";

export { createRebookApi } from "./domains/rebook";
export type { RebookApi } from "./domains/rebook";

export { createReferralsApi, createPromotionsApi } from "./domains/referrals";
export type { ReferralsApi, PromotionsApi } from "./domains/referrals";

export { createPaystackApi } from "./domains/paystack";
export type { PaystackApi } from "./domains/paystack";

export {
  createCustomerProfileApi,
  createCustomerAddressesApi,
  createCustomerInvoicesApi,
} from "./domains/customerAccount";
export type {
  CustomerProfileApi,
  CustomerAddressesApi,
  CustomerInvoicesApi,
} from "./domains/customerAccount";

export {
  createCustomerNotificationsApi,
  createCustomerDevicesApi,
} from "./domains/customerNotifications";
export type {
  CustomerNotificationsApi,
  CustomerDevicesApi,
} from "./domains/customerNotifications";

export { createCustomerReviewsApi } from "./domains/customerReviews";
export type { CustomerReviewsApi } from "./domains/customerReviews";
