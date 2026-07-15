import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { readRepositoryMigration } from "@/lib/audit/resolveRepositoryMigration";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../../..");
const webRoot = path.resolve(__dirname, "..", "..", "..");
const { sql: migrationSql } = readRepositoryMigration(
  "20260935_resolve_auth_user_id_by_email_and_link.sql",
);

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

const migrationCode = stripComments(migrationSql);
const migrationCodeLower = migrationCode.toLowerCase();

/**
 * M-23 regression suite for migration
 * `supabase/migrations/20260935_resolve_auth_user_id_by_email_and_link.sql`.
 *
 * Background
 *   The original migration (`20260424_booking_auto_link_users.sql`) created
 *   the `public.resolve_auth_user_id_by_email(text)` RPC and the
 *   `auto_link_booking_user` BEFORE INSERT trigger that map a normalised
 *   customer email to `auth.users.id`. The active database
 *   (`tchayecuvzssixyxlvfu`) was found to be missing both objects, breaking:
 *     - admin booking customer search (`/api/admin/bookings/customers`)
 *     - admin user creation (false-positive duplicate-email errors)
 *     - guest booking → user link backfill on Paystack init
 *
 * Migration 20260935 idempotently re-creates the RPC + trigger and runs a
 * one-shot backfill that links existing orphan bookings whose email now
 * resolves to a real auth user.
 *
 * The invariants pinned below MUST NOT regress:
 *   1. The RPC is `CREATE OR REPLACE`, returns `uuid`, is `LANGUAGE sql`,
 *      `SECURITY DEFINER`, `STABLE`, and pins `search_path = public`. The
 *      lookup is case- + whitespace-insensitive on `auth.users.email`.
 *   2. RPC permissions: revoked from PUBLIC, granted only to `service_role`.
 *      (Admin/customer flows always run via the service-role admin client.)
 *   3. The `link_booking_to_user()` trigger function only sets `user_id`
 *      when the inserted row's `user_id IS NULL` AND `customer_email` is
 *      non-empty — it MUST NOT overwrite an explicit `user_id`.
 *   4. The trigger is `BEFORE INSERT … FOR EACH ROW` on `public.bookings`,
 *      and is dropped + recreated to guarantee idempotency.
 *   5. The one-shot backfill is bounded to `user_id IS NULL` + non-empty
 *      `customer_email` + a non-null RPC result — re-runs are no-ops on
 *      already-linked rows.
 *   6. The migration does not change billing, payout, dispatch, or RLS.
 *   7. Runtime call sites (`findAuthUserIdByEmail`, `with-payment` route,
 *      `resolveBookingUserId`) still call the RPC by the documented name
 *      and parameter shape.
 *
 * Out of scope: live behaviour of the trigger / RPC is verified at deploy
 * time via `pg_proc` + `pg_trigger`. These tests are filesystem-only and
 * never connect to a database.
 */
describe("M-23: 20260935 resolve_auth_user_id_by_email_and_link — RPC invariants", () => {
  it("migration file exists and is non-empty", () => {
    expect(migrationSql.length).toBeGreaterThan(0);
  });

  it("creates `resolve_auth_user_id_by_email(p_email text)` returning uuid via CREATE OR REPLACE", () => {
    expect(migrationCode).toMatch(
      /create\s+or\s+replace\s+function\s+public\.resolve_auth_user_id_by_email\s*\(\s*p_email\s+text\s*\)\s*returns\s+uuid/i,
    );
  });

  it("RPC is LANGUAGE sql, SECURITY DEFINER, STABLE, with `search_path = public`", () => {
    const fnRe = /create\s+or\s+replace\s+function\s+public\.resolve_auth_user_id_by_email[\s\S]*?\$\$\s*;/i;
    const m = migrationCode.match(fnRe);
    expect(m, "RPC body must end with $$;").not.toBeNull();
    if (m) {
      const body = m[0].toLowerCase();
      expect(body).toMatch(/language\s+sql/);
      expect(body).toMatch(/security\s+definer/);
      expect(body).toMatch(/stable/);
      expect(body).toMatch(/set\s+search_path\s*=\s*public/);
    }
  });

  it("RPC body looks up auth.users by lowered + trimmed email and returns at most one id", () => {
    const fnRe = /create\s+or\s+replace\s+function\s+public\.resolve_auth_user_id_by_email[\s\S]*?\$\$\s*;/i;
    const m = migrationCode.match(fnRe);
    expect(m).not.toBeNull();
    if (m) {
      const body = m[0].toLowerCase();
      expect(body).toMatch(/from\s+auth\.users\s+u/);
      expect(body).toMatch(/lower\s*\(\s*trim\s*\(\s*u\.email::text\s*\)\s*\)/);
      expect(body).toMatch(/lower\s*\(\s*trim\s*\(\s*coalesce\s*\(\s*p_email\s*,\s*''\s*\)\s*\)\s*\)/);
      expect(body).toMatch(/limit\s+1/);
    }
  });

  it("revokes RPC from public and grants execute only to service_role", () => {
    expect(migrationCode).toMatch(
      /revoke\s+all\s+on\s+function\s+public\.resolve_auth_user_id_by_email\s*\(\s*text\s*\)\s+from\s+public\s*;/i,
    );
    expect(migrationCode).toMatch(
      /grant\s+execute\s+on\s+function\s+public\.resolve_auth_user_id_by_email\s*\(\s*text\s*\)\s+to\s+service_role\s*;/i,
    );
  });

  it("the granted execution audience is exactly `service_role` (no anon/authenticated/public widening)", () => {
    const grants = Array.from(
      migrationCodeLower.matchAll(
        /grant\s+execute\s+on\s+function\s+public\.resolve_auth_user_id_by_email[^;]*?to\s+([a-z_,\s]+);/g,
      ),
    ).map((m) => m[1].trim());
    expect(grants.length).toBeGreaterThan(0);
    for (const audience of grants) {
      const tokens = audience.split(/\s*,\s*/).map((t) => t.trim()).filter(Boolean);
      for (const t of tokens) {
        expect(t).toBe("service_role");
      }
    }
  });
});

describe("M-23: 20260935 resolve_auth_user_id_by_email_and_link — trigger invariants", () => {
  it("creates `link_booking_to_user()` returning trigger via CREATE OR REPLACE, plpgsql, SECURITY DEFINER", () => {
    expect(migrationCode).toMatch(
      /create\s+or\s+replace\s+function\s+public\.link_booking_to_user\s*\(\s*\)\s*returns\s+trigger\s+language\s+plpgsql\s+security\s+definer\s+set\s+search_path\s*=\s*public/i,
    );
  });

  it("trigger function ONLY assigns user_id when new.user_id is null AND customer_email is present (never overwrites explicit user_id)", () => {
    const fnRe = /create\s+or\s+replace\s+function\s+public\.link_booking_to_user[\s\S]*?\$\$\s*;/i;
    const m = migrationCode.match(fnRe);
    expect(m, "link_booking_to_user body must end with $$;").not.toBeNull();
    if (m) {
      const body = m[0].toLowerCase();
      expect(body).toMatch(/if\s+new\.user_id\s+is\s+null/);
      expect(body).toMatch(/and\s+new\.customer_email\s+is\s+not\s+null/);
      expect(body).toMatch(/length\s*\(\s*trim\s*\(\s*new\.customer_email\s*\)\s*\)\s*>\s*0/);
      expect(body).toMatch(/new\.user_id\s*:=\s*public\.resolve_auth_user_id_by_email\s*\(\s*new\.customer_email\s*\)/);
    }
  });

  it("DROPs the existing trigger before re-creating it (idempotent re-apply)", () => {
    const dropIdx = migrationCodeLower.indexOf("drop trigger if exists auto_link_booking_user on public.bookings");
    const createIdx = migrationCodeLower.indexOf("create trigger auto_link_booking_user");
    expect(dropIdx).toBeGreaterThan(-1);
    expect(createIdx).toBeGreaterThan(dropIdx);
  });

  it("creates the trigger as BEFORE INSERT, FOR EACH ROW, on public.bookings", () => {
    expect(migrationCode).toMatch(
      /create\s+trigger\s+auto_link_booking_user\s+before\s+insert\s+on\s+public\.bookings\s+for\s+each\s+row\s+execute\s+function\s+public\.link_booking_to_user\s*\(\s*\)\s*;/i,
    );
  });
});

describe("M-23: 20260935 resolve_auth_user_id_by_email_and_link — backfill invariants", () => {
  it("backfill is bounded to orphans (user_id IS NULL) with a present customer_email and a resolvable email", () => {
    expect(migrationCode).toMatch(
      /update\s+public\.bookings\s+b\s+set\s+user_id\s*=\s*public\.resolve_auth_user_id_by_email\s*\(\s*b\.customer_email\s*\)/i,
    );
    expect(migrationCode).toMatch(
      /where\s+b\.user_id\s+is\s+null[\s\S]*?b\.customer_email\s+is\s+not\s+null[\s\S]*?length\s*\(\s*trim\s*\(\s*b\.customer_email\s*\)\s*\)\s*>\s*0[\s\S]*?public\.resolve_auth_user_id_by_email\s*\(\s*b\.customer_email\s*\)\s+is\s+not\s+null/i,
    );
  });

  it("backfill is the ONLY data-mutating statement and only touches public.bookings", () => {
    const dataMutations = Array.from(
      migrationCodeLower.matchAll(/\b(?:insert\s+into|update|delete\s+from)\s+(public\.[a-z_][a-z0-9_]*)/g),
    ).map((m) => m[1]);
    expect(dataMutations.length).toBe(1);
    expect(dataMutations[0]).toBe("public.bookings");
  });
});

describe("M-23: 20260935 resolve_auth_user_id_by_email_and_link — isolation", () => {
  it("touches no payout, dispatch, or earnings tables", () => {
    expect(migrationCodeLower).not.toMatch(/\bpublic\.cleaner_payouts\b/);
    expect(migrationCodeLower).not.toMatch(/\bpublic\.cleaner_earnings\b/);
    expect(migrationCodeLower).not.toMatch(/\bpublic\.dispatch_offers\b/);
  });

  it("introduces no RLS policy / enable changes (trigger + RPC use SECURITY DEFINER for least surprise)", () => {
    expect(migrationCodeLower).not.toMatch(/\bcreate\s+policy\b/);
    expect(migrationCodeLower).not.toMatch(/\bdrop\s+policy\b/);
    expect(migrationCodeLower).not.toMatch(/\benable\s+row\s+level\s+security\b/);
  });

  it("only DROPs the documented trigger (no other DROP statements)", () => {
    const drops = Array.from(migrationCodeLower.matchAll(/\bdrop\s+(?:table|column|function|trigger|policy|index)[^;]*?;/g));
    for (const m of drops) {
      expect(m[0]).toMatch(/drop\s+trigger\s+if\s+exists\s+auto_link_booking_user\s+on\s+public\.bookings/);
    }
  });
});

describe("M-23: 20260935 runtime call sites still call the RPC by the documented name + arg shape", () => {
  it("findAuthUserIdByEmail (lib/cleaner/linkCleanerAuth.ts) calls `resolve_auth_user_id_by_email` with `{ p_email }`", () => {
    const src = readFileSync(path.join(webRoot, "lib/cleaner/linkCleanerAuth.ts"), "utf8");
    expect(src).toMatch(
      /\.rpc\(\s*["']resolve_auth_user_id_by_email["']\s*,\s*\{\s*p_email:\s*needle\s*\}/,
    );
  });

  it("admin /api/admin/bookings/with-payment route calls `resolve_auth_user_id_by_email`", () => {
    const src = readFileSync(
      path.join(webRoot, "app/api/admin/bookings/with-payment/route.ts"),
      "utf8",
    );
    expect(src).toMatch(/\.rpc\(\s*["']resolve_auth_user_id_by_email["']/);
  });

  it("resolveBookingUserId (lib/booking/resolveBookingUserId.ts) calls `resolve_auth_user_id_by_email` and surfaces a clear remediation hint on RPC failure", () => {
    const src = readFileSync(path.join(webRoot, "lib/booking/resolveBookingUserId.ts"), "utf8");
    expect(src).toMatch(/\.rpc\(\s*["']resolve_auth_user_id_by_email["']/);
    expect(src).toMatch(/resolve_auth_user_id_by_email\s+RPC/);
  });

  it("insertPendingPaymentBooking uses schema-aware ownership (customer_id or user_id) and never hardcodes both", () => {
    const src = readFileSync(path.join(webRoot, "lib/booking/insertPendingPaymentBooking.ts"), "utf8");
    expect(src).toMatch(/resolveBookingOwnershipColumn/);
    expect(src).toMatch(/bookingCustomerOwnershipPatch/);
    expect(src).not.toMatch(/customer_id:\s*authUid,\s*user_id:\s*authUid/);
  });
});
