import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../../..");
const migrationPath = path.join(
  repoRoot,
  "supabase/migrations/20260938_h10_cleaner_financial_rls_identity_fix.sql",
);
const migrationSrc = readFileSync(migrationPath, "utf8");
const migrationLower = migrationSrc.toLowerCase();
/** Migration source with -- and /* *\/ comments stripped — used by tests
 * that need to operate on actual SQL statements only (the doc header
 * legitimately mentions CREATE POLICY etc. as prose). */
const migrationCode = migrationSrc
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/--[^\n]*/g, " ");
const migrationCodeLower = migrationCode.toLowerCase();

/** Splits a SQL string into one chunk per `create policy …` statement,
 * including the trailing one (JS regex has no `\z`, so a hand-written
 * splitter is more reliable than `(?=create\s+policy|\z)`). */
function splitPolicyBlocks(src: string): string[] {
  const out: string[] = [];
  const re = /create\s+policy/gi;
  const positions: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) != null) {
    positions.push(m.index);
  }
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i];
    const end = i + 1 < positions.length ? positions[i + 1] : src.length;
    out.push(src.slice(start, end));
  }
  return out;
}

/**
 * Production Readiness Audit H-10 — cleaner financial RLS identity convergence.
 *
 * The migration replaces `cleaner_id = auth.uid()` (surrogate-id misuse) with
 * the canonical `EXISTS (cleaners c WHERE c.id = …cleaner_id AND
 * (c.auth_user_id = auth.uid() OR c.id = auth.uid()))` pattern established by
 * `20260462_cleaners_rls_surrogate_auth.sql`. Live behavioural verification
 * (cleaner JWT can read own rows / cannot read other cleaners' rows /
 * service role unchanged) is performed via Supabase MCP `set local role
 * authenticated` probes at deploy time; these tests are filesystem guards
 * that lock the SQL contract so future migrations cannot regress it.
 */
describe("H-10 migration: 20260938_h10_cleaner_financial_rls_identity_fix.sql", () => {
  const expectedPolicies = [
    { table: "public.cleaner_payouts", name: "cleaner_payouts_select_own", cmd: "select" },
    { table: "public.cleaner_earnings", name: "cleaner_earnings_select_assigned", cmd: "select" },
    {
      table: "public.cleaner_earnings_disbursements",
      name: "cleaner_earnings_disbursements_select_own",
      cmd: "select",
    },
    {
      table: "public.booking_cleaner_earnings_snapshot",
      name: "bces_cleaner_select",
      cmd: "select",
    },
    {
      table: "public.booking_cleaner_earnings_snapshot_lines",
      name: "bcesl_cleaner_select",
      cmd: "select",
    },
    {
      table: "public.booking_totals",
      name: "booking_totals_cleaner_select_assigned",
      cmd: "select",
    },
    { table: "public.reviews", name: "reviews_select_owner_or_cleaner", cmd: "select" },
  ] as const;

  for (const p of expectedPolicies) {
    it(`drops then recreates ${p.name} on ${p.table}`, () => {
      const dropRe = new RegExp(
        `drop\\s+policy\\s+if\\s+exists\\s+${p.name}\\s+on\\s+${p.table.replace(".", "\\.")}`,
        "i",
      );
      const createRe = new RegExp(
        `create\\s+policy\\s+${p.name}\\s+on\\s+${p.table.replace(".", "\\.")}\\s+for\\s+${p.cmd}`,
        "i",
      );
      expect(migrationSrc).toMatch(dropRe);
      expect(migrationSrc).toMatch(createRe);
    });
  }

  it("uses the canonical EXISTS-cleaners pattern with auth_user_id OR surrogate id", () => {
    const occurrences = migrationLower.match(
      /c\.auth_user_id\s*=\s*auth\.uid\(\)\s*or\s*c\.id\s*=\s*auth\.uid\(\)/g,
    );
    expect(occurrences, "canonical predicate must appear once per affected policy").not.toBeNull();
    expect((occurrences ?? []).length).toBeGreaterThanOrEqual(expectedPolicies.length);
  });

  it("does NOT introduce any direct `cleaner_id = auth.uid()` comparisons", () => {
    const stripped = migrationLower
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/--[^\n]*/g, " ");
    expect(stripped).not.toMatch(/\bcleaner_id\s*=\s*auth\.uid\(\)/);
    expect(stripped).not.toMatch(/\bb\.cleaner_id\s*=\s*auth\.uid\(\)/);
  });

  it("only grants to `authenticated` (no anon access, no role widening)", () => {
    const matches = migrationSrc.match(/for\s+\w+\s+to\s+(\w+)/gi) ?? [];
    expect(matches.length).toBeGreaterThan(0);
    for (const m of matches) {
      expect(m.toLowerCase()).toMatch(/to\s+authenticated/);
    }
    expect(migrationLower).not.toMatch(/to\s+anon\b/);
    expect(migrationLower).not.toMatch(/to\s+public\b/);
  });

  it("each create policy is for SELECT only (no INSERT/UPDATE/DELETE/ALL widening)", () => {
    const create = splitPolicyBlocks(migrationCodeLower);
    expect(create.length).toBeGreaterThanOrEqual(expectedPolicies.length);
    for (const block of create) {
      expect(block).toMatch(/for\s+select/);
      expect(block).not.toMatch(/for\s+insert/);
      expect(block).not.toMatch(/for\s+update/);
      expect(block).not.toMatch(/for\s+delete/);
      expect(block).not.toMatch(/for\s+all/);
    }
  });

  it("contains no DDL outside RLS policy management (no ALTER TABLE, no DROP TABLE, no schema changes)", () => {
    const code = migrationLower
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/--[^\n]*/g, " ");
    expect(code).not.toMatch(/\balter\s+table\b/);
    expect(code).not.toMatch(/\bdrop\s+table\b/);
    expect(code).not.toMatch(/\bcreate\s+table\b/);
    expect(code).not.toMatch(/\binsert\s+into\b/);
    expect(code).not.toMatch(/\bupdate\s+public\./);
    expect(code).not.toMatch(/\bdelete\s+from\b/);
    expect(code).not.toMatch(/\bgrant\b/);
    expect(code).not.toMatch(/\brevoke\b/);
  });

  it("preserves the user_id customer path on reviews (only the cleaner branch is fixed)", () => {
    const reviewBlock = splitPolicyBlocks(migrationCodeLower).find((b) =>
      /create\s+policy\s+reviews_select_owner_or_cleaner/.test(b),
    );
    expect(reviewBlock).toBeDefined();
    if (reviewBlock) {
      expect(reviewBlock).toMatch(/user_id\s*=\s*auth\.uid\(\)/);
      expect(reviewBlock).toMatch(/c\.id\s*=\s*reviews\.cleaner_id/);
      expect(reviewBlock).toMatch(/c\.auth_user_id\s*=\s*auth\.uid\(\)/);
    }
  });

  it("each EXISTS subquery joins through public.cleaners using the surrogate id", () => {
    const blocks = splitPolicyBlocks(migrationCode);
    expect(blocks.length).toBeGreaterThanOrEqual(expectedPolicies.length);
    for (const block of blocks) {
      const hasJoin =
        /from\s+public\.cleaners\s+c/i.test(block) ||
        /join\s+public\.cleaners\s+c/i.test(block);
      const usesAuthUserId = /c\.auth_user_id\s*=\s*auth\.uid\(\)/i.test(block);
      expect(hasJoin, `policy block must reference public.cleaners c:\n${block.slice(0, 200)}`).toBe(
        true,
      );
      expect(
        usesAuthUserId,
        `policy block must use c.auth_user_id = auth.uid():\n${block.slice(0, 200)}`,
      ).toBe(true);
    }
  });
});

/**
 * Repo sweep — once H-10 is deployed, NO migration shipping AFTER it should
 * reintroduce the surrogate-id misuse. We allow earlier (pre-H-10) migration
 * files to keep the buggy text because they are historical and superseded by
 * `20260938`. Only the *newest* `cleaner_id = auth.uid()` occurrence is
 * pinned at or before that version.
 */
describe("H-10 repo sweep: no future migration may reintroduce cleaner_id = auth.uid()", () => {
  it("every remaining `cleaner_id = auth.uid()` occurrence lives in a migration ≤ 20260937 (pre-H-10) — superseded by H-10", () => {
    const dir = path.join(repoRoot, "supabase", "migrations");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql"));
    const offending: string[] = [];
    for (const file of files) {
      const src = readFileSync(path.join(dir, file), "utf8");
      const stripped = src
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/--[^\n]*/g, " ")
        .toLowerCase();
      if (/\bcleaner_id\s*=\s*auth\.uid\(\)/.test(stripped)) {
        offending.push(file);
      }
    }

    // Lexical sort matches deploy order (filenames are date-prefixed).
    // Assert no offending migration post-dates the H-10 fix.
    const h10 = "20260938_h10_cleaner_financial_rls_identity_fix.sql";
    const future = offending.filter((f) => f >= h10);
    expect(future, `migrations after ${h10} must not contain cleaner_id = auth.uid()`).toEqual([]);
  });
});
