import {
  createAuthApi,
  createBookingV2Api,
  createCustomerAddressesApi,
  createCustomerBookingsApi,
  createCustomerDashboardApi,
  createCustomerInvoicesApi,
  createCustomerNotificationsApi,
  createCustomerDevicesApi,
  createCustomerProfileApi,
  createCustomerRecurringApi,
  createCustomerReviewsApi,
  createHealthApi,
  createPaystackApi,
  createPromotionsApi,
  createRebookApi,
  createReferralsApi,
} from "@shalean/api-client";
import { getCustomerApiClient } from "@/lib/api/createCustomerApiClient";

export function getHealthApi() {
  return createHealthApi(getCustomerApiClient());
}

export function getAuthApi() {
  return createAuthApi(getCustomerApiClient());
}

export function getCustomerBookingsApi() {
  return createCustomerBookingsApi(getCustomerApiClient());
}

export function getBookingV2Api() {
  return createBookingV2Api(getCustomerApiClient());
}

export function getCustomerDashboardApi() {
  return createCustomerDashboardApi(getCustomerApiClient());
}

export function getCustomerRecurringApi() {
  return createCustomerRecurringApi(getCustomerApiClient());
}

export function getRebookApi() {
  return createRebookApi(getCustomerApiClient());
}

export function getReferralsApi() {
  return createReferralsApi(getCustomerApiClient());
}

export function getPromotionsApi() {
  return createPromotionsApi(getCustomerApiClient());
}

export function getPaystackApi() {
  return createPaystackApi(getCustomerApiClient());
}

export function getCustomerProfileApi() {
  return createCustomerProfileApi(getCustomerApiClient());
}

export function getCustomerAddressesApi() {
  return createCustomerAddressesApi(getCustomerApiClient());
}

export function getCustomerInvoicesApi() {
  return createCustomerInvoicesApi(getCustomerApiClient());
}

export function getCustomerNotificationsApi() {
  return createCustomerNotificationsApi(getCustomerApiClient());
}

export function getCustomerDevicesApi() {
  return createCustomerDevicesApi(getCustomerApiClient());
}

export function getCustomerReviewsApi() {
  return createCustomerReviewsApi(getCustomerApiClient());
}
