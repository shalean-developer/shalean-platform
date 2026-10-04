import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "../..");
const migration = readFileSync(
  resolve(
    root,
    "supabase/migrations/20261004171225_master_00b_01_cleaning_credit_reservations_rls.sql",
  ),
  "utf8",
).toLowerCase();

const paymentSummaryRoute = readFileSync(
  resolve(root, "apps/web/app/api/bookings/[id]/payment-summary/route.ts"),
  "utf8",
);

describe("MASTER-00B-01 Cleaning Credit reservation RLS", () => {
  it("enables fail-closed RLS without browser-facing policies", () => {
    expect(migration).toContain(
      "alter table public.cleaning_credit_reservations enable row level security",
    );
    expect(migration).not.toContain("create policy");
  });

  it("keeps the table service-role only", () => {
    expect(migration).toContain(
      "revoke all on table public.cleaning_credit_reservations from public, anon, authenticated",
    );
    expect(migration).toContain(
      "grant all on table public.cleaning_credit_reservations to service_role",
    );
  });

  it("keeps the customer payment summary behind the authorised server admin client", () => {
    expect(paymentSummaryRoute).toContain("getSupabaseAdmin()");
    expect(paymentSummaryRoute).toContain(
      '.from("cleaning_credit_reservations")',
    );
    expect(paymentSummaryRoute).toContain('auth.kind !== "authenticated"');
  });
});
