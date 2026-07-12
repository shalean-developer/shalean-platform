import type { ApiClient, ApiResult } from "../types";

export function createCustomerProfileApi(client: ApiClient) {
  return {
    get<T = unknown>(): Promise<ApiResult<T>> {
      return client.requestJson<T>("/api/customer/profile", { method: "GET" });
    },
    patch<T = unknown>(body: unknown): Promise<ApiResult<T>> {
      return client.requestJson<T>("/api/customer/profile", {
        method: "PATCH",
        json: body,
      });
    },
  };
}

export type CustomerProfileApi = ReturnType<typeof createCustomerProfileApi>;

export function createCustomerAddressesApi(client: ApiClient) {
  return {
    list<T = unknown>(): Promise<ApiResult<T>> {
      return client.requestJson<T>("/api/customer/addresses", { method: "GET" });
    },
    get<T = unknown>(id: string): Promise<ApiResult<T>> {
      return client.requestJson<T>(`/api/customer/addresses/${encodeURIComponent(id)}`, {
        method: "GET",
      });
    },
    create<T = unknown>(body: unknown): Promise<ApiResult<T>> {
      return client.requestJson<T>("/api/customer/addresses", {
        method: "POST",
        json: body,
      });
    },
    update<T = unknown>(id: string, body: unknown): Promise<ApiResult<T>> {
      return client.requestJson<T>(`/api/customer/addresses/${encodeURIComponent(id)}`, {
        method: "PATCH",
        json: body,
      });
    },
    remove<T = unknown>(id: string): Promise<ApiResult<T>> {
      return client.requestJson<T>(`/api/customer/addresses/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
    },
  };
}

export type CustomerAddressesApi = ReturnType<typeof createCustomerAddressesApi>;

export function createCustomerInvoicesApi(client: ApiClient) {
  return {
    list<T = unknown>(): Promise<ApiResult<T>> {
      return client.requestJson<T>("/api/customer/invoices", { method: "GET" });
    },
    monthlyPdfUrl(invoiceId: string): string {
      return `/api/customer/invoices/monthly/${encodeURIComponent(invoiceId)}/pdf`;
    },
    bookingPdfUrl(bookingId: string): string {
      return `/api/customer/invoices/booking/${encodeURIComponent(bookingId)}/pdf`;
    },
  };
}

export type CustomerInvoicesApi = ReturnType<typeof createCustomerInvoicesApi>;
