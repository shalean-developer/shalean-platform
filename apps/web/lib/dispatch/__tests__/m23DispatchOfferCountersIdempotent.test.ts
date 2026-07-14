import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { readRepositoryMigration } from "@/lib/audit/resolveRepositoryMigration";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../../..");
const { sql: migrationSql } = readRepositoryMigration(
  "20260932_dispatch_offer_counters_idempotent.sql",
);

/** Strip `--` line comments and `/* … *​/` block comments so assertions
 * never false-match against doc-comment prose at the top of the file. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

const migrationCode = stripComments(migrationSql);
const migrationCodeLower = migrationCode.toLowerCase();

/**
 * M-23 regression suite for migration
 * `supabase/migrations/20260932_dispatch_offer_counters_idempotent.sql`.
 *
 * Background
 *   Migration 20260437 (`dispatch_v3_offers_acceptance.sql`) was the original
 *   home of `cleaners.total_offers / accepted_offers / acceptance_rate` and the
 *   `dispatch_cleaner_offer_sent / _accepted` counter RPCs. Some environments
 *   diverged from that baseline (the columns/RPCs went missing), and the runtime
 *   call site at `bumpCleanerOfferSentCounter` then raised
 *   SQLSTATE 42703 `column "total_offers" does not exist` on every offer
 *   creation. Migration 20260932 is the idempotent repair that restores both
 *   the columns AND the RPCs without conflicting with environments that
 *   already have them.
 *
 * The invariants pinned below MUST NOT regress:
 *   1. The three counter columns are added with `IF NOT EXISTS`, the correct
 *      defaults, and `NOT NULL`.
 *   2. The two counter RPCs are recreated with `CREATE OR REPLACE`,
 *      `SECURITY DEFINER`, and `set search_path = public`.
 *   3. The acceptance_rate backfill clamps to [0, 1] and only touches rows
 *      whose recomputed value differs (small-epsilon tolerance) — preserving
 *      the "do not rewrite already-correct rows" property that lets the
 *      migration re-run cheaply.
 *   4. The migration touches only `public.cleaners` and the two RPCs — no
 *      payout, dispatch_offers, or other table mutations leak in.
 *   5. The runtime caller (`bumpCleanerOfferSentCounter`) still calls the
 *      RPC by the same name with the same parameter shape, otherwise the
 *      migration's API would silently drift away from production code.
 *
 * Out of scope: live behaviour of the RPCs is verified at deploy time via
 * `pg_proc` introspection. These tests are filesystem-only and never connect
 * to a database.
 */
describe("M-23: 20260932 dispatch_offer_counters_idempotent — schema invariants", () => {
  it("migration file exists and is non-empty", () => {
    expect(migrationSql.length).toBeGreaterThan(0);
  });

  it("adds cleaners.total_offers as INTEGER NOT NULL DEFAULT 0 with IF NOT EXISTS", () => {
    expect(migrationCode).toMatch(
      /alter\s+table\s+public\.cleaners\s+add\s+column\s+if\s+not\s+exists\s+total_offers\s+integer\s+not\s+null\s+default\s+0\s*;/i,
    );
  });

  it("adds cleaners.accepted_offers as INTEGER NOT NULL DEFAULT 0 with IF NOT EXISTS", () => {
    expect(migrationCode).toMatch(
      /alter\s+table\s+public\.cleaners\s+add\s+column\s+if\s+not\s+exists\s+accepted_offers\s+integer\s+not\s+null\s+default\s+0\s*;/i,
    );
  });

  it("adds cleaners.acceptance_rate as REAL NOT NULL DEFAULT 1.0 with IF NOT EXISTS", () => {
    expect(migrationCode).toMatch(
      /alter\s+table\s+public\.cleaners\s+add\s+column\s+if\s+not\s+exists\s+acceptance_rate\s+real\s+not\s+null\s+default\s+1\.0\s*;/i,
    );
  });

  it("backfills acceptance_rate using the same least(1, greatest(0, accepted/total)) clamp the RPCs use", () => {
    expect(migrationCodeLower).toMatch(/least\s*\(\s*1\.0::real\s*,\s*greatest\s*\(\s*0\.0::real\s*,/);
    expect(migrationCodeLower).toMatch(
      /accepted_offers::real\s*\/\s*total_offers::real/,
    );
  });

  it("backfill is bounded to rows whose stored value drifted from the recomputed value (re-runnable, no churn)", () => {
    expect(migrationCodeLower).toMatch(
      /where\s+acceptance_rate\s+is\s+null\s+or\s+\(\s*total_offers\s*>\s*0\s+and\s+abs\s*\(\s*acceptance_rate\s*-\s*\(\s*accepted_offers::real\s*\/\s*nullif\s*\(\s*total_offers\s*,\s*0\s*\)::real\s*\)\s*\)\s*>\s*0\.0001\s*\)/,
    );
  });

  it("creates `dispatch_cleaner_offer_sent(uuid)` via CREATE OR REPLACE FUNCTION + SECURITY DEFINER + search_path = public", () => {
    expect(migrationCode).toMatch(
      /create\s+or\s+replace\s+function\s+public\.dispatch_cleaner_offer_sent\s*\(\s*p_cleaner_id\s+uuid\s*\)\s*returns\s+void\s+language\s+plpgsql\s+security\s+definer\s+set\s+search_path\s*=\s*public/i,
    );
  });

  it("creates `dispatch_cleaner_offer_accepted(uuid)` via CREATE OR REPLACE FUNCTION + SECURITY DEFINER + search_path = public", () => {
    expect(migrationCode).toMatch(
      /create\s+or\s+replace\s+function\s+public\.dispatch_cleaner_offer_accepted\s*\(\s*p_cleaner_id\s+uuid\s*\)\s*returns\s+void\s+language\s+plpgsql\s+security\s+definer\s+set\s+search_path\s*=\s*public/i,
    );
  });

  it("`dispatch_cleaner_offer_sent` increments total_offers atomically and clamps acceptance_rate to [0,1]", () => {
    const fnRe = /create\s+or\s+replace\s+function\s+public\.dispatch_cleaner_offer_sent[\s\S]*?\$\$\s*;/i;
    const m = migrationCode.match(fnRe);
    expect(m, "dispatch_cleaner_offer_sent function body must end with $$;").not.toBeNull();
    if (m) {
      const body = m[0].toLowerCase();
      expect(body).toMatch(/total_offers\s*=\s*total_offers\s*\+\s*1/);
      expect(body).toMatch(/least\s*\(\s*1\.0::real\s*,\s*greatest\s*\(\s*0\.0::real/);
      expect(body).toMatch(/where\s+id\s*=\s*p_cleaner_id/);
    }
  });

  it("`dispatch_cleaner_offer_accepted` increments accepted_offers atomically and clamps acceptance_rate to [0,1]", () => {
    const fnRe = /create\s+or\s+replace\s+function\s+public\.dispatch_cleaner_offer_accepted[\s\S]*?\$\$\s*;/i;
    const m = migrationCode.match(fnRe);
    expect(m, "dispatch_cleaner_offer_accepted function body must end with $$;").not.toBeNull();
    if (m) {
      const body = m[0].toLowerCase();
      expect(body).toMatch(/accepted_offers\s*=\s*accepted_offers\s*\+\s*1/);
      expect(body).toMatch(/least\s*\(\s*1\.0::real\s*,\s*greatest\s*\(\s*0\.0::real/);
      expect(body).toMatch(/where\s+id\s*=\s*p_cleaner_id/);
    }
  });

  it("comments each new column so a future schema audit can attribute it", () => {
    expect(migrationCode).toMatch(/comment\s+on\s+column\s+public\.cleaners\.total_offers\s+is/i);
    expect(migrationCode).toMatch(/comment\s+on\s+column\s+public\.cleaners\.accepted_offers\s+is/i);
    expect(migrationCode).toMatch(/comment\s+on\s+column\s+public\.cleaners\.acceptance_rate\s+is/i);
  });
});

describe("M-23: 20260932 dispatch_offer_counters_idempotent — isolation", () => {
  it("does not touch any table other than public.cleaners", () => {
    const tableMatches = Array.from(
      migrationCodeLower.matchAll(/\b(?:alter|insert\s+into|update|delete\s+from)\s+(?:table\s+)?(public\.[a-z_][a-z0-9_]*)/g),
    ).map((m) => m[1]);
    for (const t of tableMatches) {
      expect(t).toBe("public.cleaners");
    }
  });

  it("does not introduce any DROP, GRANT/REVOKE, RLS policy, or trigger statements", () => {
    expect(migrationCodeLower).not.toMatch(/\bdrop\s+(?:table|column|function|trigger|policy|index)\b/);
    expect(migrationCodeLower).not.toMatch(/\bgrant\b/);
    expect(migrationCodeLower).not.toMatch(/\brevoke\b/);
    expect(migrationCodeLower).not.toMatch(/\bcreate\s+policy\b/);
    expect(migrationCodeLower).not.toMatch(/\benable\s+row\s+level\s+security\b/);
    expect(migrationCodeLower).not.toMatch(/\bcreate\s+trigger\b/);
  });

  it("does not introduce or change any payout / dispatch_offers / cleaner_payouts schema", () => {
    expect(migrationCodeLower).not.toMatch(/\bpublic\.dispatch_offers\b/);
    expect(migrationCodeLower).not.toMatch(/\bpublic\.cleaner_payouts\b/);
    expect(migrationCodeLower).not.toMatch(/\bpublic\.cleaner_earnings\b/);
    expect(migrationCodeLower).not.toMatch(/\bpublic\.bookings\b/);
  });
});

describe("M-23: 20260932 runtime caller still uses the RPC by the documented name + arg shape", () => {
  it("bumpCleanerOfferSentCounter calls `dispatch_cleaner_offer_sent` with `{ p_cleaner_id }`", () => {
    const src = readFileSync(
      path.resolve(__dirname, "..", "dispatchOfferCounterRpc.ts"),
      "utf8",
    );
    expect(src).toMatch(
      /\.rpc\(\s*["']dispatch_cleaner_offer_sent["']\s*,\s*\{\s*p_cleaner_id:\s*params\.cleanerId\s*,?\s*\}/,
    );
  });

  it("classifier still treats SQLSTATE 42703 as `missing_column` so a missing migration never blocks dispatch", () => {
    const src = readFileSync(
      path.resolve(__dirname, "..", "dispatchOfferCounterRpc.ts"),
      "utf8",
    );
    expect(src).toMatch(/POSTGRES_UNDEFINED_COLUMN_CODE\s*=\s*["']42703["']/);
    expect(src).toMatch(/missing_column/);
    expect(src).toMatch(/20260932_dispatch_offer_counters_idempotent\.sql/);
  });
});
