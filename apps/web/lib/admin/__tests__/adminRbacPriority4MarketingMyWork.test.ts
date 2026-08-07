import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { canReceiveOfficeWorkItem, type OfficeWorkItem } from "@/lib/admin/officeWorkItems";

const webRoot = resolve(process.cwd());
const read = (path: string) => readFileSync(resolve(webRoot, path), "utf8");

const blogDraft: OfficeWorkItem = {
  id: "marketing.blog_draft:1",
  type: "marketing.blog_draft",
  title: "Blog draft ready to continue",
  summary: "/blog/example",
  priority: "medium",
  status: "open",
  href: "/office/blog?post=1",
  actionLabel: "Continue draft",
  requiredPermission: "content.draft",
  occurredAt: null,
  dueAt: null,
  branchId: null,
  teamId: null,
};

const campaignReady: OfficeWorkItem = {
  ...blogDraft,
  id: "marketing.campaign_ready:1",
  type: "marketing.campaign_ready",
  href: "/office/marketing?content=1",
  requiredPermission: "content.publish",
  actionLabel: "Review campaign",
};

describe("Admin RBAC Priority 4 Marketing My Work queue", () => {
  it("requires exact content permissions and safe Office destinations", () => {
    expect(canReceiveOfficeWorkItem(blogDraft, new Set(["content.draft"]))).toBe(true);
    expect(canReceiveOfficeWorkItem(blogDraft, new Set(["marketing.view"]))).toBe(false);
    expect(canReceiveOfficeWorkItem(campaignReady, new Set(["content.publish"]))).toBe(true);
    expect(canReceiveOfficeWorkItem(campaignReady, new Set(["content.draft"]))).toBe(false);
    expect(canReceiveOfficeWorkItem({ ...campaignReady, href: "/office/security" }, new Set(["content.publish"]))).toBe(false);
  });

  it("uses trusted draft and ready-content sources without widening access", () => {
    const source = read("app/api/admin/my-work/route.ts");
    expect(source).toContain('.from("blog_posts")');
    expect(source).toContain('.eq("status", "draft")');
    expect(source).toContain('requiredPermission: "content.draft"');
    expect(source).toContain('.from("campaign_content")');
    expect(source).toContain('.eq("status", "ready")');
    expect(source).toContain('requiredPermission: "content.publish"');
  });

  it("preserves Finance, Workforce, and Customer Care queues", () => {
    const source = read("app/api/admin/my-work/route.ts");
    expect(source).toContain('type: "finance.invoice_overdue"');
    expect(source).toContain('type: "workforce.application"');
    expect(source).toContain('type: "customer_care.whatsapp_reply"');
  });

  it("keeps Marketing work data operational rather than exposing campaign bodies", () => {
    const source = read("app/api/admin/my-work/route.ts");
    expect(source).toContain('select("id,title,channel,status,created_at,updated_at")');
    expect(source).not.toContain('campaign_content").select("id,title,body');
    expect(source).not.toContain('campaign_content").select("id,title,html_body');
  });
});
