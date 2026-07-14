import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { readRepositoryMigration } from "@/lib/audit/resolveRepositoryMigration";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../../..");

/**
 * M-24: historical dispatch_offers cleanup regression suite.
 *
 * The fix has two on-disk artifacts that need to stay locked down:
 *
 *   1. `supabase/migrations/20260946_m24_historical_dispatch_offers_cleanup.sql`
 *      — the one-shot historical cleanup that:
 *        a. expires `status='pending' AND expires_at < now()` rows;
 *        b. backfills `display_earnings_cents` ONLY on accepted-solo offers
 *           where the booking's persisted earnings can be safely copied.
 *
 *   2. `supabase/queries/m24_historical_dispatch_offers_cleanup_verify.sql`
 *      — the verification queries operators run before/after the migration.
 *
 * The runtime contracts the cleanup mirrors must ALSO stay intact (so a
 * future refactor cannot quietly diverge):
 *
 *   - `runDispatchTimeouts` and `expire_pending_dispatch_offers` continue
 *     to use the `status='pending' AND expires_at < now()` predicate plus
 *     the `WHERE status='pending'` CAS guard.
 *   - The per-offer `display_earnings_cents` column is still nullable with
 *     the `>= 0` check, and the `>=` partial index from migration
 *     `20260934_dispatch_offers_earnings_snapshot.sql` still exists.
 *
 * Out of scope (the migration MUST NOT touch any of these):
 *   - offer creation logic (`createDispatchOfferRow`, snapshot helpers);
 *   - payout formulas (`computeCleanerOfferEarningsSnapshot`,
 *     `calculateCleanerPayout`, canonical engine);
 *   - eligibility / completion gates (`bookingPayableForWeeklyBatch`,
 *     `isCompletableDisplayEarningsCents`);
 *   - bookings / cleaner_payouts / cleaner_earnings rows.
 *
 * The "isolation" describe at the bottom asserts the migration source does
 * not reference any of those surfaces.
 */

const { sql: migrationSrc } = readRepositoryMigration(
  "20260946_m24_historical_dispatch_offers_cleanup.sql",
);
const { sql: earningsSnapshotMigrationSql } = readRepositoryMigration(
  "20260934_dispatch_offers_earnings_snapshot.sql",
);
const { sql: dispatchV3Sql } = readRepositoryMigration(
  "20260437_dispatch_v3_offers_acceptance.sql",
);

const { sql: expireOffersMaintenanceSql } = readRepositoryMigration(
  "20260467_pg_cron_expire_offers_and_http_maintenance.sql",
);

const migrationLower = migrationSrc.toLowerCase();
/** Migration source with -- and block comments stripped — used when a regex must match SQL statements only (the doc header legitimately mentions everything as prose). */
const migrationCode = migrationSrc
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/--[^\n]*/g, " ");
const migrationCodeLower = migrationCode.toLowerCase();

const verifyPath = path.join(
  repoRoot,
  "supabase/queries/m24_historical_dispatch_offers_cleanup_verify.sql",
);

const verifySrc = readFileSync(verifyPath, "utf8");
const verifyLower = verifySrc.toLowerCase();
const verifyCode = verifySrc
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/--[^\n]*/g, " ");
const verifyCodeLower = verifyCode.toLowerCase();

// ---------------------------------------------------------------------------
// 1. Migration content guards: structural / safety contract
// ---------------------------------------------------------------------------
describe("M-24 migration: 20260946_m24_historical_dispatch_offers_cleanup.sql", () => {
  it("only mutates the dispatch_offers table — never bookings / payouts / earnings / ledgers", () => {
    /**
     * The only `update`/`insert`/`delete` statements in the migration must
     * target dispatch_offers. We deliberately require the `public.` prefix
     * so this regex doesn't match `for update SKIP locked` (no table after
     * `update`) or the runtime convention's bare `update <var>`.
     */
    const mutatingStatementRe = /\b(?:update|insert\s+into|delete\s+from)\s+public\.([a-z_]+)/g;
    const tables = new Set<string>();
    for (const m of migrationCodeLower.matchAll(mutatingStatementRe)) {
      tables.add(m[1]!);
    }
    expect([...tables]).toEqual(["dispatch_offers"]);
  });

  it("uses safe lock + statement timeouts so it cannot wedge prod", () => {
    expect(migrationCodeLower).toMatch(/set\s+local\s+lock_timeout/);
    expect(migrationCodeLower).toMatch(/set\s+local\s+statement_timeout/);
  });

  it("does NOT touch active / future pending offers (expires_at < now() filter on every UPDATE)", () => {
    /**
     * Find every `update public.dispatch_offers` statement that mutates
     * status — each one MUST be guarded by `expires_at < now()` (and may
     * also restrict to `status='pending'`). Any UPDATE that flips status
     * without that filter would risk modifying live future offers.
     */
    const updateBlocks = migrationCodeLower
      .split(/update\s+public\.dispatch_offers/g)
      .slice(1);
    const statusFlipBlocks = updateBlocks.filter((b) => /status\s*=\s*'expired'/.test(b));
    expect(statusFlipBlocks.length).toBeGreaterThan(0);
    for (const b of statusFlipBlocks) {
      expect(b).toMatch(/expires_at\s*<\s*now\(\)/);
    }
  });

  it("expiry update preserves an existing responded_at via COALESCE (idempotent + audit-accurate)", () => {
    expect(migrationCodeLower).toMatch(
      /responded_at\s*=\s*coalesce\(\s*[a-z_.]*responded_at\s*,\s*[a-z_.]*expires_at\s*\)/,
    );
  });

  it("expiry update stamps responded_at = expires_at (NOT now()) — historical accuracy, not fabricated activity", () => {
    /**
     * This guard is what stops a future "helpful" refactor from changing
     * `expires_at` → `now()` and silently inflating the
     * `dispatch.offer.timeout` metrics or the offer-timeout SLA dashboard
     * with backdated activity.
     */
    const expiryUpdate = migrationCodeLower.match(
      /update\s+public\.dispatch_offers[\s\S]*?status\s*=\s*'expired'[\s\S]*?responded_at\s*=\s*([\s\S]*?)\s+from\s+stale/,
    );
    expect(expiryUpdate).not.toBeNull();
    const respondedAtExpr = expiryUpdate![1]!;
    expect(respondedAtExpr).toContain("expires_at");
    /** The expression must NOT be plain `now()` — that would wipe the historical timestamp. */
    expect(/^\s*now\(\)\s*$/.test(respondedAtExpr)).toBe(false);
  });

  it("backfill is gated to accepted-solo offers with a matching cleaner and a positive booking earnings value", () => {
    /**
     * Locate the `backfill_candidates` CTE up to the next top-level `update`
     * statement (regex `[\s\S]*?` cannot balance the parens inside
     * `coalesce(b.is_team_job, false)`, so we anchor on a sibling SQL
     * keyword instead).
     */
    const cteMatch = migrationCodeLower.match(
      /with\s+backfill_candidates\s+as\s*\(\s*select[\s\S]*?\)\s*update\s+public\.dispatch_offers\s+d/,
    );
    expect(cteMatch).not.toBeNull();
    const cte = cteMatch![0]!;
    expect(cte).toMatch(/d\.status\s*=\s*'accepted'/);
    expect(cte).toMatch(/d\.display_earnings_cents\s+is\s+null/);
    expect(cte).toMatch(/b\.cleaner_id\s*=\s*d\.cleaner_id/);
    expect(cte).toMatch(/coalesce\(b\.is_team_job,\s*false\)\s*=\s*false/);
    expect(cte).toMatch(/b\.display_earnings_cents\s+is\s+not\s+null/);
    expect(cte).toMatch(/b\.display_earnings_cents\s*>\s*0/);
  });

  it("backfill UPDATE is additive (display_earnings_cents IS NULL guard) — never overwrites an existing snapshot", () => {
    const backfillUpdate = migrationCodeLower.match(
      /update\s+public\.dispatch_offers\s+d[\s\S]*?display_earnings_cents\s*=\s*c\.src_cents[\s\S]*?from\s+backfill_candidates/,
    );
    expect(backfillUpdate).not.toBeNull();
    /** The full UPDATE statement (including its WHERE) must contain the IS NULL safety belt. */
    const fullStatement = migrationCodeLower.match(
      /update\s+public\.dispatch_offers\s+d[\s\S]*?display_earnings_cents\s*=\s*c\.src_cents[\s\S]*?where[\s\S]*?d\.display_earnings_cents\s+is\s+null[\s\S]*?d\.status\s*=\s*'accepted'/,
    );
    expect(fullStatement).not.toBeNull();
  });

  it("backfill stamps the M-24 source code so the rows are forensically traceable", () => {
    expect(migrationCodeLower).toMatch(
      /earnings_snapshot_source\s*=\s*'m24_backfill_accepted_solo_from_booking'/,
    );
  });

  it("emits pre + post audit notices so deploy logs prove convergence", () => {
    const noticeStmts = migrationCodeLower.match(/raise\s+notice\s+'m-24/g) ?? [];
    /** One pre-cleanup notice + one post-cleanup notice. */
    expect(noticeStmts.length).toBeGreaterThanOrEqual(2);
    expect(migrationCodeLower).toContain("m-24 audit:");
    expect(migrationCodeLower).toContain("m-24 residual:");
  });

  it("uses for update skip locked on the stale-pending CTE so it cannot deadlock with the runtime expiry cron", () => {
    expect(migrationCodeLower).toMatch(
      /with\s+stale\s+as\s*\([\s\S]*?for\s+update\s+skip\s+locked/,
    );
  });

  it("does NOT redefine offer creation, payout formulas, or eligibility surfaces", () => {
    expect(migrationCodeLower).not.toMatch(/create\s+(or\s+replace\s+)?function\s+public\./);
    expect(migrationCodeLower).not.toMatch(/calculate_cleaner_payout/);
    expect(migrationCodeLower).not.toMatch(/booking_payable_for_weekly_batch/);
    expect(migrationCodeLower).not.toMatch(/compute_booking_earnings/);
    expect(migrationCodeLower).not.toMatch(/create_dispatch_offer_row/);
    expect(migrationCodeLower).not.toMatch(/accept_dispatch_offer_atomic/);
  });
});

// ---------------------------------------------------------------------------
// 2. Verification SQL guards
// ---------------------------------------------------------------------------
describe("M-24 verification: m24_historical_dispatch_offers_cleanup_verify.sql", () => {
  it("is read-only — no DDL, no DML", () => {
    expect(verifyCodeLower).not.toMatch(
      /\b(insert\s+into|update\s+(?!set\b)|delete\s+from|alter\s+|drop\s+|create\s+(?!or\s+replace\s+function)|truncate)\s+/,
    );
  });

  it("reports the stale-pending population (must be 0 post-migration)", () => {
    expect(verifyLower).toContain("stale_pending_total");
    expect(verifyCodeLower).toMatch(
      /from\s+public\.dispatch_offers[\s\S]*?where\s+status\s*=\s*'pending'\s+and\s+expires_at\s*<\s*now\(\)/,
    );
  });

  it("reports active-pending invariance (count must NOT change pre vs post)", () => {
    expect(verifyLower).toContain("active_pending_total");
    expect(verifyCodeLower).toMatch(
      /from\s+public\.dispatch_offers[\s\S]*?where\s+status\s*=\s*'pending'\s+and\s+expires_at\s*>\s*now\(\)/,
    );
  });

  it("reports the safe-backfill candidate count (must be 0 post-migration)", () => {
    expect(verifyLower).toContain("accepted_solo_no_snapshot_with_safe_source");
    expect(verifyCodeLower).toMatch(/d\.status\s*=\s*'accepted'/);
    expect(verifyCodeLower).toMatch(/coalesce\(b\.is_team_job,\s*false\)\s*=\s*false/);
    expect(verifyCodeLower).toMatch(/b\.cleaner_id\s*=\s*d\.cleaner_id/);
  });

  it("breaks down the unsafe (intentionally-skipped) accepted offers by reason", () => {
    expect(verifyLower).toContain("reason_team_job");
    expect(verifyLower).toContain("reason_cleaner_mismatch_or_null");
    expect(verifyLower).toContain("reason_booking_earnings_missing_or_zero");
  });

  it("includes a forensic check that active pending was never touched by M-24", () => {
    expect(verifyLower).toContain("active_pending_touched_by_m24_must_be_zero");
    expect(verifyCodeLower).toMatch(
      /earnings_snapshot_source\s*=\s*'m24_backfill_accepted_solo_from_booking'/,
    );
  });
});

// ---------------------------------------------------------------------------
// 3. Schema preservation: the columns / constraints / indexes the migration
//    relies on must continue to exist (locks the contract on neighbouring
//    migrations).
// ---------------------------------------------------------------------------
describe("M-24 schema preconditions: dispatch_offers shape stays intact", () => {
  it("status enum still includes 'pending' and 'expired' (20260437)", () => {
    const src = dispatchV3Sql.toLowerCase();
    expect(src).toMatch(
      /status\s+text\s+not\s+null\s+default\s+'pending'\s+check\s*\(\s*status\s+in\s*\('pending',\s*'accepted',\s*'rejected',\s*'expired'\)\s*\)/,
    );
  });

  it("dispatch_offers_one_pending_per_booking_uidx stays a partial index on pending only (so flipping pending → expired never duplicates)", () => {
    const src = dispatchV3Sql.toLowerCase();
    expect(src).toMatch(
      /create\s+unique\s+index\s+if\s+not\s+exists\s+dispatch_offers_one_pending_per_booking_uidx[\s\S]*?where\s+status\s*=\s*'pending'/,
    );
  });

  it("display_earnings_cents column is nullable with a >= 0 check (20260934)", () => {
    const src = earningsSnapshotMigrationSql.toLowerCase();
    expect(src).toMatch(
      /add\s+column\s+if\s+not\s+exists\s+display_earnings_cents\s+integer[\s\S]*?check\s*\(\s*display_earnings_cents\s+is\s+null\s+or\s+display_earnings_cents\s*>=\s*0\s*\)/,
    );
  });

  it("earnings_snapshot_source + earnings_snapshot_at columns exist on dispatch_offers", () => {
    const src = earningsSnapshotMigrationSql.toLowerCase();
    expect(src).toMatch(/add\s+column\s+if\s+not\s+exists\s+earnings_snapshot_source\s+text/);
    expect(src).toMatch(/add\s+column\s+if\s+not\s+exists\s+earnings_snapshot_at\s+timestamptz/);
  });
});

// ---------------------------------------------------------------------------
// 4. Runtime contract preservation: the historical cleanup must mirror, not
//    replace, the runtime expiry path. This guards against the cleanup
//    drifting from `runDispatchTimeouts` semantics.
// ---------------------------------------------------------------------------
describe("M-24 mirrors the runtime expiry contract (does not replace it)", () => {
  const webRoot = path.resolve(__dirname, "../../..");

  it("runDispatchTimeouts still uses the same `status='pending' AND expires_at < now()` selector + status='pending' CAS", () => {
    const src = readFileSync(path.join(webRoot, "lib/dispatch/runDispatchTimeouts.ts"), "utf8");
    /** Must still flip pending → expired with the CAS guard. */
    expect(src).toMatch(
      /\.update\(\{\s*status:\s*"expired",\s*responded_at:\s*respondedAt(?:,\s*expired_at:\s*respondedAt)?\s*\}\)[\s\S]*?\.eq\(\s*"status",\s*"pending"\s*\)/,
    );
  });

  it("expire_pending_dispatch_offers RPC still uses the same predicates (20260467)", () => {
    const src = expireOffersMaintenanceSql.toLowerCase();
    expect(src).toMatch(
      /from\s+public\.dispatch_offers\s+d\s+where\s+d\.status\s*=\s*'pending'\s+and\s+d\.expires_at\s*<\s*now\(\)/,
    );
    expect(src).toMatch(
      /update\s+public\.dispatch_offers\s+d\s+set[\s\S]*?status\s*=\s*'expired'/,
    );
  });

  it("the per-offer snapshot writer (dispatchOfferEarningsSnapshot) still uses `is null` so M-24 backfill rows are not overwritten by future runtime writes", () => {
    const src = readFileSync(
      path.join(webRoot, "lib/dispatch/dispatchOfferEarningsSnapshot.ts"),
      "utf8",
    );
    expect(src).toMatch(/\.is\(\s*"display_earnings_cents",\s*null\s*\)/);
  });

  it("the live-pending repair script still scopes to `expires_at > now()` (active future) — it is a different population from M-24", () => {
    const src = readFileSync(
      path.join(webRoot, "scripts/repairMissingDispatchOfferEarningsSnapshot.ts"),
      "utf8",
    );
    expect(src).toMatch(/\.eq\(\s*"status",\s*"pending"\s*\)/);
    expect(src).toMatch(/\.gt\(\s*"expires_at",\s*nowIso\s*\)/);
  });
});

// ---------------------------------------------------------------------------
// 5. Isolation: M-24 must not touch offer creation, payout formulas, or
//    eligibility logic.
// ---------------------------------------------------------------------------
describe("M-24 isolation: cleanup does not change creation logic / payout formulas / eligibility", () => {
  it("migration does not reference any payout-formula or eligibility surface", () => {
    expect(migrationLower).not.toContain("computecleanerofferearningssnapshot");
    expect(migrationLower).not.toContain("calculatecleanerpayout");
    expect(migrationLower).not.toContain("resolvecanonicalcleanerpayout");
    expect(migrationLower).not.toContain("bookingpayableforweeklybatch");
    expect(migrationLower).not.toContain("createdispatchofferrow");
  });

  it("migration does not insert or delete any rows — historical cleanup is UPDATE-only", () => {
    expect(migrationCodeLower).not.toMatch(/insert\s+into\s+public\.dispatch_offers/);
    expect(migrationCodeLower).not.toMatch(/delete\s+from\s+public\.dispatch_offers/);
  });

  it("migration does not write to bookings, cleaners, cleaner_payouts, or cleaner_earnings", () => {
    for (const tbl of ["bookings", "cleaners", "cleaner_payouts", "cleaner_payout_runs", "cleaner_earnings", "team_job_member_payouts", "booking_cleaner_earnings_snapshot"]) {
      expect(migrationCodeLower).not.toMatch(new RegExp(`update\\s+(public\\.)?${tbl}\\b`));
      expect(migrationCodeLower).not.toMatch(new RegExp(`insert\\s+into\\s+(public\\.)?${tbl}\\b`));
      expect(migrationCodeLower).not.toMatch(new RegExp(`delete\\s+from\\s+(public\\.)?${tbl}\\b`));
    }
  });
});
