import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("AUDIT-03A02B.1 testable cleaner earnings repair helper", () => {
  const source = readFileSync(
    join(
      process.cwd(),
      "../../supabase/migrations/20261013183000_audit_03a02b1_testable_repair_helper.sql",
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

  it("keeps the operational wrapper hard-allowlisted to exactly the same 11 bookings", () => {
    const arrayMatch = source.match(/v_allowlist uuid\[\] := array\[([\s\S]*?)\];/);
    expect(arrayMatch).not.toBeNull();
    const actual = [
      ...(arrayMatch?.[1].matchAll(/'([0-9a-f-]{36})'::uuid/g) ?? []),
    ].map((match) => match[1]);
    expect(actual).toEqual(allowlisted);
    expect(actual).toHaveLength(11);
    expect(new Set(actual).size).toBe(11);
  });

  it("makes the one-booking helper owner-only, including denying service_role", () => {
    expect(source).toContain(
      "revoke all on function public.audit_03a02b_repair_missing_ledger_one(uuid) from public",
    );
    expect(source).toContain(
      "revoke all on function public.audit_03a02b_repair_missing_ledger_one(uuid) from anon",
    );
    expect(source).toContain(
      "revoke all on function public.audit_03a02b_repair_missing_ledger_one(uuid) from authenticated",
    );
    expect(source).toContain(
      "revoke all on function public.audit_03a02b_repair_missing_ledger_one(uuid) from service_role",
    );
    expect(source).not.toContain(
      "grant execute on function public.audit_03a02b_repair_missing_ledger_one(uuid) to service_role",
    );
  });

  it("preserves service-role-only access to the hard-allowlisted wrapper", () => {
    expect(source).toContain("service_role required");
    expect(source).toContain(
      "grant execute on function public.apply_audit_03a02b_unlocked_missing_ledger_backfill() to service_role",
    );
    expect(source).toContain(
      "revoke all on function public.apply_audit_03a02b_unlocked_missing_ledger_backfill() from authenticated",
    );
  });

  it("delegates every allowlisted booking through the invariant helper", () => {
    expect(source).toContain(
      "v_result := public.audit_03a02b_repair_missing_ledger_one(v_id)",
    );
    expect(source).toContain("v_result ->> 'action' = 'inserted'");
    expect(source).toContain("v_result ->> 'action' = 'already_aligned'");
  });

  it("keeps the helper fail-closed for settlement and evidence drift", () => {
    expect(source).toContain("is settlement-locked");
    expect(source).toContain("has conflicting cleaner ownership");
    expect(source).toContain("display earnings no longer converge");
    expect(source).toContain("snapshot evidence no longer converges");
    expect(source).toContain("summary evidence no longer converges");
    expect(source).toContain("acquired conflicting ledger evidence");
  });

  it("keeps idempotency explicit", () => {
    expect(source).toContain("'action', 'inserted'");
    expect(source).toContain("'action', 'already_aligned'");
    expect(source).toContain("v_existing.disbursement_id is null");
    expect(source).toContain("v_existing.cleaner_id = v_owner");
    expect(source).toContain(
      "v_existing.amount_cents = v_booking.cleaner_earnings_total_cents",
    );
  });

  it("does not alter payout batches, payout runs, or paid history", () => {
    expect(source).not.toMatch(/update\s+public\.cleaner_payouts/i);
    expect(source).not.toMatch(/update\s+public\.cleaner_payout_runs/i);
    expect(source).not.toMatch(/delete\s+from\s+public\.cleaner_earnings/i);
  });
});
