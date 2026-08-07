import { describe, expect, it } from "vitest";
import { hasAnyOfficePermission, inferOfficeRole, policyForOfficePath } from "@/lib/admin/officeExperience";
import { canReceiveOfficeWorkItem, type OfficeWorkItem } from "@/lib/admin/officeWorkItems";

const roles = {
  owner: ["role.manage","system.settings","booking.view","booking.assign","customer.view","customer.contact","cleaner.view","cleaner.edit","team.view","finance.summary.view","finance.full.view","expense.manage","invoice.manage","payment.reconcile","profit.view","payout.view","payout.prepare","payout.approve","payout.release","marketing.view","content.draft","content.publish","notification.send","template.manage","ops.health.view","pricing.manage","integration.manage","audit.view"],
  manager: ["refund.approve.high","finance.summary.view","ops.health.view","booking.view","booking.assign","customer.view","customer.contact","cleaner.view","team.view","payout.view","payout.approve","notification.send","incident.manage"],
  operations: ["booking.view","booking.assign","customer.view","customer.contact","cleaner.view","team.view","notification.send","incident.manage","ops.health.view"],
  finance: ["finance.summary.view","finance.full.view","expense.manage","invoice.manage","payment.reconcile","profit.view","payout.view","payout.prepare"],
  "customer-care": ["booking.view","customer.view","customer.contact","refund.request","notification.send"],
  workforce: ["cleaner.view","cleaner.edit","team.view","team.manage","application.decide","booking.view"],
  marketing: ["marketing.view","content.draft","content.publish","notification.send"],
  supervisor: ["booking.view","cleaner.view","team.view","team.assign"],
} as const;

type Role = keyof typeof roles;
const can = (role: Role, path: string) => {
  const policy = policyForOfficePath(path);
  return Boolean(policy && hasAnyOfficePermission(new Set(roles[role]), policy.anyOf));
};

const baseItem: Omit<OfficeWorkItem,"id"|"type"|"href"|"requiredPermission"> = {
  title:"work", summary:"work", priority:"medium", status:"open", actionLabel:"Open", occurredAt:null, dueAt:null, branchId:null, teamId:null,
};
const item = (type: OfficeWorkItem["type"], href: string, requiredPermission: OfficeWorkItem["requiredPermission"]): OfficeWorkItem => ({ ...baseItem, id:`${type}:test`, type, href, requiredPermission });

describe("Priority 4 eight-role Definition of Done", () => {
  it("infers exactly the intended eight role experiences", () => {
    for (const [role, permissions] of Object.entries(roles)) expect(inferOfficeRole(new Set(permissions)), role).toBe(role);
  });

  it.each([
    ["owner", "/office/security", true], ["owner", "/office/cash-flow", true], ["owner", "/office/marketing", true],
    ["manager", "/office/security", false], ["manager", "/office/payouts/approvals", true], ["manager", "/office/ops-health", true],
    ["operations", "/office/operations", true], ["operations", "/office/cash-flow", false], ["operations", "/office/security", false],
    ["finance", "/office/cash-flow", true], ["finance", "/office/payouts", true], ["finance", "/office/customers", false],
    ["customer-care", "/office/customers", true], ["customer-care", "/office/notifications", true], ["customer-care", "/office/expenses", false],
    ["workforce", "/office/cleaner-applications", true], ["workforce", "/office/cleaners/manage", true], ["workforce", "/office/cash-flow", false],
    ["marketing", "/office/blog", true], ["marketing", "/office/marketing", true], ["marketing", "/office/customers", false],
    ["supervisor", "/office/schedule", true], ["supervisor", "/office/customers", false], ["supervisor", "/office/financial-dashboard", false],
  ] as const)("%s access to %s is %s", (role, path, expected) => expect(can(role, path)).toBe(expected));

  it("fails closed for unknown direct Office paths", () => {
    expect(policyForOfficePath("/office/unregistered-sensitive-tool")).toBeNull();
  });

  it("keeps Supervisor outside company-wide finance, customer, security and marketing", () => {
    for (const path of ["/office/cash-flow","/office/customers","/office/security","/office/marketing","/office/payouts"]) expect(can("supervisor", path), path).toBe(false);
  });

  it("enforces exact role-specific My Work permissions", () => {
    const cases: Array<[Role, OfficeWorkItem, boolean]> = [
      ["finance", item("finance.invoice_overdue","/office/invoices/1","finance.full.view"), true],
      ["finance", item("finance.payout_prepare","/office/payouts","payout.prepare"), true],
      ["workforce", item("workforce.application","/office/cleaner-applications?application=1","application.decide"), true],
      ["customer-care", item("customer_care.whatsapp_reply","/office/notifications?conversation=1","customer.contact"), true],
      ["marketing", item("marketing.blog_draft","/office/blog","content.draft"), true],
      ["marketing", item("marketing.campaign_ready","/office/marketing","content.publish"), true],
      ["supervisor", item("finance.invoice_overdue","/office/invoices/1","finance.full.view"), false],
      ["marketing", item("customer_care.whatsapp_reply","/office/notifications?conversation=1","customer.contact"), false],
      ["customer-care", item("marketing.blog_draft","/office/blog","content.draft"), false],
    ];
    for (const [role, work, expected] of cases) expect(canReceiveOfficeWorkItem(work, new Set(roles[role])), `${role}:${work.type}`).toBe(expected);
  });

  it("rejects work items that try to escape their safe destination", () => {
    expect(canReceiveOfficeWorkItem(item("finance.payout_prepare","/office/security","payout.prepare"), new Set(roles.finance))).toBe(false);
    expect(canReceiveOfficeWorkItem(item("marketing.blog_draft","/office/customers","content.draft"), new Set(roles.marketing))).toBe(false);
    expect(canReceiveOfficeWorkItem(item("customer_care.whatsapp_reply","/office/cash-flow","customer.contact"), new Set(roles["customer-care"]))).toBe(false);
  });
});
