import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("AUDIT-03A02-02 cleaner earnings ledger convergence", () => {
  const source = readFileSync(
    join(
      process.cwd(),
      "../../supabase/migrations/20261012133000_audit_03a02_02_cleaner_earnings_ledger_convergence.sql",
    ),
    "utf8",
  );

  it("atomically syncs only existing pending undisbursemented ledger rows", () => {
    expect(source).toContain("trg_sync_pending_cleaner_earnings_from_booking_update");
    expect(source).toContain("v_ledger_status = 'pending'");
    expect(source).toContain("v_disbursement_id is null");
    expect(source).toContain("amount_cents = greatest(coalesce(new.cleaner_earnings_total_cents, 0), 0)");
  });

  it("fails closed when booking changes conflict with locked ledger history", () => {
    expect(source).toContain("locked cleaner earnings ledger conflicts with booking");
    expect(source).toContain("raise exception");
    expect(source).toContain("using errcode = '55000'");
  });

  it("hard-allowlists only the two proven current-model repair bookings", () => {
    expect(source).toContain("c98cd9e2-e295-47af-8bcf-faf90120d751");
    expect(source).toContain("39a26e1d-b8ba-433e-9427-ed61c96fbe6c");
    expect(source).toContain("booking outside AUDIT-03A02-02 allowlist");
  });

  it("requires independent Aug 23 summary and earnings-snapshot evidence", () => {
    expect(source).toContain("jsonb_array_length(v_booking.earnings_summary -> 'per_cleaner_earnings') <> 1");
    expect(source).toContain("booking_cleaner_earnings_snapshot");
    expect(source).toContain("Aug 23 independent ownership/earnings evidence no longer converges");
  });

  it("does not mutate payout batches and keeps the repair service-role only", () => {
    expect(source).not.toMatch(/update\s+public\.cleaner_payouts/i);
    expect(source).not.toMatch(/update\s+public\.cleaner_payout_runs/i);
    expect(source).toContain("service_role required");
    expect(source).toContain("grant execute on function public.apply_audit_03a02_02_ledger_repair(uuid) to service_role");
    expect(source).toContain("revoke all on function public.apply_audit_03a02_02_ledger_repair(uuid) from authenticated");
  });
});
