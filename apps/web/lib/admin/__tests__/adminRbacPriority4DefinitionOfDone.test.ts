import { describe, expect, it } from "vitest";
import { hasAnyOfficePermission, policyForOfficePath } from "@/lib/admin/officeExperience";
import { canReceiveOfficeWorkItem, type OfficeWorkItem } from "@/lib/admin/officeWorkItems";

const ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  owner: ["application.decide", "audit.view", "booking.assign", "booking.cancel", "booking.create", "booking.edit", "booking.export", "booking.view", "branch.manage", "branch.view", "bulk_export.approve", "cleaner.bank.view", "cleaner.documents.view", "cleaner.edit", "cleaner.view", "content.draft", "content.publish", "customer.contact", "customer.edit", "customer.export", "customer.view", "dispute.resolve", "expense.manage", "finance.full.view", "finance.summary.view", "incident.manage", "integration.manage", "invoice.manage", "marketing.view", "notification.send", "ops.health.view", "payment.reconcile", "payout.approve", "payout.prepare", "payout.release", "payout.view", "pricing.manage", "profit.view", "refund.approve.high", "refund.approve.low", "refund.request", "role.manage", "system.integrations", "system.logs", "system.notifications", "system.settings", "team.assign", "team.manage", "team.view", "template.manage", "user.manage"],
  manager: ["booking.assign", "booking.cancel", "booking.create", "booking.edit", "booking.view", "branch.view", "cleaner.edit", "cleaner.view", "customer.contact", "customer.edit", "customer.view", "dispute.resolve", "finance.summary.view", "incident.manage", "notification.send", "ops.health.view", "payout.prepare", "payout.view", "refund.approve.low", "refund.request", "team.assign", "team.manage", "team.view"],
  operations: ["booking.assign", "booking.cancel", "booking.create", "booking.edit", "booking.view", "branch.view", "cleaner.view", "customer.contact", "customer.edit", "customer.view", "incident.manage", "notification.send", "ops.health.view", "refund.request", "team.assign", "team.view"],
  finance: ["branch.view", "expense.manage", "finance.full.view", "finance.summary.view", "invoice.manage", "payment.reconcile", "payout.prepare", "payout.view", "profit.view", "refund.request"],
  "customer-care": ["booking.edit", "booking.view", "branch.view", "customer.contact", "customer.edit", "customer.view", "incident.manage", "refund.request"],
  workforce: ["application.decide", "branch.view", "cleaner.documents.view", "cleaner.edit", "cleaner.view", "team.assign", "team.manage", "team.view"],
  marketing: ["branch.view", "content.draft", "marketing.view"],
  supervisor: ["booking.assign", "booking.view", "cleaner.view", "incident.manage", "team.assign", "team.view"],
};

const base: Omit<OfficeWorkItem, "id" | "type" | "href" | "requiredPermission"> = {
  title: "UAT work item",
  summary: "Permission matrix contract",
  priority: "medium",
  status: "open",
  actionLabel: "Review",
  occurredAt: null,
  dueAt: null,
  branchId: null,
  teamId: null,
};

const WORK_ITEMS: Record<string, OfficeWorkItem> = {
  booking: { ...base, id: "booking.assignment:uat", type: "booking.assignment", href: "/office/bookings/uat", requiredPermission: "booking.assign" },
  cron: { ...base, id: "system.cron:uat", type: "system.cron", href: "/office/ops-health", requiredPermission: "ops.health.view" },
  invoice: { ...base, id: "finance.invoice_overdue:uat", type: "finance.invoice_overdue", href: "/office/invoices/uat", requiredPermission: "finance.full.view" },
  payout: { ...base, id: "finance.payout_prepare:uat", type: "finance.payout_prepare", href: "/office/payouts", requiredPermission: "payout.prepare" },
  workforce: { ...base, id: "workforce.application:uat", type: "workforce.application", href: "/office/cleaner-applications?application=uat", requiredPermission: "application.decide" },
  care: { ...base, id: "customer_care.whatsapp_reply:uat", type: "customer_care.whatsapp_reply", href: "/office/notifications?conversation=uat", requiredPermission: "customer.contact" },
  blog: { ...base, id: "marketing.blog_draft:uat", type: "marketing.blog_draft", href: "/office/blog?post=uat", requiredPermission: "content.draft" },
  campaign: { ...base, id: "marketing.campaign_ready:uat", type: "marketing.campaign_ready", href: "/office/marketing?content=uat", requiredPermission: "content.publish" },
};

const EXPECTED_WORK: Record<string, readonly string[]> = {
  owner: ["booking", "cron", "invoice", "payout", "workforce", "care", "blog", "campaign"],
  manager: ["booking", "cron", "payout", "care"],
  operations: ["booking", "cron", "care"],
  finance: ["invoice", "payout"],
  "customer-care": ["care"],
  workforce: ["workforce"],
  marketing: ["blog"],
  supervisor: ["booking"],
};

function canVisit(role: string, path: string): boolean {
  const policy = policyForOfficePath(path);
  if (!policy) return false;
  return policy.audience.includes(role as never) && hasAnyOfficePermission(new Set(ROLE_PERMISSIONS[role]), policy.anyOf);
}

describe("Admin RBAC Priority 4 definition of done", () => {
  it("covers exactly the eight governed production roles", () => {
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual(Object.keys(EXPECTED_WORK).sort());
    expect(Object.keys(ROLE_PERMISSIONS)).toHaveLength(8);
  });

  it("delivers only the role-specific My Work types supported by production grants", () => {
    for (const [role, permissions] of Object.entries(ROLE_PERMISSIONS)) {
      const allowed = Object.entries(WORK_ITEMS)
        .filter(([, item]) => canReceiveOfficeWorkItem(item, new Set(permissions)))
        .map(([key]) => key);
      expect(allowed.sort(), role).toEqual([...EXPECTED_WORK[role]].sort());
    }
  });

  it("fails closed when a work item lies about its permission or destination", () => {
    const owner = new Set(ROLE_PERMISSIONS.owner);
    for (const item of Object.values(WORK_ITEMS)) {
      expect(canReceiveOfficeWorkItem({ ...item, requiredPermission: "system.settings" }, owner), item.id).toBe(false);
      expect(canReceiveOfficeWorkItem({ ...item, href: "/office/security" }, owner), item.id).toBe(false);
    }
  });

  it("keeps non-finance roles away from company financial administration", () => {
    for (const role of ["operations", "customer-care", "workforce", "marketing", "supervisor"]) {
      expect(canVisit(role, "/office/cash-flow"), role).toBe(false);
      expect(canVisit(role, "/office/booking-profitability"), role).toBe(false);
      expect(canVisit(role, "/office/payment-reconciliation"), role).toBe(false);
    }
  });

  it("keeps Marketing and Supervisor away from customer administration", () => {
    for (const role of ["marketing", "supervisor"]) {
      expect(canVisit(role, "/office/customers"), role).toBe(false);
      expect(canVisit(role, "/office/customers/create"), role).toBe(false);
    }
  });

  it("keeps Customer Care, Workforce, Marketing and Supervisor away from security administration", () => {
    for (const role of ["customer-care", "workforce", "marketing", "supervisor"]) {
      expect(canVisit(role, "/office/security"), role).toBe(false);
      expect(canVisit(role, "/office/admin-users"), role).toBe(false);
    }
  });

  it("does not grant campaign publishing work to Marketing without content.publish", () => {
    expect(ROLE_PERMISSIONS.marketing).not.toContain("content.publish");
    expect(canReceiveOfficeWorkItem(WORK_ITEMS.campaign, new Set(ROLE_PERMISSIONS.marketing))).toBe(false);
    expect(canReceiveOfficeWorkItem(WORK_ITEMS.blog, new Set(ROLE_PERMISSIONS.marketing))).toBe(true);
  });

  it("keeps Supervisor assignment work dependent on the scoped booking read model", () => {
    expect(ROLE_PERMISSIONS.supervisor).toContain("booking.assign");
    expect(canReceiveOfficeWorkItem(WORK_ITEMS.booking, new Set(ROLE_PERMISSIONS.supervisor))).toBe(true);
    expect(canVisit("supervisor", "/office/customers")).toBe(false);
    expect(canVisit("supervisor", "/office/cash-flow")).toBe(false);
  });
});
