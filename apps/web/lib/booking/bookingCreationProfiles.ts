export type BookingCreationProfile =
  | "customer_pending_payment"
  | "dashboard_monthly"
  | "widget_draft"
  | "recurring_unpaid"
  | "recurring_prepaid"
  | "recurring_monthly";

export function bookingCreationLifecyclePatch(profile: BookingCreationProfile): Record<string, unknown> {
  switch (profile) {
    case "customer_pending_payment":
      return { status: "pending_payment", dispatch_status: "searching", amount_paid_cents: 0, currency: "ZAR" };
    case "dashboard_monthly":
      return { status: "pending", dispatch_status: "searching", amount_paid_cents: 0, currency: "ZAR" };
    case "widget_draft":
      return { status: "pending", dispatch_status: "searching", amount_paid_cents: 0, total_paid_cents: 0, currency: "ZAR" };
    case "recurring_unpaid":
      return { status: "pending_payment", dispatch_status: "searching", payment_status: "pending", is_recurring_generated: true, currency: "ZAR" };
    case "recurring_prepaid":
      return { status: "pending", dispatch_status: "searching", payment_status: "success", is_recurring_generated: true, billing_type: "prepaid", currency: "ZAR" };
    case "recurring_monthly":
      return { status: "pending", dispatch_status: "searching", payment_status: "pending_monthly", is_recurring_generated: true, is_monthly_billing_booking: true, billing_type: "recurring_invoice", currency: "ZAR" };
  }
}
