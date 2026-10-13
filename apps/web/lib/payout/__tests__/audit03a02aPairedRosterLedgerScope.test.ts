import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("AUDIT-03A-02A paired-roster cleaner_earnings scope", () => {
  const helper = readFileSync(
    join(process.cwd(), "lib/payout/ensureCleanerEarningsLedger.ts"),
    "utf8",
  );
  const migration = readFileSync(
    join(
      process.cwd(),
      "../../supabase/migrations/20261013170000_audit_03a02a_paired_roster_ledger_scope.sql",
    ),
    "utf8",
  );

  it("application insert helper explicitly excludes 2+ cleaner rosters", () => {
    expect(helper).toContain('.from("booking_cleaners")');
    expect(helper).toContain("rosterCleanerIds.size >= 2");
    expect(helper).toContain('reason: "paired_roster_job"');
  });

  it("database sync trigger excludes paired roster before solo conflict/sync logic", () => {
    const pairedGuard = migration.indexOf("having count(distinct bc.cleaner_id) >= 2");
    const ownerConflict = migration.indexOf("solo booking % has conflicting cleaner ownership");
    const ledgerUpdate = migration.indexOf("update public.cleaner_earnings ce");

    expect(pairedGuard).toBeGreaterThan(-1);
    expect(ownerConflict).toBeGreaterThan(-1);
    expect(ledgerUpdate).toBeGreaterThan(-1);
    expect(pairedGuard).toBeLessThan(ownerConflict);
    expect(pairedGuard).toBeLessThan(ledgerUpdate);
  });

  it("migration changes function behavior only and does not backfill historical ledger data", () => {
    expect(migration).not.toContain("insert into public.cleaner_earnings");
    expect(migration).not.toContain("delete from public.cleaner_earnings");
    expect(migration).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });

  it("keeps the trigger security-definer lockdown", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = pg_catalog");
    expect(migration).toContain(
      "revoke all on function public.sync_pending_cleaner_earnings_from_booking_update() from authenticated",
    );
  });
});
