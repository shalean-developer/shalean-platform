import { describe, expect, it } from "vitest";
import {
  evaluatePendingCollectedCashAnomalyCandidate,
  looksLikeProductionSupabaseUrl,
} from "@/lib/booking/pendingCollectedCashAnomalyRepair";

describe("evaluatePendingCollectedCashAnomalyCandidate", () => {
  const base = {
    id: "b1",
    status: "pending_payment",
    payment_status: "pending",
    amount_paid_cents: 12_000,
    total_paid_cents: 12_000,
    total_paid_zar: 120,
    total_price: 120,
    payment_completed_at: null,
    payment_transaction_id: null,
  };

  it("includes pending rows with positive cash and no settlement evidence", () => {
    expect(evaluatePendingCollectedCashAnomalyCandidate(base)).toEqual({ ok: true });
  });

  it("excludes settled payment_status", () => {
    expect(
      evaluatePendingCollectedCashAnomalyCandidate({ ...base, payment_status: "success" }),
    ).toEqual({ ok: false, reason: "payment_status_settled" });
  });

  it("excludes linked payment transactions and R0 / gateway ledgers", () => {
    expect(
      evaluatePendingCollectedCashAnomalyCandidate({ ...base, payment_transaction_id: "tx1" }),
    ).toEqual({ ok: false, reason: "has_payment_transaction_id" });
    expect(
      evaluatePendingCollectedCashAnomalyCandidate({ ...base, hasR0CoverLedger: true }),
    ).toEqual({ ok: false, reason: "has_r0_cover_ledger" });
    expect(
      evaluatePendingCollectedCashAnomalyCandidate({ ...base, hasSettledGatewayLedger: true }),
    ).toEqual({ ok: false, reason: "has_settled_gateway_ledger" });
  });

  it("excludes admin/manual paid markers", () => {
    expect(
      evaluatePendingCollectedCashAnomalyCandidate({ ...base, marked_paid_by_admin_id: "admin-1" }),
    ).toEqual({ ok: false, reason: "manual_or_admin_paid" });
  });
});

describe("looksLikeProductionSupabaseUrl", () => {
  it("detects hosted supabase hosts and ignores localhost", () => {
    expect(looksLikeProductionSupabaseUrl("https://abcd.supabase.co")).toBe(true);
    expect(looksLikeProductionSupabaseUrl("http://127.0.0.1:54321")).toBe(false);
    expect(looksLikeProductionSupabaseUrl("http://localhost:54321")).toBe(false);
  });
});
