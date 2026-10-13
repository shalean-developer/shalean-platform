import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("AUDIT-03A02B unlocked missing cleaner earnings backfill", () => {
  const source = readFileSync(
    join(
      process.cwd(),
      "../../supabase/migrations/20261013170000_audit_03a02b_unlocked_missing_ledger_backfill.sql",
    ),
    "utf8",
  );

  const allowlisted = [
    "ecb13764-01f7-490a-bd06-aacaf992c5f5",
    "9c87c65f-e847-4157-b0dd-ea4f14edb6e9",
    "7cd9b6b8-22ee-497c-9b4c-357d40aee71c",
    "2933f61b-3380-4149-95ab-8f05875f90b6",
    "5eb7d0b4-b8bf-4c2e-a975-7aea7fd4515f",
    "24dff648-ea7b-470e-8d22-69966b193c8e",
    "47924352-5bf0-40f9-bd6f-4ee04c2464a7",
    "629da654-ad55-4b1c-83e4-33c57a103211",
    "62b33aa3-8a97-48fe-8781-35be046e5b09",
    "e2fb83a5-fcd3-4183-8f2b-7473b32b0389",
    "76b1eee2-bd8b-42e9-b9e1-17e3f9a19cb0",
  ];

  it("hard-allowlists exactly the 11 independently proven missing-ledger bookings", () => {
    for (const id of allowlisted) expect(source).toContain(id);
    expect(source).not.toContain("c7c3166b-46c3-4939-b8f2-bee0060159ee");
    expect(source).not.toContain("25524de8-ae00-4a4d-b14c-878b66658ae0");
  });

  it("requires booking, snapshot, and single-cleaner summary convergence", () => {
    expect(source).toContain("display_earnings_cents is distinct from v_booking.cleaner_earnings_total_cents");
    expect(source).toContain("booking_cleaner_earnings_snapshot");
    expect(source).toContain("jsonb_array_length(v_booking.earnings_summary -> 'per_cleaner_earnings') <> 1");
    expect(source).toContain("v_summary_cleaner is distinct from v_owner");
    expect(source).toContain("v_summary_total is distinct from v_booking.cleaner_earnings_total_cents");
  });

  it("fails closed on settlement locks and conflicting ownership", () => {
    expect(source).toContain("v_booking.payout_id is not null");
    expect(source).toContain("v_booking.payout_run_id is not null");
    expect(source).toContain("v_booking.payout_paid_at is not null");
    expect(source).toContain("has conflicting cleaner ownership");
  });

  it("is idempotent only when an existing row already exactly matches", () => {
    expect(source).toContain("v_existing.disbursement_id is null");
    expect(source).toContain("v_existing.cleaner_id = v_owner");
    expect(source).toContain("v_existing.amount_cents = v_booking.cleaner_earnings_total_cents");
    expect(source).toContain("acquired conflicting ledger evidence");
  });

  it("does not mutate payout history", () => {
    expect(source).not.toMatch(/update\s+public\.cleaner_payouts/i);
    expect(source).not.toMatch(/update\s+public\.cleaner_payout_runs/i);
    expect(source).not.toMatch(/delete\s+from\s+public\.cleaner_earnings/i);
  });

  it("keeps execution service-role only", () => {
    expect(source).toContain("service_role required");
    expect(source).toContain(
      "grant execute on function public.apply_audit_03a02b_unlocked_missing_ledger_backfill() to service_role",
    );
    expect(source).toContain(
      "revoke all on function public.apply_audit_03a02b_unlocked_missing_ledger_backfill() from authenticated",
    );
  });
});
