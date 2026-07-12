/**
 * Map push / inbox payload fields to an in-app Expo Router path.
 * Accepts both camelCase and snake_case keys used by server senders.
 */
export function resolveCustomerNotificationDeepLink(
  data: Record<string, unknown> | undefined | null,
): string | null {
  if (!data || typeof data !== "object") return null;

  const pathRaw =
    typeof data.path === "string"
      ? data.path.trim()
      : typeof data.deep_link === "string"
        ? data.deep_link.trim()
        : "";
  if (pathRaw.startsWith("/")) {
    // Block absolute URLs disguised as paths
    if (pathRaw.startsWith("//") || pathRaw.includes("://")) return null;
    return pathRaw;
  }

  const bookingId =
    (typeof data.booking_id === "string" && data.booking_id.trim()) ||
    (typeof data.bookingId === "string" && data.bookingId.trim()) ||
    "";

  const type =
    (typeof data.type === "string" && data.type.trim().toLowerCase()) ||
    (typeof data.event === "string" && data.event.trim().toLowerCase()) ||
    "";

  if (bookingId) {
    if (
      type === "en_route" ||
      type === "en-route" ||
      type === "arrived" ||
      type === "track" ||
      type === "cleaner_en_route" ||
      type === "cleaner_arrived"
    ) {
      return `/bookings/${bookingId}/track`;
    }
    if (type === "review" || type === "review_request" || type === "leave_review") {
      return `/bookings/${bookingId}/review`;
    }
    if (
      type === "payment" ||
      type === "payment_failed" ||
      type === "payment_due" ||
      type === "pay"
    ) {
      return `/bookings/${bookingId}`;
    }
    return `/bookings/${bookingId}`;
  }

  if (type === "invoices" || type === "invoice") {
    return "/profile/invoices";
  }
  if (type === "notifications" || type === "inbox") {
    return "/profile/notifications";
  }
  if (type === "rewards" || type === "referral" || type === "referrals") {
    return "/(tabs)/rewards";
  }

  return null;
}
