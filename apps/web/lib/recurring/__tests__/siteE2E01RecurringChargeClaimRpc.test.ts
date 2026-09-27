import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "../../supabase/migrations/20260927081000_site_e2e_01_restore_recurring_charge_claim_rpc.sql",
  ),
  "utf8",
);

const route = readFileSync(
  join(process.cwd(), "app/api/cron/charge-recurring-bookings/route.ts"),
  "utf8",
);

describe("SITE-E2E-01 recurring charge claim RPC contract", () => {
  it("restores the exact RPC called by the recurring charge cron", () => {
    expect(migration).toContain("create or replace function public.try_claim_recurring_charge");
    expect(migration).toContain("p_booking_id uuid");
    expect(migration).toContain("p_lease_seconds int default 120");
    expect(route).toContain('admin.rpc("try_claim_recurring_charge"');
  });

  it("claims only eligible pending recurring bookings with an expired/no lease", () => {
    expect(migration).toContain("status = 'pending_payment'");
    expect(migration).toContain("is_recurring_generated = true");
    expect(migration).toContain("recurring_fallback_at is null");
    expect(migration).toContain("payment_status is distinct from 'failed'");
    expect(migration).toContain("recurring_next_charge_attempt_at <= now()");
  });

  it("advances the lease and restricts execution to service_role", () => {
    expect(migration).toContain("recurring_last_charge_attempt_at = now()");
    expect(migration).toContain("recurring_next_charge_attempt_at = now() + make_interval");
    expect(migration).toContain("revoke all on function public.try_claim_recurring_charge(uuid, int) from public");
    expect(migration).toContain("grant execute on function public.try_claim_recurring_charge(uuid, int) to service_role");
  });
});
