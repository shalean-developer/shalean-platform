import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { approveCleanerPayout } from "@/lib/payout/approvePayout";
import { markCleanerPayoutPaid } from "@/lib/payout/markPayoutPaid";
import { validateTransferProcessingCutoff } from "@/lib/payout/validateTransferProcessingCutoff";
import { assertRunProcessingCutoff } from "@/lib/payout/runs/assertRunProcessingCutoff";

const { loadItems } = vi.hoisted(() => ({ loadItems: vi.fn() }));
vi.mock("@/lib/payout/loadCleanerPayoutBatchItems", () => ({ loadCleanerPayoutBatchItems: loadItems }));
vi.mock("@/lib/payout/payoutAudit", () => ({ logPayoutAuditEvent: vi.fn() }));

function client(rows: unknown, error: { message: string } | null = null) {
  const update = vi.fn(() => { throw new Error("Unexpected financial mutation"); });
  const rpc = vi.fn(() => { throw new Error("Unexpected financial RPC"); });
  const query = {
    select: vi.fn(() => query), eq: vi.fn(() => query), order: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data: rows, error })),
    range: vi.fn(async () => ({ data: rows, error })), update,
  };
  return { from: vi.fn(() => query), rpc, update };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-01T00:00:00+02:00"));
  loadItems.mockReset();
  loadItems.mockResolvedValue({ items: [{ date: "2026-10-01" }], totalCents: 100, error: null });
});
afterEach(() => vi.useRealTimers());

describe("October payout boundary", () => {
  it("rejects historical approval without loading items or changing records", async () => {
    const admin = client({ period_start: "2026-09-01", period_end: "2026-09-30" });
    const result = await approveCleanerPayout(admin as never, { payoutId: "p", approvedBy: "checker" });
    expect(result.ok).toBe(false);
    expect(loadItems).not.toHaveBeenCalled();
    expect(admin.update).not.toHaveBeenCalled();
  });
  it("rejects historical settlement without a mutation or settlement RPC", async () => {
    const admin = client({ status: "approved", period_start: "2026-09-01", period_end: "2026-09-30" });
    expect((await markCleanerPayoutPaid(admin as never, "p", { actorUserId: "releaser", paymentMethod: "bank_transfer", paymentReference: "bank-ref" })).ok).toBe(false);
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(admin.update).not.toHaveBeenCalled();
  });
  it("keeps matching historical bank settlement replay read-only", async () => {
    const admin = client({ status: "paid", payment_method: "bank_transfer", payment_reference: "bank-ref", period_start: "2026-09-01", period_end: "2026-09-30" });
    expect(await markCleanerPayoutPaid(admin as never, "p", { actorUserId: "releaser", paymentMethod: "bank_transfer", paymentReference: "bank-ref" })).toEqual({ ok: true });
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(loadItems).not.toHaveBeenCalled();
  });
  it.each(["2026-09-30", "2026-11-01", null, "invalid"])("rejects mixed historical, outside-month or undated batch item %s", async (date) => {
    loadItems.mockResolvedValue({ items: [{ date: "2026-10-01" }, { date }], error: null });
    const admin = client({ period_start: "2026-10-01", period_end: "2026-10-31" });
    expect((await validateTransferProcessingCutoff(admin as never, "cleaner_payout", "p")).ok).toBe(false);
  });
  it("allows a closed October batch with October visits", async () => {
    const admin = client({ period_start: "2026-10-01", period_end: "2026-10-31" });
    expect(await validateTransferProcessingCutoff(admin as never, "cleaner_payout", "p")).toEqual({ ok: true });
  });
  it("rejects October until Johannesburg November begins", async () => {
    vi.setSystemTime(new Date("2026-10-31T21:59:59Z"));
    const admin = client({ period_start: "2026-10-01", period_end: "2026-10-31" });
    expect((await validateTransferProcessingCutoff(admin as never, "cleaner_payout", "p")).ok).toBe(false);
  });
  it("rejects historical ledger visits and open-month ledger visits", async () => {
    for (const date of ["2026-09-30", "2026-11-01", null]) {
      const admin = client([{ id: "e", bookings: { date } }]);
      expect((await validateTransferProcessingCutoff(admin as never, "cleaner_earnings", "d")).ok).toBe(false);
    }
  });
  it("allows a ledger disbursement containing only closed October visits", async () => {
    expect(await validateTransferProcessingCutoff(client([{ id: "e", bookings: { date: "2026-10-31" } }]) as never, "cleaner_earnings", "d")).toEqual({ ok: true });
  });
  it("checks the whole run before any payout is processed", async () => {
    const admin = client([
      { id: "current", period_start: "2026-10-01", period_end: "2026-10-31" },
      { id: "historical", period_start: "2026-09-01", period_end: "2026-09-30" },
    ]);
    await expect(assertRunProcessingCutoff(admin as never, "run")).rejects.toThrow("October-or-later");
    expect(admin.update).not.toHaveBeenCalled();
    expect(admin.rpc).not.toHaveBeenCalled();
  });
  it("fails closed when source reads fail", async () => {
    const result = await validateTransferProcessingCutoff(client(null, { message: "read failed" }) as never, "cleaner_payout", "p");
    expect(result).toEqual({ ok: false, error: "read failed", status: 500 });
  });
});
