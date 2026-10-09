import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("A02-03-02 historical team ledger repair governance", () => {
  it("keeps the generic booking-line backfill away from team jobs", () => {
    const src = read("scripts/backfillBookingLineItems.ts");
    expect(src).toContain('.select("id, service, rooms, bathrooms, extras, total_paid_zar, amount_paid_cents, booking_snapshot, is_team_job")');
    expect(src).toContain("raw.is_team_job === true");
  });

  it("keeps the team repair bounded, dry-run by default, and dual-gated for writes", () => {
    const src = read("scripts/repairA02A03TeamLineItems.ts");
    expect(src).toContain("TARGET_IDS");
    expect(src).toContain("d860554e-c132-477b-bf15-557fb9c88a5e");
    expect(src).toContain("f6b2316e-2518-4f43-b6e8-b050c6d07483");
    expect(src).toContain("e865f74b-33af-481f-a12e-576e1e0ed227");
    expect(src).toContain("d2cfcb8d-118f-48cc-90c7-420ffe122c9b");
    expect(src).toContain("c1bd1fc8-03e9-4f2c-a597-e0ac395c841a");
    expect(src).not.toContain("fc75a013-5858-43e8-b499-3aa2ab047bcf");
    expect(src).toContain('process.env.A02_03_02_APPLY !== "YES"');
    expect(src).toContain("function parseArgs");
    expect(src).toContain('arg === "--apply"');
    const pkg = JSON.parse(read("package.json")) as { scripts?: Record<string, string> };
    expect(pkg.scripts?.["repair:a02-03-02-team-lines"]).toContain("--env-file=.env.local");
    expect(pkg.scripts?.["repair:a02-03-02-team-lines"]).toContain("--conditions=react-server");
    expect(src).toContain('arg === "--fixture-check"');
    const migration = read("../../supabase/migrations/20261009123000_audit_02a03_02_team_line_items_atomic_repair.sql");
    expect(migration).toContain("a02_03_02_existing_line_items_conflict");
    expect(src).toContain("team payout ledger missing");
    expect(src).toContain("historical_team_snapshot_v1");
    expect(src).toContain('admin.rpc("repair_a02_03_02_team_line_items"');
    expect(src).toContain("recovered_after_ambiguous_rpc_error");
    expect(src).toContain("alreadyRepaired");
    expect(src).toContain("safe to retry");
    expect(src).toContain("canonicalJson");
    expect(src).toContain("sourceLineIndex");
    expect(src).toContain("row.item_type !== expected.item_type");
    expect(src).toContain("canonicalJson(metadata) !== canonicalJson(expectedMetadata)");
    expect(src).toContain("preflightTarget");
    expect(src).toContain("Validate and build every requested target before any write occurs.");
    expect(src).toContain("Apply requires exactly one explicit --booking-id=<uuid> target.");
    expect(src).toContain("Invalid --booking-id value");
    expect(src).toContain("Unknown argument");
    expect(src).toContain("Use --booking-id=<uuid>; spaced --booking-id values are not accepted.");
    expect(src).toContain("B3_C1BD_AUDITED_FIXTURE");
    expect(src).toContain("assertB3AuditedFixtureUnchanged");
    expect(src).toContain("audited fixture mismatch; live pricing snapshot changed since B3 audit");
    expect(src).toContain("audited fixture mismatch; reconstructed payload changed since B3 audit");
    expect(src).toContain("assertB3AuditedFixtureUnchanged(bookingId, booking.booking_snapshot, built)");
    const b3Migration = read("../../supabase/migrations/20261009163000_audit_02a03_02b3_c1bd_discount_line_items_allowlist.sql");
    expect(b3Migration).toContain("a02_03_02_b3_live_snapshot_mismatch");
    expect(b3Migration).toContain("a02_03_02_b3_payload_mismatch");
    expect(b3Migration).toContain("a02_03_02_b3_payout_state_mismatch");
  });
});
