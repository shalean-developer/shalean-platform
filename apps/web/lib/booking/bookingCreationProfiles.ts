export type BookingCreationProfile =
  | "customer_pending_payment"
  | "dashboard_monthly"
  | "widget_draft"
  | "recurring_unpaid"
  | "recurring_prepaid"
  | "recurring_monthly"
  | "paystack_paid"
  | "paystack_paid_selected_cleaner"
  | "admin_payment_received"
  | "admin_monthly";

export type BookingCreationLifecyclePatch = {
  status?: string;
  dispatch_status?: string;
  payment_status?: string;
  amount_paid_cents?: number;
  total_paid_cents?: number;
  currency?: string;
  is_recurring_generated?: boolean;
  is_monthly_billing_booking?: boolean;
  billing_type?: string;
};

export function bookingCreationLifecyclePatch(profile: BookingCreationProfile): BookingCreationLifecyclePatch {
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
    case "paystack_paid":
      return { status: "pending", dispatch_status: "searching" };
    case "paystack_paid_selected_cleaner":
      return { status: "pending_assignment", dispatch_status: "searching" };
    case "admin_payment_received":
      return { is_monthly_billing_booking: false, payment_status: "pending", billing_type: "per_booking" };
    case "admin_monthly":
      return { is_monthly_billing_booking: true, payment_status: "pending_monthly", billing_type: "recurring_invoice" };
  }
}
