/**
 * Wire to PostHog / Segment when ready. Safe to call from client; no-ops by default.
 */
export function trackAdminBillingSwitchClicked(payload: {
  customer_id: string;
  action: "open_modal" | "confirm" | "preview_fetch";
  billing_to?: string;
}): void {
  if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
    console.debug("[analytics:admin_billing_switch]", payload);
  }
}
