import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../../..");
const webRoot = path.resolve(__dirname, "..", "..", "..");
const migrationPath = path.join(
  repoRoot,
  "supabase/migrations/20260933_cleaners_joined_at_repair.sql",
);

const migrationSql = readFileSync(migrationPath, "utf8");

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

const migrationCode = stripComments(migrationSql);
const migrationCodeLower = migrationCode.toLowerCase();

/**
 * M-23 regression suite for migration
 * `supabase/migrations/20260933_cleaners_joined_at_repair.sql`.
 *
 * Background
 *   Multiple call sites in the cleaner payout calculator
 *   (`canonicalCleanerPayout`, `tenureBasedCleanerLineShare`,
 *   `computeBookingEarnings`, `persistCleanerPayout`) read
 *   `cleaners.joined_at` as the canonical tenure anchor, with
 *   `joined_at ?? created_at` as the fallback. Migration 20260846 even used
 *   `COALESCE(c.joined_at, c.created_at)` in SQL — proving the column was
 *   assumed-present. The CREATE migration was never authored, so every solo
 *   cleaner job persist failed with `column cleaners.joined_at does not exist`,
 *   leaving `bookings.display_earnings_cents` NULL and blocking job completion.
 *
 * Migration 20260933 adds the column idempotently, backfills existing rows
 * to `joined_at = created_at` (matching the COALESCE semantics already in
 * code/SQL), and leaves the column nullable so app code's
 * `joined_at ?? created_at` fallback continues to work.
 *
 * The invariants pinned below MUST NOT regress:
 *   1. The column is added with `IF NOT EXISTS`, type `TIMESTAMPTZ`, and
 *      remains nullable (no `NOT NULL`, no `DEFAULT now()`).
 *   2. The backfill targets only rows where `joined_at IS NULL` — already-
 *      set explicit values (e.g. an admin recording a real onboarding date)
 *      MUST be preserved across re-runs.
 *   3. The migration touches only `public.cleaners.joined_at` — no payout
 *      formulas, no dispatch state, no other tables.
 *   4. The runtime call sites (`tenureBasedCleanerLineShare`,
 *      `canonicalCleanerPayout`) still read `joined_at` first and fall back
 *      to `created_at` — so a future schema rename can't silently break the
 *      tenure anchor.
 *
 * Out of scope: live behaviour is verified at deploy time via `\d cleaners`
 * + a `SELECT joined_at, created_at FROM cleaners LIMIT 5` probe. These
 * tests are filesystem-only and never connect to a database.
 */
describe("M-23: 20260933 cleaners_joined_at_repair — schema invariants", () => {
  it("migration file exists and is non-empty", () => {
    expect(migrationSql.length).toBeGreaterThan(0);
  });

  it("adds cleaners.joined_at as TIMESTAMPTZ via IF NOT EXISTS (idempotent re-apply)", () => {
    expect(migrationCode).toMatch(
      /alter\s+table\s+public\.cleaners\s+add\s+column\s+if\s+not\s+exists\s+joined_at\s+timestamptz\s*;/i,
    );
  });

  it("does NOT make joined_at NOT NULL (app code reads `joined_at ?? created_at`; null must remain valid)", () => {
    const stmtRe = /add\s+column\s+if\s+not\s+exists\s+joined_at\s+[^;]*?;/i;
    const m = migrationCode.match(stmtRe);
    expect(m, "joined_at ALTER must terminate with a semicolon").not.toBeNull();
    if (m) {
      expect(m[0].toLowerCase()).not.toMatch(/\bnot\s+null\b/);
    }
  });

  it("does NOT add a DEFAULT (an explicit admin-recorded onboarding date must take precedence)", () => {
    const stmtRe = /add\s+column\s+if\s+not\s+exists\s+joined_at\s+[^;]*?;/i;
    const m = migrationCode.match(stmtRe);
    expect(m).not.toBeNull();
    if (m) {
      expect(m[0].toLowerCase()).not.toMatch(/\bdefault\b/);
    }
  });

  it("backfills joined_at = created_at for rows where joined_at IS NULL (mirrors COALESCE semantics in code)", () => {
    expect(migrationCode).toMatch(
      /update\s+public\.cleaners\s+set\s+joined_at\s*=\s*created_at\s+where\s+joined_at\s+is\s+null\s*;/i,
    );
  });

  it("backfill is bounded by `WHERE joined_at IS NULL` so re-runs preserve explicit values", () => {
    const updateMatches = Array.from(migrationCodeLower.matchAll(/update\s+public\.cleaners[^;]*?;/g));
    expect(updateMatches.length).toBeGreaterThan(0);
    for (const m of updateMatches) {
      expect(m[0]).toMatch(/where\s+joined_at\s+is\s+null/);
    }
  });

  it("comments the new column so a future schema audit knows it is the tenure anchor", () => {
    expect(migrationCode).toMatch(/comment\s+on\s+column\s+public\.cleaners\.joined_at\s+is/i);
  });
});

describe("M-23: 20260933 cleaners_joined_at_repair — isolation", () => {
  it("only mutates public.cleaners (no payout / dispatch / booking schema or data changes)", () => {
    const tableMatches = Array.from(
      migrationCodeLower.matchAll(/\b(?:alter\s+table|insert\s+into|update|delete\s+from)\s+(public\.[a-z_][a-z0-9_]*)/g),
    ).map((m) => m[1]);
    for (const t of tableMatches) {
      expect(t).toBe("public.cleaners");
    }
  });

  it("introduces no functions, triggers, policies, indexes, grants, or RLS toggles", () => {
    expect(migrationCodeLower).not.toMatch(/\bcreate\s+(or\s+replace\s+)?function\b/);
    expect(migrationCodeLower).not.toMatch(/\bcreate\s+trigger\b/);
    expect(migrationCodeLower).not.toMatch(/\bcreate\s+policy\b/);
    expect(migrationCodeLower).not.toMatch(/\bcreate\s+index\b/);
    expect(migrationCodeLower).not.toMatch(/\bgrant\b/);
    expect(migrationCodeLower).not.toMatch(/\brevoke\b/);
    expect(migrationCodeLower).not.toMatch(/\benable\s+row\s+level\s+security\b/);
    expect(migrationCodeLower).not.toMatch(/\bdrop\s+(?:table|column|function|trigger|policy|index)\b/);
  });

  it("does not touch payout, dispatch, or booking tables", () => {
    expect(migrationCodeLower).not.toMatch(/\bpublic\.bookings\b/);
    expect(migrationCodeLower).not.toMatch(/\bpublic\.cleaner_payouts\b/);
    expect(migrationCodeLower).not.toMatch(/\bpublic\.cleaner_earnings\b/);
    expect(migrationCodeLower).not.toMatch(/\bpublic\.dispatch_offers\b/);
  });
});

describe("M-23: 20260933 runtime call sites still read joined_at first with created_at fallback", () => {
  it("tenureBasedCleanerLineShare selects `joined_at, created_at` from cleaners and falls back via `??`", () => {
    const src = readFileSync(path.join(webRoot, "lib/payout/tenureBasedCleanerLineShare.ts"), "utf8");
    expect(src).toMatch(/from\(\s*["']cleaners["']\s*\)/);
    expect(src).toMatch(/\.select\(\s*["']joined_at,\s*created_at["']\s*\)/);
    expect(src).toMatch(/joined_at\s*\?\?\s*row\.created_at/);
  });

  it("dispatchOfferEarningsSnapshot selects `joined_at, created_at` from cleaners (same anchor contract)", () => {
    const src = readFileSync(path.join(webRoot, "lib/dispatch/dispatchOfferEarningsSnapshot.ts"), "utf8");
    expect(src).toMatch(/from\(\s*["']cleaners["']\s*\)/);
    expect(src).toMatch(/joined_at/);
    expect(src).toMatch(/created_at/);
  });

  it("canonicalCleanerPayout still documents joined_at as the canonical tenure anchor", () => {
    const src = readFileSync(path.join(webRoot, "lib/payout/canonicalCleanerPayout.ts"), "utf8");
    expect(src).toMatch(/joined_at/);
  });
});
