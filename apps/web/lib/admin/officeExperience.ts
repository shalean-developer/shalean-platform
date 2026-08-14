import type { AdminPermission } from "@/lib/admin/requirePermission";

export type OfficeRoleKey = "owner" | "manager" | "operations" | "finance" | "customer-care" | "workforce" | "marketing" | "supervisor" | "restricted";
export type OfficeAccessPolicy = { path: string; anyOf: AdminPermission[]; audience: OfficeRoleKey[] };

/** Single source of truth for page visibility, sidebar navigation and command search. More-specific prefixes must appear first. */
export const OFFICE_ACCESS_POLICIES: OfficeAccessPolicy[] = [
  { path: "/office/payouts/approvals", anyOf: ["payout.approve"], audience: ["owner"] },
  { path: "/office/payouts/phase15a-diagnostics", anyOf: ["payout.release", "audit.view"], audience: ["owner"] },
  { path: "/office/payouts/runs", anyOf: ["payout.view"], audience: ["owner", "manager", "finance"] },
  { path: "/office/cleaners/manage", anyOf: ["cleaner.edit"], audience: ["owner", "manager", "workforce"] },
  { path: "/office/cleaners", anyOf: ["cleaner.view"], audience: ["owner", "manager", "operations", "workforce", "supervisor"] },
  { path: "/office/inventory", anyOf: ["expense.manage", "booking.assign", "finance.full.view"], audience: ["owner", "manager", "operations", "finance"] },
  { path: "/office/transport", anyOf: ["booking.assign", "expense.manage", "booking.view"], audience: ["owner", "manager", "operations", "finance", "supervisor"] },
  { path: "/office/customers/create", anyOf: ["customer.edit"], audience: ["owner", "manager", "operations", "customer-care"] },
  { path: "/office/customers", anyOf: ["customer.view"], audience: ["owner", "manager", "operations", "customer-care"] },
  { path: "/office/bookings/create", anyOf: ["booking.create"], audience: ["owner", "manager", "operations", "customer-care"] },
  { path: "/office/bookings", anyOf: ["booking.view"], audience: ["owner", "manager", "operations", "customer-care", "supervisor"] },
  { path: "/office/blog/new", anyOf: ["content.draft"], audience: ["owner", "manager", "marketing"] },
  { path: "/office/blog", anyOf: ["content.draft", "content.publish"], audience: ["owner", "manager", "marketing"] },
  { path: "/office/invoices", anyOf: ["invoice.manage"], audience: ["owner", "manager", "finance"] },
  { path: "/office/sales-documents/create", anyOf: ["invoice.manage"], audience: ["owner", "finance"] },
  { path: "/office/sales-documents", anyOf: ["invoice.manage", "customer.contact", "marketing.view"], audience: ["owner", "manager", "finance", "customer-care", "marketing"] },
  { path: "/office/templates/editor", anyOf: ["template.manage"], audience: ["owner", "manager", "operations", "marketing"] },
  { path: "/office/templates", anyOf: ["template.manage"], audience: ["owner", "manager", "operations", "marketing"] },

  { path: "/office/payouts", anyOf: ["payout.view"], audience: ["owner", "manager", "finance"] },
  { path: "/office/payout-batches", anyOf: ["payout.view"], audience: ["owner", "manager", "finance"] },
  { path: "/office/payout-runs", anyOf: ["payout.view"], audience: ["owner", "manager", "finance"] },
  { path: "/office/earnings-policies", anyOf: ["payout.prepare"], audience: ["owner", "manager", "finance"] },
  { path: "/office/financial-dashboard", anyOf: ["finance.summary.view", "finance.full.view"], audience: ["owner", "manager", "finance"] },
  { path: "/office/business-health", anyOf: ["finance.summary.view", "finance.full.view"], audience: ["owner", "manager", "finance"] },
  { path: "/office/cash-flow", anyOf: ["finance.full.view"], audience: ["owner", "finance"] },
  { path: "/office/budgets", anyOf: ["finance.full.view"], audience: ["owner", "finance"] },
  { path: "/office/booking-profitability", anyOf: ["profit.view"], audience: ["owner", "finance"] },
  { path: "/office/expenses", anyOf: ["expense.manage", "finance.full.view"], audience: ["owner", "finance"] },
  { path: "/office/recurring-expenses", anyOf: ["expense.manage", "finance.full.view"], audience: ["owner", "finance"] },
  { path: "/office/expense-vendors", anyOf: ["expense.manage", "finance.full.view"], audience: ["owner", "finance"] },
  { path: "/office/expense-reports", anyOf: ["finance.summary.view", "finance.full.view"], audience: ["owner", "manager", "finance"] },
  { path: "/office/payment-reconciliation", anyOf: ["payment.reconcile"], audience: ["owner", "manager", "finance"] },
  { path: "/office/referral-finance", anyOf: ["finance.full.view"], audience: ["owner", "finance"] },
  { path: "/office/referral-reconciliation", anyOf: ["payment.reconcile"], audience: ["owner", "manager", "finance"] },
  { path: "/office/referral-fraud", anyOf: ["finance.full.view", "audit.view"], audience: ["owner", "finance"] },
  { path: "/office/reporting", anyOf: ["finance.summary.view"], audience: ["owner", "manager", "finance"] },
  { path: "/office/billing", anyOf: ["invoice.manage", "integration.manage"], audience: ["owner", "finance"] },
  { path: "/office/zoho-integration", anyOf: ["integration.manage"], audience: ["owner"] },
  { path: "/office/pricing", anyOf: ["pricing.manage"], audience: ["owner"] },
  { path: "/office/security", anyOf: ["role.manage", "audit.view"], audience: ["owner"] },
  { path: "/office/admin-users", anyOf: ["user.manage", "role.manage"], audience: ["owner"] },

  { path: "/office/recurring", anyOf: ["booking.view"], audience: ["owner", "manager", "operations", "customer-care", "supervisor"] },
  { path: "/office/schedule", anyOf: ["booking.view", "team.view"], audience: ["owner", "manager", "operations", "workforce", "supervisor"] },
  { path: "/office/cleaner-applications", anyOf: ["application.decide"], audience: ["owner", "manager", "workforce"] },
  { path: "/office/cleaner-performance", anyOf: ["cleaner.view", "team.view"], audience: ["owner", "manager", "operations", "workforce", "supervisor"] },
  { path: "/office/cleaner-report-feedback", anyOf: ["cleaner.view", "incident.manage"], audience: ["owner", "manager", "operations", "workforce", "supervisor"] },
  { path: "/office/teams", anyOf: ["team.view"], audience: ["owner", "manager", "operations", "workforce", "supervisor"] },
  { path: "/office/disputes", anyOf: ["dispute.resolve"], audience: ["owner", "manager", "operations"] },

  { path: "/office/reviews", anyOf: ["customer.view", "marketing.view"], audience: ["owner", "manager", "customer-care", "marketing"] },
  { path: "/office/review-funnel", anyOf: ["customer.view", "marketing.view"], audience: ["owner", "manager", "customer-care", "marketing"] },

  { path: "/office/marketing", anyOf: ["marketing.view", "content.draft", "content.publish"], audience: ["owner", "manager", "marketing"] },
  { path: "/office/promotions", anyOf: ["marketing.view", "content.publish"], audience: ["owner", "manager", "marketing"] },
  { path: "/office/referrals", anyOf: ["marketing.view"], audience: ["owner", "manager", "marketing"] },
  { path: "/office/analytics", anyOf: ["marketing.view", "finance.summary.view"], audience: ["owner", "manager", "finance", "marketing"] },
  { path: "/office/funnel-intelligence", anyOf: ["marketing.view"], audience: ["owner", "manager", "marketing"] },
  { path: "/office/conversion", anyOf: ["marketing.view"], audience: ["owner", "manager", "marketing"] },
  { path: "/office/seo-insights", anyOf: ["marketing.view"], audience: ["owner", "manager", "marketing"] },
  { path: "/office/seo-attribution", anyOf: ["marketing.view"], audience: ["owner", "manager", "marketing"] },

  { path: "/office/communications", anyOf: ["notification.send"], audience: ["owner", "manager", "operations", "customer-care", "marketing"] },
  { path: "/office/notifications", anyOf: ["notification.send", "system.notifications"], audience: ["owner", "manager", "operations", "customer-care", "marketing"] },
  { path: "/office/notification-logs", anyOf: ["system.logs", "notification.send"], audience: ["owner", "manager", "operations", "customer-care"] },
  { path: "/office/email-operations", anyOf: ["system.notifications", "notification.send"], audience: ["owner", "manager", "operations", "marketing"] },
  { path: "/office/lifecycle-emails", anyOf: ["notification.send", "template.manage"], audience: ["owner", "manager", "operations", "marketing"] },
  { path: "/office/ops-health", anyOf: ["ops.health.view"], audience: ["owner", "manager", "operations"] },
  { path: "/office/launch-check", anyOf: ["ops.health.view", "system.logs"], audience: ["owner", "manager", "operations"] },
  { path: "/office/sla-breaches", anyOf: ["ops.health.view", "incident.manage"], audience: ["owner", "manager", "operations"] },
  { path: "/office/ops-queue", anyOf: ["ops.health.view", "incident.manage"], audience: ["owner", "manager", "operations"] },
  { path: "/office/metrics", anyOf: ["ops.health.view"], audience: ["owner", "manager", "operations"] },
  { path: "/office/operations", anyOf: ["ops.health.view", "booking.assign"], audience: ["owner", "manager", "operations"] },
];

export function policyForOfficePath(pathname: string): OfficeAccessPolicy | null {
  return OFFICE_ACCESS_POLICIES.find(({ path }) => pathname === path || pathname.startsWith(`${path}/`)) ?? null;
}

export function hasAnyOfficePermission(permissions: ReadonlySet<string> | readonly string[], required: readonly AdminPermission[]): boolean {
  const set = permissions instanceof Set ? permissions : new Set(permissions);
  return required.some((permission) => set.has(permission));
}

export function inferOfficeRole(permissions: ReadonlySet<string> | readonly string[]): OfficeRoleKey {
  const set = permissions instanceof Set ? permissions : new Set(permissions);
  if (set.has("role.manage") && set.has("system.settings")) return "owner";
  if (set.has("refund.approve.low") && set.has("finance.summary.view") && set.has("ops.health.view")) return "manager";
  if (set.has("finance.full.view") || set.has("expense.manage") || set.has("payment.reconcile")) return "finance";
  if (set.has("booking.assign") && set.has("ops.health.view")) return "operations";
  if (set.has("application.decide") || (set.has("cleaner.edit") && set.has("team.manage"))) return "workforce";
  if (set.has("marketing.view") || set.has("content.draft") || set.has("content.publish")) return "marketing";
  if (set.has("customer.contact") || set.has("refund.request")) return "customer-care";
  if (set.has("team.assign") || (set.has("team.view") && set.has("booking.view"))) return "supervisor";
  return "restricted";
}
