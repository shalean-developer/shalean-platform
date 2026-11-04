import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isZohoBooksWriteBlocked } from "../../zoho/zohoWriteIsolation";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("CF-02 nonproduction accounting queue isolation", () => {
  it.each([undefined, "", "staging", "development", "preview", "test", "unknown"])(
    "blocks accounting processing when app identity is %s",
    (environment) => expect(isZohoBooksWriteBlocked(environment)).toBe(true),
  );

  it("keeps production processing available", () => {
    expect(isZohoBooksWriteBlocked("production")).toBe(false);
    expect(isZohoBooksWriteBlocked("prod")).toBe(false);
  });

  it("returns before any database read or mutation for queue processing and retry", () => {
    const src = read("lib/accounting/processAccountingSyncQueue.ts");
    const queue = src.indexOf("export async function processAccountingSyncQueue(");
    const retry = src.indexOf("export async function retryAccountingSync(", queue);
    const queueBody = src.slice(queue, retry);
    const retryBody = src.slice(retry);
    const queueGuard = queueBody.indexOf("isZohoBooksWriteBlocked(process.env.SHALEAN_APP_ENV)");
    const retryGuard = retryBody.indexOf("isZohoBooksWriteBlocked(process.env.SHALEAN_APP_ENV)");
    expect(queue).toBeGreaterThan(-1);
    expect(retry).toBeGreaterThan(queue);
    expect(queueGuard).toBeGreaterThan(-1);
    expect(retryGuard).toBeGreaterThan(-1);
    expect(queueGuard).toBeLessThan(queueBody.indexOf("loadZohoIntegrationSettings(admin)"));
    expect(queueGuard).toBeLessThan(queueBody.indexOf('.from("accounting_sync_records")'));
    expect(retryGuard).toBeLessThan(retryBody.indexOf('.from("accounting_sync_records")'));
    expect(retryBody).toContain('error: "zoho_accounting_sync_blocked_nonproduction"');
  });

  it("blocks manual and dedicated cron dispatch before acquiring any database client or lock", () => {
    const cron = read("app/api/cron/accounting-sync/route.ts");
    const admin = read("app/api/admin/zoho-integration/route.ts");
    const cronPost = cron.slice(cron.indexOf("export async function POST("));
    const adminPost = admin.slice(admin.indexOf("export async function POST("));
    const policy = "isZohoBooksWriteBlocked(process.env.SHALEAN_APP_ENV)";
    expect(cronPost.indexOf(policy)).toBeLessThan(cronPost.indexOf("getSupabaseAdmin()"));
    expect(cronPost.indexOf(policy)).toBeLessThan(cronPost.indexOf("withCronLock("));
    expect(adminPost.indexOf(policy)).toBeLessThan(adminPost.indexOf("getSupabaseAdmin()"));
    expect(cronPost).toContain("zoho_accounting_sync_blocked_nonproduction");
    expect(adminPost).toContain("zoho_accounting_sync_blocked_nonproduction");
  });

  it("preserves unrelated daily finance automation and its regular queue call", () => {
    const daily = read("app/api/cron/finance-daily-automation/route.ts");
    expect(daily).toContain("processAccountingSyncQueue(admin, 50)");
    expect(daily).toContain("persistBusinessHealthScore(admin)");
  });
});
