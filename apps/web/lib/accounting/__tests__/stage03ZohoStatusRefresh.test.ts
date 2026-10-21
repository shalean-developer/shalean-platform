import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Stage 03 bounded Zoho status refresh safety contract", () => {
  const source = readFileSync(resolve(process.cwd(), "lib/accounting/syncInvoiceMetadata.ts"), "utf8");
  const route = readFileSync(resolve(process.cwd(), "app/api/cron/zoho-invoice-status-refresh/route.ts"), "utf8");

  it("rotates bounded pages without starving permanently failed records", () => {
    expect(source).toContain('Math.floor(Date.now() / 900000) % pageCount');
    expect(source).toContain('.order("id", { ascending: true })');
    expect(source).toContain('.range(offset, offset + batchSize - 1)');
    expect(source).toContain('.or("sync_status.is.null,sync_status.neq.ignored")');
  });

  it("does not swallow metadata upsert failures or count them as success", () => {
    expect(source).toContain('invoice_sync_metadata_upsert_failed');
    expect(source).toContain('return { ok: false, error:');
    expect(source).toContain('if (result.ok) synced++');
    expect(source).toContain('else failed++');
  });

  it("protects polling with cron auth, locking, and a five-invoice cap", () => {
    expect(route).toContain('request.headers.get("authorization")');
    expect(route).toContain('withCronLock(');
    expect(route).toContain('syncInvoiceStatusesFromZoho(admin, 5)');
    expect(route).toContain('result.failed === 0');
  });

  it("preserves fast accounting cron without invoice polling", () => {
    const fast = readFileSync(resolve(process.cwd(), "app/api/cron/accounting-sync/route.ts"), "utf8");
    expect(fast).toContain("processAccountingSyncQueue(admin, 10, 0)");
  });
});
