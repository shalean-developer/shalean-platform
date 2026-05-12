import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../../..");
const migrationsDir = path.join(repoRoot, "supabase", "migrations");
const migrationPath = path.join(
  migrationsDir,
  "20260942_h14_m19_hot_path_composite_indexes.sql",
);
const runbookPath = path.join(
  repoRoot,
  "supabase",
  "queries",
  "h14_m19_hot_path_composite_indexes_concurrently.sql",
);

const migrationSql = readFileSync(migrationPath, "utf8");
const migrationSqlLower = migrationSql.toLowerCase();
const runbookSql = readFileSync(runbookPath, "utf8");
const runbookSqlLower = runbookSql.toLowerCase();

/** Strip -- and / *... * / comments so tests operate on actual SQL statements
 * only (the doc headers legitimately mention `CREATE POLICY`, CONCURRENTLY,
 * etc. as prose). */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

const migrationCode = stripComments(migrationSql);
const migrationCodeLower = migrationCode.toLowerCase();
const runbookCode = stripComments(runbookSql);
const runbookCodeLower = runbookCode.toLowerCase();

/**
 * Production Readiness Audit H-14 (HIGH) and M-19 (MEDIUM) — hot-path composite
 * indexes for booking dashboards, dispatch, cleaner offers, notification cooldown,
 * and payout scans.
 *
 * The migration file uses plain `CREATE INDEX IF NOT EXISTS` so it is
 * compatible with Supabase's transactional migration runner / SQL editor /
 * MCP `execute_sql` (CONCURRENTLY would fail with SQLSTATE 25001 inside a
 * transaction). The matching runbook at
 *   supabase/queries/h14_m19_hot_path_composite_indexes_concurrently.sql
 * provides CONCURRENTLY variants for online application during peak traffic.
 *
 * These tests are filesystem-level guards that lock the contract:
 *   - exactly the four audited indexes are created in the migration;
 *   - every CREATE INDEX is IF NOT EXISTS guarded (idempotent re-apply);
 *   - the runbook offers CONCURRENTLY variants for the same four indexes,
 *     keyed by identical names + key shapes so the two paths converge;
 *   - no other DDL leaks into either file (no schema changes, no payout /
 *     dispatch logic touched, no row mutations, no policies);
 *   - no prior migration creates an identically-named index (no duplicate /
 *     redundant indexes are introduced).
 *
 * Behavioural verification (EXPLAIN / pg_stat_user_indexes) is performed live
 * via Supabase MCP at deploy time; these tests guard the SQL contract so the
 * deployment evidence cannot regress underneath us.
 */

const EXPECTED_INDEXES = [
  {
    name: "bookings_status_date_time_desc_idx",
    table: "public.bookings",
    keys: "(status, date desc, time desc)",
    partial: false,
    audit: "H-14",
  },
  {
    name: "bookings_user_id_created_at_idx",
    table: "public.bookings",
    keys: "(user_id, created_at desc)",
    partial: true,
    partialPredicate: /where\s+user_id\s+is\s+not\s+null/,
    audit: "H-14",
  },
  {
    name: "dispatch_offers_booking_cleaner_status_idx",
    table: "public.dispatch_offers",
    keys: "(booking_id, cleaner_id, status)",
    partial: false,
    audit: "M-19",
  },
  {
    name: "notification_logs_booking_template_created_idx",
    table: "public.notification_logs",
    keys: "(booking_id, template_key, created_at desc)",
    partial: true,
    partialPredicate: /where\s+booking_id\s+is\s+not\s+null/,
    audit: "M-19",
  },
] as const;

function keyShapeRe(keys: string): string {
  return keys
    .replace(/^\(/, "")
    .replace(/\)$/, "")
    .split(",")
    .map((c) => c.trim().replace(/\s+/g, "\\s+"))
    .join("\\s*,\\s*");
}

describe("H-14 / M-19 migration: 20260942_h14_m19_hot_path_composite_indexes.sql", () => {
  it("uses plain CREATE INDEX (no CONCURRENTLY) so it stays compatible with the transactional migration runner / SQL editor / MCP RPC", () => {
    expect(
      migrationCodeLower,
      "Supabase wraps statements in transactions which Postgres rejects for CONCURRENTLY (SQLSTATE 25001). The runbook is the right home for CONCURRENTLY.",
    ).not.toMatch(/create\s+index\s+concurrently/);
  });

  for (const ix of EXPECTED_INDEXES) {
    it(`creates ${ix.name} on ${ix.table} ${ix.keys} via IF NOT EXISTS`, () => {
      const tableEsc = ix.table.replace(".", "\\.");
      const re = new RegExp(
        `create\\s+index\\s+if\\s+not\\s+exists\\s+${ix.name}\\s+on\\s+${tableEsc}\\s*\\(\\s*${keyShapeRe(ix.keys)}\\s*\\)`,
        "i",
      );
      expect(migrationCode, `${ix.name} must be created IF NOT EXISTS`).toMatch(re);
    });

    if (ix.partial) {
      it(`scopes ${ix.name} to a partial WHERE predicate matching its sibling single-column index`, () => {
        const stmtRe = new RegExp(
          `create\\s+index\\s+if\\s+not\\s+exists\\s+${ix.name}[\\s\\S]*?;`,
          "i",
        );
        const m = migrationCode.match(stmtRe);
        expect(m, `${ix.name} statement must terminate with a semicolon`).not.toBeNull();
        if (m) {
          expect(m[0]).toMatch(ix.partialPredicate!);
        }
      });
    }

    it(`comments ${ix.name} so DBAs can attribute it to ${ix.audit}`, () => {
      const re = new RegExp(`comment\\s+on\\s+index\\s+public\\.${ix.name}\\s+is`, "i");
      expect(migrationCode).toMatch(re);
      const commentRe = new RegExp(
        `comment\\s+on\\s+index\\s+public\\.${ix.name}\\s+is\\s+'([^']*)'`,
        "i",
      );
      const cm = migrationCode.match(commentRe);
      expect(cm, `${ix.name} must carry a free-text comment`).not.toBeNull();
      if (cm) {
        expect(cm[1].toLowerCase(), "comment should reference the audit ticket").toMatch(/h-?14|m-?19/);
      }
    });
  }

  it("creates exactly four indexes (no scope creep)", () => {
    const matches = migrationCodeLower.match(/create\s+index\s+if\s+not\s+exists/g) ?? [];
    expect(matches).toHaveLength(EXPECTED_INDEXES.length);
  });

  it("every CREATE INDEX uses IF NOT EXISTS (idempotent re-apply)", () => {
    const allCreates = migrationCodeLower.match(/create\s+index[^;]*?;/g) ?? [];
    expect(allCreates.length).toBe(EXPECTED_INDEXES.length);
    for (const c of allCreates) {
      expect(c).toMatch(/if\s+not\s+exists/);
    }
  });
});

describe("H-14 / M-19 migration: hardening rules", () => {
  it("contains no DDL outside CREATE INDEX + COMMENT (no table changes, no policies, no functions)", () => {
    expect(migrationCodeLower).not.toMatch(/\balter\s+table\b/);
    expect(migrationCodeLower).not.toMatch(/\bdrop\s+table\b/);
    expect(migrationCodeLower).not.toMatch(/\bcreate\s+table\b/);
    expect(migrationCodeLower).not.toMatch(/\bdrop\s+index\b/);
    expect(migrationCodeLower).not.toMatch(/\bcreate\s+(or\s+replace\s+)?function\b/);
    expect(migrationCodeLower).not.toMatch(/\bcreate\s+policy\b/);
    expect(migrationCodeLower).not.toMatch(/\bdrop\s+policy\b/);
    expect(migrationCodeLower).not.toMatch(/\binsert\s+into\b/);
    expect(migrationCodeLower).not.toMatch(/\bupdate\s+public\./);
    expect(migrationCodeLower).not.toMatch(/\bdelete\s+from\b/);
    expect(migrationCodeLower).not.toMatch(/\bgrant\b/);
    expect(migrationCodeLower).not.toMatch(/\brevoke\b/);
    expect(migrationCodeLower).not.toMatch(/\benable\s+row\s+level\s+security\b/);
  });

  it("does not touch payout, dispatch, or notification logic tables outside the audited four", () => {
    const allowedTables = new Set([
      "public.bookings",
      "public.dispatch_offers",
      "public.notification_logs",
    ]);
    const onMatches = Array.from(
      migrationCodeLower.matchAll(/on\s+(public\.[a-z_][a-z0-9_]*)\s*\(/g),
    ).map((m) => m[1]);
    expect(onMatches.length).toBe(EXPECTED_INDEXES.length);
    for (const t of onMatches) {
      expect(allowedTables, `unexpected table touched by H-14/M-19 migration: ${t}`).toContain(t);
    }
  });

  it("no other migration already creates an identically-named index (no duplicate-name collision)", () => {
    const newNames = new Set(EXPECTED_INDEXES.map((x) => x.name));
    const allMigrations = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
    const me = path.basename(migrationPath);
    for (const file of allMigrations) {
      if (file === me) continue;
      const src = readFileSync(path.join(migrationsDir, file), "utf8").toLowerCase();
      for (const name of newNames) {
        const re = new RegExp(`\\bindex\\s+(concurrently\\s+)?(if\\s+not\\s+exists\\s+)?${name}\\b`);
        expect(
          re.test(src),
          `${file} already references the new index name ${name} — pick a different name to avoid duplicate-creation collisions`,
        ).toBe(false);
      }
    }
  });
});

describe("H-14 / M-19 runbook: h14_m19_hot_path_composite_indexes_concurrently.sql", () => {
  it("explicitly documents that it is NOT a migration (only operators run it manually, statement-by-statement)", () => {
    expect(runbookSqlLower).toMatch(/not\s+a\s+migration/);
  });

  it("references the migration file by name so future readers can find it", () => {
    expect(runbookSql).toMatch(/20260942_h14_m19_hot_path_composite_indexes\.sql/);
  });

  it("calls out the 25001 transaction-block error and how to avoid it", () => {
    expect(runbookSqlLower).toMatch(/25001/);
    expect(runbookSqlLower).toMatch(/transaction/);
  });

  for (const ix of EXPECTED_INDEXES) {
    it(`provides a CONCURRENTLY variant for ${ix.name} with the same key shape as the migration`, () => {
      const tableEsc = ix.table.replace(".", "\\.");
      const re = new RegExp(
        `create\\s+index\\s+concurrently\\s+if\\s+not\\s+exists\\s+${ix.name}\\s+on\\s+${tableEsc}\\s*\\(\\s*${keyShapeRe(ix.keys)}\\s*\\)`,
        "i",
      );
      expect(runbookCode, `runbook must offer CONCURRENTLY variant for ${ix.name}`).toMatch(re);
      if (ix.partial) {
        const stmtRe = new RegExp(
          `create\\s+index\\s+concurrently\\s+if\\s+not\\s+exists\\s+${ix.name}[\\s\\S]*?;`,
          "i",
        );
        const m = runbookCode.match(stmtRe);
        expect(m, `runbook ${ix.name} statement must terminate with a semicolon`).not.toBeNull();
        if (m) {
          expect(m[0]).toMatch(ix.partialPredicate!);
        }
      }
    });
  }

  it("creates exactly four CONCURRENTLY indexes (mirrors migration scope)", () => {
    const matches = runbookCodeLower.match(/create\s+index\s+concurrently\s+if\s+not\s+exists/g) ?? [];
    expect(matches).toHaveLength(EXPECTED_INDEXES.length);
  });

  it("contains no destructive DDL (read/index-only ops runbook)", () => {
    expect(runbookCodeLower).not.toMatch(/\balter\s+table\b/);
    expect(runbookCodeLower).not.toMatch(/\bdrop\s+table\b/);
    expect(runbookCodeLower).not.toMatch(/\bcreate\s+table\b/);
    expect(runbookCodeLower).not.toMatch(/\binsert\s+into\b/);
    expect(runbookCodeLower).not.toMatch(/\bupdate\s+public\./);
    expect(runbookCodeLower).not.toMatch(/\bdelete\s+from\b/);
    expect(runbookCodeLower).not.toMatch(/\bcreate\s+(or\s+replace\s+)?function\b/);
    expect(runbookCodeLower).not.toMatch(/\bcreate\s+policy\b/);
    expect(runbookCodeLower).not.toMatch(/\bdrop\s+policy\b/);
    expect(runbookCodeLower).not.toMatch(/\bgrant\b/);
    expect(runbookCodeLower).not.toMatch(/\brevoke\b/);
  });
});

/**
 * Audit summary — for each new composite, prove that the referenced production
 * call site still issues the query shape the index is meant to accelerate. If a
 * future refactor changes the predicate / order-by, the index becomes dead
 * weight; this check makes that drift loud at PR time.
 */
describe("H-14 / M-19 hot-path query shapes still match the new indexes", () => {
  const webRoot = path.resolve(__dirname, "..", "..", "..");

  function readSrc(rel: string): string {
    return readFileSync(path.join(webRoot, rel), "utf8");
  }

  it("loadCustomerBookingRowsForUser still filters user_id and orders by created_at desc", () => {
    const src = readSrc("lib/customer/customerBookingsForUser.ts");
    expect(src).toMatch(/from\(\s*["']bookings["']\s*\)/);
    expect(src).toMatch(/\.eq\(\s*["']user_id["']/);
    expect(src).toMatch(/\.order\(\s*["']created_at["']\s*,\s*\{\s*ascending:\s*false/);
  });

  it("dashboard summary route still issues `WHERE user_id = ? ORDER BY date DESC, created_at DESC`", () => {
    const src = readSrc("app/api/dashboard/summary/route.ts");
    expect(src).toMatch(/\.eq\(\s*["']user_id["']/);
    expect(src).toMatch(/\.order\(\s*["']date["']\s*,\s*\{\s*ascending:\s*false/);
    expect(src).toMatch(/\.order\(\s*["']created_at["']\s*,\s*\{\s*ascending:\s*false/);
  });

  it("persistCleanerPayout's open-offer probe still keys on (booking_id, cleaner_id, status='pending')", () => {
    const src = readSrc("lib/payout/persistCleanerPayout.ts");
    expect(src).toMatch(/from\(\s*["']dispatch_offers["']\s*\)/);
    expect(src).toMatch(/\.eq\(\s*["']booking_id["']/);
    expect(src).toMatch(/\.eq\(\s*["']cleaner_id["']/);
    expect(src).toMatch(/\.eq\(\s*["']status["']\s*,\s*["']pending["']/);
  });

  it("notifyCleanerBookingPaid cooldown probe still keys on (booking_id, template_key, created_at)", () => {
    const src = readSrc("lib/notifications/notifyCleanerBookingPaid.ts");
    expect(src).toMatch(/from\(\s*["']notification_logs["']\s*\)/);
    expect(src).toMatch(/\.eq\(\s*["']booking_id["']/);
    expect(src).toMatch(/\.eq\(\s*["']template_key["']/);
    expect(src).toMatch(/\.gte\(\s*["']created_at["']/);
  });
});
