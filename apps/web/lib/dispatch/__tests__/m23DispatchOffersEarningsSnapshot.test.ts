import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../../..");
const webRoot = path.resolve(__dirname, "..", "..", "..");
const migrationPath = path.join(
  repoRoot,
  "supabase/migrations/20260934_dispatch_offers_earnings_snapshot.sql",
);

const migrationSql = readFileSync(migrationPath, "utf8");

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

const migrationCode = stripComments(migrationSql);
const migrationCodeLower = migrationCode.toLowerCase();

/**
 * M-23 regression suite for migration
 * `supabase/migrations/20260934_dispatch_offers_earnings_snapshot.sql`.
 *
 * Background
 *   Cleaner offer cards previously rendered "Job earning unavailable" on
 *   every solo dispatch offer because the runtime preview helper
 *   (`previewDisplayEarningsCentsForCleanerJob`) reused the persist-path
 *   eligibility gate, which requires `bookings.cleaner_id =` cleaner. That
 *   field is NULL pre-acceptance, so the gate rejected every solo offer.
 *
 *   This migration introduces three new columns on `dispatch_offers`
 *   (`display_earnings_cents`, `earnings_snapshot_source`,
 *   `earnings_snapshot_at`) plus a partial index that the audit/repair
 *   queries depend on. The runtime then writes the snapshot at offer
 *   creation time (`createDispatchOfferRow` →
 *   `resolveAndPersistDispatchOfferEarningsSnapshot`) and reads it before
 *   falling back to the runtime preview at `/api/cleaner/offers`.
 *
 * The invariants pinned below MUST NOT regress:
 *   1. All three columns are added with `IF NOT EXISTS` and remain nullable
 *      so the migration is safe to re-run on populated environments and
 *      offers that were created before the migration aren't broken.
 *   2. `display_earnings_cents` carries a `>= 0` (or NULL) CHECK so a
 *      negative cent value can never be persisted, even by a future bug.
 *   3. The partial index `dispatch_offers_pending_missing_earnings_idx` is
 *      created with the exact predicate the repair script and audit query
 *      depend on (`status = 'pending' AND display_earnings_cents IS NULL`),
 *      keyed on `(booking_id, cleaner_id)`.
 *   4. The migration touches ONLY `public.dispatch_offers` — no payout
 *      formulas, no booking schema changes, no off-scope writes.
 *   5. The runtime call sites (`createDispatchOfferRow` and
 *      `/api/cleaner/offers`) still write/read these columns by the exact
 *      names the migration declares.
 *
 * Out of scope: live behaviour of the index (used vs. seq scan) is verified
 * via `pg_stat_user_indexes`. These tests are filesystem-only and never
 * connect to a database.
 */
describe("M-23: 20260934 dispatch_offers_earnings_snapshot — schema invariants", () => {
  it("migration file exists and is non-empty", () => {
    expect(migrationSql.length).toBeGreaterThan(0);
  });

  it("adds dispatch_offers.display_earnings_cents as INTEGER with a `>= 0 OR NULL` CHECK, IF NOT EXISTS", () => {
    expect(migrationCode).toMatch(
      /alter\s+table\s+public\.dispatch_offers\s+add\s+column\s+if\s+not\s+exists\s+display_earnings_cents\s+integer\s+check\s*\(\s*display_earnings_cents\s+is\s+null\s+or\s+display_earnings_cents\s*>=\s*0\s*\)\s*;/i,
    );
  });

  it("adds dispatch_offers.earnings_snapshot_source as TEXT (nullable), IF NOT EXISTS", () => {
    expect(migrationCode).toMatch(
      /alter\s+table\s+public\.dispatch_offers\s+add\s+column\s+if\s+not\s+exists\s+earnings_snapshot_source\s+text\s*;/i,
    );
  });

  it("adds dispatch_offers.earnings_snapshot_at as TIMESTAMPTZ (nullable), IF NOT EXISTS", () => {
    expect(migrationCode).toMatch(
      /alter\s+table\s+public\.dispatch_offers\s+add\s+column\s+if\s+not\s+exists\s+earnings_snapshot_at\s+timestamptz\s*;/i,
    );
  });

  it("none of the three new columns are NOT NULL (existing offers must stay valid)", () => {
    const stmts = Array.from(migrationCode.matchAll(/add\s+column\s+if\s+not\s+exists[^;]*?;/gi)).map(
      (m) => m[0].toLowerCase(),
    );
    expect(stmts.length).toBe(3);
    for (const s of stmts) {
      expect(s, `column statement should be nullable: ${s.slice(0, 200)}`).not.toMatch(/\bnot\s+null\b/);
    }
  });

  it("creates the partial index dispatch_offers_pending_missing_earnings_idx with IF NOT EXISTS, keyed on (booking_id, cleaner_id), filtered to pending + missing snapshot", () => {
    expect(migrationCode).toMatch(
      /create\s+index\s+if\s+not\s+exists\s+dispatch_offers_pending_missing_earnings_idx\s+on\s+public\.dispatch_offers\s*\(\s*booking_id\s*,\s*cleaner_id\s*\)\s+where\s+status\s*=\s*'pending'\s+and\s+display_earnings_cents\s+is\s+null\s*;/i,
    );
  });

  it("comments each new column so a future schema audit knows the contract", () => {
    expect(migrationCode).toMatch(/comment\s+on\s+column\s+public\.dispatch_offers\.display_earnings_cents\s+is/i);
    expect(migrationCode).toMatch(/comment\s+on\s+column\s+public\.dispatch_offers\.earnings_snapshot_source\s+is/i);
    expect(migrationCode).toMatch(/comment\s+on\s+column\s+public\.dispatch_offers\.earnings_snapshot_at\s+is/i);
  });
});

describe("M-23: 20260934 dispatch_offers_earnings_snapshot — isolation", () => {
  it("only mutates public.dispatch_offers (never bookings, payouts, earnings, or cleaners)", () => {
    const tableMatches = Array.from(
      migrationCodeLower.matchAll(
        /\b(?:alter\s+table|insert\s+into|update|delete\s+from)\s+(public\.[a-z_][a-z0-9_]*)/g,
      ),
    ).map((m) => m[1]);
    for (const t of tableMatches) {
      expect(t).toBe("public.dispatch_offers");
    }
  });

  it("the only index it creates is the documented partial index (no scope creep)", () => {
    const createIdx = Array.from(migrationCodeLower.matchAll(/create\s+index[^;]*?;/g));
    expect(createIdx.length).toBe(1);
    expect(createIdx[0][0]).toMatch(/dispatch_offers_pending_missing_earnings_idx/);
  });

  it("introduces no functions, triggers, policies, grants, or RLS toggles", () => {
    expect(migrationCodeLower).not.toMatch(/\bcreate\s+(or\s+replace\s+)?function\b/);
    expect(migrationCodeLower).not.toMatch(/\bcreate\s+trigger\b/);
    expect(migrationCodeLower).not.toMatch(/\bcreate\s+policy\b/);
    expect(migrationCodeLower).not.toMatch(/\bgrant\b/);
    expect(migrationCodeLower).not.toMatch(/\brevoke\b/);
    expect(migrationCodeLower).not.toMatch(/\benable\s+row\s+level\s+security\b/);
    expect(migrationCodeLower).not.toMatch(/\bdrop\s+(?:table|column|function|trigger|policy|index)\b/);
  });

  it("does not insert, update, or delete any rows (schema-only)", () => {
    expect(migrationCodeLower).not.toMatch(/\binsert\s+into\b/);
    expect(migrationCodeLower).not.toMatch(/\bupdate\s+public\./);
    expect(migrationCodeLower).not.toMatch(/\bdelete\s+from\b/);
  });
});

describe("M-23: 20260934 runtime call sites still write / read the snapshot columns", () => {
  it("createDispatchOfferRow still wires `resolveAndPersistDispatchOfferEarningsSnapshot` (the snapshot writer)", () => {
    const src = readFileSync(path.join(webRoot, "lib/dispatch/dispatchOffers.ts"), "utf8");
    expect(src).toMatch(/resolveAndPersistDispatchOfferEarningsSnapshot/);
  });

  it("the snapshot writer updates dispatch_offers and references the three migration columns by name", () => {
    const src = readFileSync(
      path.join(webRoot, "lib/dispatch/dispatchOfferEarningsSnapshot.ts"),
      "utf8",
    );
    expect(src).toMatch(/from\(\s*["']dispatch_offers["']\s*\)/);
    expect(src).toMatch(/display_earnings_cents/);
    expect(src).toMatch(/earnings_snapshot_source/);
    expect(src).toMatch(/earnings_snapshot_at/);
  });

  it("/api/cleaner/offers still selects the three snapshot columns from dispatch_offers (read path)", () => {
    const src = readFileSync(path.join(webRoot, "app/api/cleaner/offers/route.ts"), "utf8");
    const dispatchSelectRe = /from\(\s*["']dispatch_offers["']\s*\)[\s\S]{0,200}\.select\(\s*["']([^"']+)["']/;
    const m = src.match(dispatchSelectRe);
    expect(m, "/api/cleaner/offers must SELECT from dispatch_offers").not.toBeNull();
    if (m) {
      const cols = m[1];
      expect(cols).toMatch(/\bdisplay_earnings_cents\b/);
      expect(cols).toMatch(/\bearnings_snapshot_source\b/);
      expect(cols).toMatch(/\bearnings_snapshot_at\b/);
    }
  });

  it("the repair script targets only dispatch_offers and respects the partial-index predicate", () => {
    const src = readFileSync(
      path.join(webRoot, "scripts/repairMissingDispatchOfferEarningsSnapshot.ts"),
      "utf8",
    );
    // Comments + behaviour both anchor on `status='pending'` AND `display_earnings_cents IS NULL`,
    // which is the exact partial index the migration creates.
    expect(src).toMatch(/dispatch_offers/);
    expect(src).toMatch(/status[\s\S]{0,40}pending/);
    expect(src).toMatch(/display_earnings_cents/);
    expect(src).toMatch(/is null/i);
  });
});
