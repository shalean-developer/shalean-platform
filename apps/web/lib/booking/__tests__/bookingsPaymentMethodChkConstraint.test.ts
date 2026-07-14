import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { readRepositoryMigration } from "@/lib/audit/resolveRepositoryMigration";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const {
  sql: migrationSql,
  resolved: migrationResolved,
} = readRepositoryMigration("20260936_bookings_payment_method_chk_add_eft_card.sql");
const adminMarkPaidPath = path.join(__dirname, "..", "adminMarkBookingPaid.ts");
const adminMarkPaidRoutePath = path.join(
  __dirname,
  "../../../app/api/admin/bookings/[id]/mark-paid/route.ts",
);

/**
 * Production Readiness Audit C-1 regression guard.
 *
 * Symptom before migration `20260936_bookings_payment_method_chk_add_eft_card.sql`:
 *   `bookings_payment_method_chk` only allowed {cash, zoho}, but
 *   `apps/web/lib/booking/adminMarkBookingPaid.ts` wrote `payment_method='eft'`,
 *   producing Postgres 23514 on every admin EFT mark-paid action.
 *
 * These tests are content-guards (filesystem-only, no DB connection), modelled on
 * `paystackFinalizeGatewayCallSites.test.ts`. The corresponding live constraint
 * behaviour ({cash,zoho,eft,card} accepted, others rejected) is verified via
 * `pg_get_constraintdef` + a savepointed UPDATE probe at deploy time.
 */
describe("bookings_payment_method_chk: cash | zoho | eft | card", () => {
  it("migration file exists at the documented path", () => {
    expect(migrationSql.length).toBeGreaterThan(0);
    expect(existsSync(migrationResolved.absolutePath)).toBe(true);
    expect(["active", "legacy"]).toContain(migrationResolved.kind);
  });

  it("migration drops then re-adds the constraint with all four allowed values", () => {
    const sql = migrationSql;

    expect(sql).toMatch(
      /alter\s+table\s+public\.bookings\s+drop\s+constraint\s+if\s+exists\s+bookings_payment_method_chk\s*;/i,
    );

    const addRe =
      /add\s+constraint\s+bookings_payment_method_chk[\s\S]*?check\s*\(\s*payment_method\s+is\s+null\s+or\s+payment_method\s+in\s*\(\s*'cash'\s*,\s*'zoho'\s*,\s*'eft'\s*,\s*'card'\s*\)\s*\)/i;
    expect(sql).toMatch(addRe);
  });

  it("migration is idempotent (uses DROP IF EXISTS, no ALTER ... ADD without DROP first)", () => {
    const sql = migrationSql.toLowerCase();
    const dropIdx = sql.indexOf("drop constraint if exists bookings_payment_method_chk");
    const addIdx = sql.indexOf("add constraint bookings_payment_method_chk");
    expect(dropIdx).toBeGreaterThan(-1);
    expect(addIdx).toBeGreaterThan(dropIdx);
  });

  it("migration scope is isolated: no payout / earnings / business-logic ALTERs", () => {
    const sql = migrationSql.toLowerCase();
    expect(sql).not.toMatch(/cleaner_payouts/);
    expect(sql).not.toMatch(/cleaner_earnings/);
    expect(sql).not.toMatch(/dispatch_offers/);
    expect(sql).not.toMatch(/payout_/);
    expect(sql).not.toMatch(/\binsert\s+into/);
    expect(sql).not.toMatch(/\bupdate\s+public\./);
    expect(sql).not.toMatch(/\bdelete\s+from/);
  });

  it("AdminMarkPaidMethod still includes 'eft' and the admin route accepts it", () => {
    const lib = readFileSync(adminMarkPaidPath, "utf8");
    expect(lib).toMatch(
      /export\s+type\s+AdminMarkPaidMethod\s*=\s*"cash"\s*\|\s*"zoho"\s*\|\s*"eft"/,
    );
    expect(lib).toMatch(/payment_method:\s*method/);

    const route = readFileSync(adminMarkPaidRoutePath, "utf8");
    expect(route).toContain("\"eft\"");
    expect(route).toMatch(/methodRaw\s*!==\s*"cash"\s*&&\s*methodRaw\s*!==\s*"zoho"\s*&&\s*methodRaw\s*!==\s*"eft"/);
  });

  it("no other production code writes an unsupported payment_method literal", () => {
    const candidates = [
      adminMarkPaidPath,
      path.join(__dirname, "..", "upsertBookingFromPaystack.ts"),
      path.join(__dirname, "..", "bookingOperations.ts"),
    ];
    const allowed = new Set(["cash", "zoho", "eft", "card"]);

    const literalRe = /payment_method\s*:\s*['"]([^'"]+)['"]/g;
    for (const p of candidates) {
      let src = "";
      try {
        src = readFileSync(p, "utf8");
      } catch {
        continue;
      }
      let m: RegExpExecArray | null;
      while ((m = literalRe.exec(src)) != null) {
        const value = m[1];
        expect(allowed, `unsupported payment_method literal '${value}' in ${p}`).toContain(value);
      }
    }
  });
});
