import type { NotificationFailureClass } from "@/lib/notifications/retryContract";
import type { ExpoPushTicket } from "@/lib/push/expoPushTypes";

export type ExpoPushErrorCategory =
  | "success"
  | "device_not_registered"
  | "message_too_big"
  | "rate_limited"
  | "transient_provider"
  | "permanent_provider"
  | "authorization"
  | "malformed";

export function classifyExpoHttpStatus(httpStatus: number): ExpoPushErrorCategory {
  if (httpStatus === 429) return "rate_limited";
  if (httpStatus === 401 || httpStatus === 403) return "authorization";
  if (httpStatus >= 500) return "transient_provider";
  if (httpStatus >= 400) return "permanent_provider";
  return "transient_provider";
}

/**
 * Classify Expo ticket / HTTP failure into operator-facing category + retry class.
 */
export function classifyExpoPushFailure(params: {
  httpStatus?: number | null;
  ticket?: ExpoPushTicket | null;
  transportError?: string | null;
}): { category: ExpoPushErrorCategory; failureClass: NotificationFailureClass } {
  const ticketErr = String(params.ticket?.details?.error ?? params.ticket?.message ?? "")
    .trim()
    .toLowerCase();

  if (ticketErr.includes("devicenotregistered") || ticketErr === "device_not_registered") {
    return { category: "device_not_registered", failureClass: "invalid_recipient" };
  }
  if (ticketErr.includes("messagetoobig") || ticketErr === "message_too_big") {
    return { category: "message_too_big", failureClass: "permanent_validation" };
  }
  if (
    ticketErr.includes("messagerateexceeded") ||
    ticketErr.includes("rate") ||
    params.httpStatus === 429
  ) {
    return { category: "rate_limited", failureClass: "transient" };
  }

  if (params.httpStatus != null && params.httpStatus > 0) {
    const category = classifyExpoHttpStatus(params.httpStatus);
    if (category === "authorization") {
      return { category, failureClass: "authorization" };
    }
    if (category === "rate_limited" || category === "transient_provider") {
      return { category, failureClass: "transient" };
    }
    return { category, failureClass: "permanent" };
  }

  const transport = String(params.transportError ?? "").toLowerCase();
  if (transport.includes("timeout") || transport.includes("network") || transport.includes("econn")) {
    return { category: "transient_provider", failureClass: "transient" };
  }
  if (transport.includes("malformed") || transport.includes("invalid")) {
    return { category: "malformed", failureClass: "permanent_validation" };
  }

  return { category: "transient_provider", failureClass: "transient" };
}

export function expoFailureClassToLogCategory(
  category: ExpoPushErrorCategory,
): string {
  return category;
}
