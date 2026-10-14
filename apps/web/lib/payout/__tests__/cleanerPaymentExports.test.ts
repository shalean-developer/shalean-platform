import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
const state = vi.hoisted(() => ({ cleanerRows: [] as Record<string, unknown>[], cleanerError: null as null | { message: string }, allowed: true }));
const payout = { id: "payout-1", cleaner_id: "cleaner-1", total_amount_cents: 27160, status: "frozen", period_start: "2026-10-01", period_end: "2026-10-31", created_at: "2026-11-01" };
function database() {
  return { from(table: string) {
    const response = () => table === "cleaners" ? { data: state.cleanerRows, error: state.cleanerError }
      : { data: table === "cleaner_payouts" ? [payout] : table === "cleaner_payout_runs" ? [{ id: "run-1" }] : [], error: null };
    const q = { select: () => q, eq: () => q, in: () => q, order: () => q,
      maybeSingle: async () => { const r = response(); return { ...r, data: r.data[0] ?? null }; },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(response()).then(resolve) };
    return q;
  } } as unknown as SupabaseClient;
}
vi.mock("@/lib/auth/requireAdminApi", () => ({ requireAdminApi: async () => state.allowed ? { ok: true } : { ok: false, status: 403, error: "Forbidden" } }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => database() }));
import { GET as singleExport } from "@/app/api/admin/payouts/[id]/export/route";
import { GET as runExport } from "@/app/api/admin/payouts/runs/[id]/export/route";
import { loadCleanerPaymentIdentities } from "../loadCleanerPaymentIdentities";
beforeEach(() => { state.allowed = true; state.cleanerError = null; state.cleanerRows = [{ id: "cleaner-1", full_name: "Example Cleaner", payment_id: "SHL-CL-000001" }]; });
describe("bank payment CSV identity", () => {
  it.each([singleExport, runExport])("exports permanent monthly identity on each active route", async route => {
    const response = await route(new Request("https://example.com"), { params: Promise.resolve({ id: "run-1" }) });
    expect(response.status).toBe(200);
    const csv = await response.text();
    expect(csv).toContain("SHL-CL-000001-202610");
    expect(csv).toContain("Example Cleaner");
  });
  it("preserves cents in the operator's per-payout instruction", async () => {
    const r = await singleExport(new Request("https://example.com"), { params: Promise.resolve({ id: "payout-1" }) });
    expect(await r.text()).toContain('"271.60"');
  });
  it.each([singleExport, runExport])("fails closed on database identity lookup failure", async route => {
    state.cleanerError = { message: "schema cache stale" };
    const r = await route(new Request("https://example.com"), { params: Promise.resolve({ id: "run-1" }) });
    expect(r.status).toBeGreaterThanOrEqual(500);
    expect(r.headers.get("content-type")).toContain("application/json");
  });
  it.each([{ rows: [] }, { rows: [{ id: "cleaner-1", full_name: "Example", payment_id: null }] }, { rows: [{ id: "cleaner-1", full_name: "Example", payment_id: "bad" }] }])("rejects absent or malformed identities %j", async ({ rows }) => {
    state.cleanerRows = rows;
    await expect(loadCleanerPaymentIdentities(database(), ["cleaner-1"])).rejects.toThrow();
  });
  it.each([singleExport, runExport])("preserves admin authorization", async route => {
    state.allowed = false;
    const r = await route(new Request("https://example.com"), { params: Promise.resolve({ id: "run-1" }) });
    expect(r.status).toBe(403);
  });
});
