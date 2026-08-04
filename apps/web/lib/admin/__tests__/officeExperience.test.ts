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

const ROLE_PERMISSIONS = {
  owner: ["role.manage", "system.settings", "booking.view", "customer.view", "cleaner.view", "team.view", "finance.full.view", "finance.summary.view", "expense.manage", "invoice.manage", "payment.reconcile", "profit.view", "payout.view", "payout.approve", "payout.release", "marketing.view", "content.draft", "content.publish", "notification.send", "template.manage", "ops.health.view", "pricing.manage", "integration.manage", "audit.view"],
  manager: ["refund.approve.high", "finance.summary.view", "ops.health.view", "booking.view", "booking.assign", "customer.view", "customer.contact", "cleaner.view", "team.view", "payout.view", "payout.approve", "notification.send", "incident.manage"],
  operations: ["booking.view", "booking.assign", "customer.view", "customer.contact", "cleaner.view", "team.view", "notification.send", "incident.manage", "ops.health.view"],
  finance: ["finance.summary.view", "finance.full.view", "expense.manage", "invoice.manage", "payment.reconcile", "profit.view", "payout.view", "payout.prepare"],
  "customer-care": ["booking.view", "customer.view", "customer.contact", "refund.request", "notification.send"],
  workforce: ["cleaner.view", "cleaner.edit", "team.view", "team.manage", "application.decide", "booking.view"],
  marketing: ["marketing.view", "content.draft", "content.publish", "notification.send"],
  supervisor: ["booking.view", "cleaner.view", "team.view", "team.assign"],
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

  it("infers all eight role experiences", () => {
    for (const [role, permissions] of Object.entries(ROLE_PERMISSIONS)) expect(inferOfficeRole(new Set(permissions)), role).toBe(role);
  });

  it("keeps Supervisor isolated from customer, finance, security and marketing", () => {
    const supervisor = new Set(ROLE_PERMISSIONS.supervisor);
    expect(hasAnyOfficePermission(supervisor, policyForOfficePath("/office/schedule")!.anyOf)).toBe(true);
    for (const path of ["/office/customers", "/office/cash-flow", "/office/security", "/office/marketing"]) {
      expect(hasAnyOfficePermission(supervisor, policyForOfficePath(path)!.anyOf), path).toBe(false);
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
