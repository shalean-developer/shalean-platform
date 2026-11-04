import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("CF-02 staging bank sync route safety", () => {
  it("checks nonproduction isolation before creating an admin database client", () => {
    const route = readFileSync(join(process.cwd(), "app/api/admin/finance-accounts/zoho-sync/route.ts"), "utf8");
    const start = route.indexOf("export async function POST");
    const body = route.slice(start);
    const guard = body.indexOf("isZohoBooksWriteBlocked(process.env.SHALEAN_APP_ENV)");
    const db = body.indexOf("const admin = getSupabaseAdmin()");
    const sync = body.indexOf("syncZohoBankBalance(admin");
    expect(start).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(db);
    expect(db).toBeLessThan(sync);
    expect(body).toContain("zoho_bank_sync_blocked_nonproduction");
  });
  it("rejects staging account audit cron before list reads or retry database work", () => {
    const route = readFileSync(join(process.cwd(), "app/api/cron/zoho-expense-accounts-audit/route.ts"), "utf8");
    const post = route.slice(route.indexOf("export async function POST("));
    const guard = post.indexOf("isZohoBooksWriteBlocked(process.env.SHALEAN_APP_ENV)");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(post.indexOf("getSupabaseAdmin()"));
    expect(guard).toBeLessThan(post.indexOf("listZohoExpenseAccounts()"));
    expect(post).toContain("zoho_account_audit_blocked_nonproduction");
  });

});
