import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { canReceiveOfficeWorkItem, type OfficeWorkItem } from "@/lib/admin/officeWorkItems";

const webRoot = resolve(process.cwd());
const read = (path: string) => readFileSync(resolve(webRoot, path), "utf8");

const whatsappItem: OfficeWorkItem = {
  id: "customer_care.whatsapp_reply:event-1",
  type: "customer_care.whatsapp_reply",
  title: "WhatsApp customer needs a reply",
  summary: "Latest inbound message",
  priority: "high",
  status: "overdue",
  href: "/office/notifications?conversation=27821234567",
  actionLabel: "Reply on WhatsApp",
  requiredPermission: "customer.contact",
  occurredAt: "2026-08-07T10:00:00Z",
  dueAt: "2026-08-07T11:00:00Z",
  branchId: null,
  teamId: null,
};

describe("Admin RBAC Priority 4 Customer Care My Work queue", () => {
  it("requires customer.contact and a safe notifications destination", () => {
    expect(canReceiveOfficeWorkItem(whatsappItem, new Set(["customer.contact"]))).toBe(true);
    expect(canReceiveOfficeWorkItem(whatsappItem, new Set(["customer.view"]))).toBe(false);
    expect(canReceiveOfficeWorkItem({ ...whatsappItem, href: "/office/customers" }, new Set(["customer.contact"]))).toBe(false);
  });

  it("creates work only from latest unanswered inbound WhatsApp messages", () => {
    const source = read("app/api/admin/my-work/route.ts");
    expect(source).toContain('permissions.has("customer.contact")');
    expect(source).toContain('.from("whatsapp_provider_events")');
    expect(source).toContain('event.direction === "inbound"');
    expect(source).toContain('event.event_type === "message"');
    expect(source).toContain('requiredPermission: "customer.contact"');
    expect(source).toContain('/office/notifications?conversation=');
  });

  it("does not expose message body content in the My Work item", () => {
    const source = read("app/api/admin/my-work/route.ts");
    expect(source).toContain('.select("id,phone,direction,event_type,created_at")');
    expect(source).not.toContain('.select("id,phone,direction,event_type,payload');
    expect(source).toContain("maskedPhone(phone)");
  });

  it("honours branch-scoped Customer Care assignments when a customer booking can be resolved", () => {
    const source = read("app/api/admin/my-work/route.ts");
    expect(source).toContain("permissionPayload.branchIds ?? []");
    expect(source).toContain("allowedBranches.has(branchId)");
    expect(source).toContain("if (!globallyScoped && (!branchId || !allowedBranches.has(branchId))) return [];");
  });

  it("preserves Finance and Workforce My Work queues", () => {
    const source = read("app/api/admin/my-work/route.ts");
    expect(source).toContain('permissions.has("finance.full.view")');
    expect(source).toContain('permissions.has("payout.prepare")');
    expect(source).toContain('permissions.has("application.decide")');
  });
});
