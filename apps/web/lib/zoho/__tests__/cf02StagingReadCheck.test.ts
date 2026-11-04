import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("CF-02 staging Zoho Books connection read check", () => {
  const src = readFileSync(join(process.cwd(), "app/api/admin/zoho-read-check/route.ts"), "utf8");
  const body = src.slice(src.indexOf("export async function GET("));

  it("requires finance authorization and staging identity before provider access", () => {
    expect(body.indexOf("requireFinanceApi(request)")).toBeGreaterThan(-1);
    expect(body.indexOf('process.env.SHALEAN_APP_ENV?.trim().toLowerCase() !== "staging"'))
      .toBeLessThan(body.indexOf("zohoBooksClient.getWithTokenRecovery"));
  });

  it("performs only a one-page invoice read, without any accounting writes", () => {
    expect(body).toContain('getWithTokenRecovery<');
    expect(body).toContain('("/invoices?per_page=1")');
    for (const mutation of [".post(", ".put(", ".delete(", ".update(", ".insert(", ".upsert(", "processAccountingSyncQueue(", "getSupabaseAdmin("]) {
      expect(body).not.toContain(mutation);
    }
  });

  it("never sends OAuth tokens, invoice rows or raw provider errors in responses", () => {
    expect(body).toContain('invoices_readable: true');
    expect(body).toContain('organization_suffix: process.env.ZOHO_ORGANIZATION_ID.slice(-4)');
    expect(body).not.toContain('invoices: result.invoices');
    expect(body).not.toContain('error.message');
    expect(body).toContain('error: "zoho_invoice_read_failed"');
  });
});
