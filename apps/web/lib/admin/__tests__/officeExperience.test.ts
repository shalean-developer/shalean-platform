import { describe, expect, it } from "vitest";
import { OFFICE_ACCESS_POLICIES, hasAnyOfficePermission, inferOfficeRole, policyForOfficePath } from "@/lib/admin/officeExperience";

const INVENTORIED_PAGE_PATHS = [
  "/office/analytics", "/office/billing", "/office/blog", "/office/blog/new", "/office/blog/example", "/office/booking-profitability",
  "/office/bookings", "/office/bookings/create", "/office/bookings/example", "/office/budgets", "/office/business-health", "/office/cash-flow",
  "/office/cleaner-applications", "/office/cleaner-performance", "/office/cleaner-report-feedback", "/office/cleaners", "/office/cleaners/manage",
  "/office/cleaners/example", "/office/cleaners/example/payouts", "/office/conversion", "/office/customers", "/office/customers/create",
  "/office/customers/example", "/office/disputes", "/office/earnings-policies", "/office/expense-reports", "/office/expense-vendors",
  "/office/expenses", "/office/financial-dashboard", "/office/funnel-intelligence", "/office/invoices", "/office/invoices/example",
  "/office/launch-check", "/office/lifecycle-emails", "/office/marketing", "/office/marketing/analytics", "/office/marketing/assets",
  "/office/marketing/campaigns", "/office/marketing/connected-accounts", "/office/marketing/email", "/office/marketing/intelligence",
  "/office/marketing/landing-pages", "/office/marketing/social", "/office/marketing/templates", "/office/metrics", "/office/notification-logs",
  "/office/notifications", "/office/operations", "/office/ops-health", "/office/ops-queue", "/office/payment-reconciliation",
  "/office/payout-batches", "/office/payout-runs", "/office/payouts", "/office/payouts/approvals", "/office/payouts/phase15a-diagnostics",
  "/office/payouts/runs/example", "/office/pricing", "/office/promotions", "/office/recurring", "/office/recurring-expenses",
  "/office/referral-finance", "/office/referral-fraud", "/office/referral-reconciliation", "/office/referrals", "/office/reporting",
  "/office/review-funnel", "/office/reviews", "/office/sales-documents", "/office/sales-documents/create", "/office/sales-documents/example",
  "/office/schedule", "/office/security", "/office/seo-attribution", "/office/seo-insights", "/office/sla-breaches", "/office/teams",
  "/office/templates", "/office/templates/editor", "/office/zoho-integration", "/office/communications", "/office/email-operations",
  "/office/email-operations/campaigns", "/office/email-operations/health", "/office/email-operations/retry", "/office/email-operations/timeline",
];

// Mirrors the active production role grants. Keep this fixture aligned with the
// governed admin role matrix so role-experience tests cannot pass on invented
// permissions that real admins do not have.
const ROLE_PERMISSIONS = {
  owner: ["application.decide", "audit.view", "booking.assign", "booking.cancel", "booking.create", "booking.edit", "booking.export", "booking.view", "branch.manage", "branch.view", "bulk_export.approve", "cleaner.bank.view", "cleaner.documents.view", "cleaner.edit", "cleaner.view", "content.draft", "content.publish", "customer.contact", "customer.edit", "customer.export", "customer.view", "dispute.resolve", "expense.manage", "finance.full.view", "finance.summary.view", "incident.manage", "integration.manage", "invoice.manage", "marketing.view", "notification.send", "ops.health.view", "payment.reconcile", "payout.approve", "payout.prepare", "payout.release", "payout.view", "pricing.manage", "profit.view", "refund.approve.high", "refund.approve.low", "refund.request", "role.manage", "system.integrations", "system.logs", "system.notifications", "system.settings", "team.assign", "team.manage", "team.view", "template.manage", "user.manage"],
  manager: ["booking.assign", "booking.cancel", "booking.create", "booking.edit", "booking.view", "branch.view", "cleaner.edit", "cleaner.view", "customer.contact", "customer.edit", "customer.view", "dispute.resolve", "finance.summary.view", "incident.manage", "notification.send", "ops.health.view", "payout.prepare", "payout.view", "refund.approve.low", "refund.request", "team.assign", "team.manage", "team.view"],
  operations: ["booking.assign", "booking.cancel", "booking.create", "booking.edit", "booking.view", "branch.view", "cleaner.view", "customer.contact", "customer.edit", "customer.view", "incident.manage", "notification.send", "ops.health.view", "refund.request", "team.assign", "team.view"],
  finance: ["branch.view", "expense.manage", "finance.full.view", "finance.summary.view", "invoice.manage", "payment.reconcile", "payout.prepare", "payout.view", "profit.view", "refund.request"],
  "customer-care": ["booking.edit", "booking.view", "branch.view", "customer.contact", "customer.edit", "customer.view", "incident.manage", "refund.request"],
  workforce: ["application.decide", "branch.view", "cleaner.documents.view", "cleaner.edit", "cleaner.view", "team.assign", "team.manage", "team.view"],
  marketing: ["branch.view", "content.draft", "marketing.view"],
  supervisor: ["booking.assign", "booking.view", "cleaner.view", "incident.manage", "team.assign", "team.view"],
} as const;

describe("role-based Office experience", () => {
  it("maps every inventoried Office page to an explicit policy", () => {
    for (const path of INVENTORIED_PAGE_PATHS) expect(policyForOfficePath(path), path).not.toBeNull();
  });

  it("maps every policy to permissions and an audience", () => {
    expect(OFFICE_ACCESS_POLICIES.length).toBeGreaterThan(55);
    for (const policy of OFFICE_ACCESS_POLICIES) {
      expect(policy.path.startsWith("/office/")).toBe(true);
      expect(policy.anyOf.length).toBeGreaterThan(0);
      expect(policy.audience.length).toBeGreaterThan(0);
    }
  });

  it("uses the most-specific matching path", () => {
    expect(policyForOfficePath("/office/payouts/approvals")?.anyOf).toEqual(["payout.approve"]);
    expect(policyForOfficePath("/office/bookings/create")?.anyOf).toEqual(["booking.create"]);
    expect(policyForOfficePath("/office/customers/create")?.anyOf).toEqual(["customer.edit"]);
  });

  it("infers all eight role experiences from the real role grants", () => {
    for (const [role, permissions] of Object.entries(ROLE_PERMISSIONS)) expect(inferOfficeRole(new Set(permissions)), role).toBe(role);
  });

  it("keeps Supervisor isolated from customer, finance, security and marketing", () => {
    const supervisor = new Set(ROLE_PERMISSIONS.supervisor);
    expect(hasAnyOfficePermission(supervisor, policyForOfficePath("/office/schedule")!.anyOf)).toBe(true);
    for (const path of ["/office/customers", "/office/cash-flow", "/office/security", "/office/marketing"]) {
      expect(hasAnyOfficePermission(supervisor, policyForOfficePath(path)!.anyOf), path).toBe(false);
    }
  });

  it("keeps company-wide operations pages outside the Supervisor audience", () => {
    for (const path of ["/office/operations", "/office/ops-queue", "/office/sla-breaches"]) {
      expect(policyForOfficePath(path)?.audience, path).not.toContain("supervisor");
    }
  });

  it("keeps Marketing away from customer PII and company finance", () => {
    const marketing = new Set(ROLE_PERMISSIONS.marketing);
    expect(hasAnyOfficePermission(marketing, policyForOfficePath("/office/blog")!.anyOf)).toBe(true);
    expect(hasAnyOfficePermission(marketing, policyForOfficePath("/office/customers")!.anyOf)).toBe(false);
    expect(hasAnyOfficePermission(marketing, policyForOfficePath("/office/financial-dashboard")!.anyOf)).toBe(false);
  });

  it("keeps Customer Care away from cleaner and finance administration", () => {
    const care = new Set(ROLE_PERMISSIONS["customer-care"]);
    expect(hasAnyOfficePermission(care, policyForOfficePath("/office/customers")!.anyOf)).toBe(true);
    expect(hasAnyOfficePermission(care, policyForOfficePath("/office/cleaners")!.anyOf)).toBe(false);
    expect(hasAnyOfficePermission(care, policyForOfficePath("/office/expenses")!.anyOf)).toBe(false);
  });
});
