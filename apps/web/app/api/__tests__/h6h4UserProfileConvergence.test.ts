import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  listActiveMigrationFilenames,
  readRepositoryMigration,
  resolveRepositoryMigration,
} from "@/lib/audit/resolveRepositoryMigration";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// __dirname == apps/web/app/api/__tests__
const webRoot = path.resolve(__dirname, "../../..");
const repoRoot = path.resolve(webRoot, "../..");

const r = (rel: string) => readFileSync(path.join(webRoot, rel), "utf8");

const stripSql = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");

/**
 * Production Readiness Audit H-6 (auth-without-profile) and H-4 (recurring
 * cron silently downgraded missing profiles to `per_booking`).
 *
 * Pre-fix shape (live live-DB evidence captured at deploy time):
 *   * 101 rows in `auth.users`
 *   * 59 rows had NO matching `public.user_profiles` row (35 customer + 24
 *     cleaner auth users)
 *   * Recurring cron read the missing row as `billing_type='per_booking'`
 *     silently — monthly customers would have been auto-charged via Paystack
 *     instead of routed to the monthly invoice rail.
 *
 * Post-fix surface area (this file's contracts):
 *   1. `apps/web/app/api/auth/create-from-guest/route.ts` —
 *      ensures a profile after createUser (or already-exists path)
 *   2. `apps/web/app/api/bookings/link-user/route.ts` —
 *      ensures a profile before attributing guest bookings
 *   3. `apps/web/app/api/auth/link-guest-bookings/route.ts` —
 *      ensures a profile before attributing guest bookings (sister flow)
 *   4. `apps/web/app/api/cron/generate-recurring-bookings/route.ts` —
 *      missing profile NEVER silently routes to `per_booking`; it surfaces
 *      a loud `recurring_skip_missing_profile` warning, advances the cursor,
 *      and skips the plan for this run.
 *   5. `supabase/migrations/20260939_h6_h4_user_profiles_backfill.sql` —
 *      idempotent one-shot insert for orphan auth users; never overwrites
 *      existing rows (`ON CONFLICT (id) DO NOTHING`).
 */

describe("H-6 / H-4 — create-from-guest wires ensureUserProfileForAuthUser", () => {
  const src = r("app/api/auth/create-from-guest/route.ts");

  it("imports the helper", () => {
    expect(src).toMatch(
      /import\s+\{\s*ensureUserProfileForAuthUser\s*\}\s+from\s+"@\/lib\/admin\/ensureUserProfileForAuthUser"/,
    );
  });

  it("captures the new auth user id from createUser", () => {
    expect(src).toMatch(/const\s*\{\s*data:\s*createData,\s*error:\s*createError\s*\}\s*=\s*await\s+admin\.auth\.admin\.createUser\(/);
  });

  it("falls back to listUsers when createUser indicates 'already exists' so the helper can still target the right id", () => {
    expect(src).toMatch(/admin\.auth\.admin\.listUsers/);
    expect(src).toMatch(/normalizeEmail\(rowEmail\)/);
  });

  it("calls ensureUserProfileForAuthUser with the resolved id", () => {
    expect(src).toMatch(
      /await\s+ensureUserProfileForAuthUser\(\s*admin\s*,\s*resolvedAuthUserId\s*\)/,
    );
  });

  it("logs but does NOT 5xx on profile-repair failure (magic link still goes out)", () => {
    expect(src).toMatch(/source:\s*"create-from-guest"/);
    expect(src).toMatch(/message:\s*"user_profile_repair_failed"/);
    // After the ensure call, the next step must still be the OTP email.
    const ensureIdx = src.indexOf("ensureUserProfileForAuthUser");
    const otpIdx = src.indexOf("signInWithOtp");
    expect(ensureIdx).toBeGreaterThan(0);
    expect(otpIdx).toBeGreaterThan(ensureIdx);
  });
});

describe("H-6 / H-4 — bookings/link-user wires ensureUserProfileForAuthUser", () => {
  const src = r("app/api/bookings/link-user/route.ts");

  it("imports the helper", () => {
    expect(src).toMatch(
      /import\s+\{\s*ensureUserProfileForAuthUser\s*\}\s+from\s+"@\/lib\/admin\/ensureUserProfileForAuthUser"/,
    );
  });

  it("calls the helper before linkUnlinkedBookingsByEmail (so even a transient repair failure does not abandon the booking link)", () => {
    const ensureIdx = src.indexOf("ensureUserProfileForAuthUser(admin, userData.user.id)");
    const linkIdx = src.indexOf("linkUnlinkedBookingsByEmail(");
    expect(ensureIdx).toBeGreaterThan(0);
    expect(linkIdx).toBeGreaterThan(ensureIdx);
  });

  it("logs profile-repair errors via system_logs as warn, not fatal", () => {
    expect(src).toMatch(/source:\s*"bookings\/link-user"/);
    expect(src).toMatch(/message:\s*"user_profile_repair_failed"/);
    expect(src).toMatch(/level:\s*"warn"/);
  });
});

describe("H-6 / H-4 — auth/link-guest-bookings wires ensureUserProfileForAuthUser", () => {
  const src = r("app/api/auth/link-guest-bookings/route.ts");

  it("imports the helper", () => {
    expect(src).toMatch(
      /import\s+\{\s*ensureUserProfileForAuthUser\s*\}\s+from\s+"@\/lib\/admin\/ensureUserProfileForAuthUser"/,
    );
  });

  it("calls the helper before linkUnlinkedBookingsByEmail", () => {
    const ensureIdx = src.indexOf("ensureUserProfileForAuthUser(admin, userId)");
    const linkIdx = src.indexOf("linkUnlinkedBookingsByEmail(");
    expect(ensureIdx).toBeGreaterThan(0);
    expect(linkIdx).toBeGreaterThan(ensureIdx);
  });
});

describe("H-6 / H-4 — recurring cron no longer silently downgrades missing profiles to per_booking", () => {
  const src = r("app/api/cron/generate-recurring-bookings/route.ts");

  it("captures the SELECT error from user_profiles (no longer ignored)", () => {
    expect(src).toMatch(
      /const\s*\{\s*data:\s*profileRow,\s*error:\s*profileErr\s*\}\s*=\s*await\s+admin\s*\n?\s*\.from\("user_profiles"\)/,
    );
  });

  it("treats a missing profile row as a hard skip — emits operational warning and advances next_run_date", () => {
    expect(src).toMatch(/recurring_skip_missing_profile/);
    expect(src).toMatch(/recurring_skip_profile_select_failed/);
    expect(src).toMatch(/reportOperationalIssue\(\s*"error",\s*"cron\/generate-recurring-bookings"/);
    expect(src).toMatch(/calculateNextRunDate\(schedule, today\)/);
  });

  it("orders the missing-profile bail-out BEFORE the billingType assignment (no path can reach billingType with profileRow = null)", () => {
    const stripped = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
    // The bail-out for `if (!profileRow) { ... continue; }` must precede the
    // first `const billingType =` assignment so that a null profile can never
    // flow into the supported-billing branch.
    const bailIdx = stripped.search(/if\s*\(\s*!\s*profileRow\s*\)/);
    const billingIdx = stripped.search(/const\s+billingType\s*=/);
    expect(bailIdx, "missing-profile bail-out must exist").toBeGreaterThan(0);
    expect(billingIdx, "billingType assignment must exist").toBeGreaterThan(0);
    expect(billingIdx).toBeGreaterThan(bailIdx);
  });

  it("removes `?? 'per_booking'` from the read step (the defensive fallback for a column-level null may remain on the assignment AFTER the row-level guard)", () => {
    const stripped = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
    // The exact pre-fix shape — `(profileRow as { billing_type?: string } | null)?.billing_type ?? "per_booking"` —
    // implied profileRow could be null. After the fix the cast is non-nullable
    // (`{ billing_type?: string }` without `| null`) since profileRow is guaranteed
    // truthy at that point.
    expect(stripped).not.toMatch(/\(profileRow\s+as\s+\{[^}]*\}\s*\|\s*null\s*\)\s*\?\.\s*billing_type/);
  });

  it("logs the system_log message at error level (not warn), and includes a remediation hint", () => {
    const stripped = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
    expect(stripped).toMatch(/level:\s*"error"[\s\S]*recurring_skip_missing_profile/);
    expect(stripped).toMatch(/remediation:/);
  });

  it("preserves the existing supported-billing classification (no formula changes)", () => {
    expect(src).toMatch(/billingType === "per_booking" \|\| billingType === "monthly"/);
  });
});

describe("H-6 / H-4 — backfill migration: 20260939_h6_h4_user_profiles_backfill.sql", () => {
  const { sql } = readRepositoryMigration("20260939_h6_h4_user_profiles_backfill.sql");
  const code = stripSql(sql);
  const lower = code.toLowerCase();

  it("only inserts into public.user_profiles (no UPDATE / DELETE / DDL on that table)", () => {
    expect(lower).toMatch(/insert\s+into\s+public\.user_profiles/);
    expect(lower).not.toMatch(/update\s+public\.user_profiles/);
    expect(lower).not.toMatch(/delete\s+from\s+public\.user_profiles/);
    expect(lower).not.toMatch(/alter\s+table\s+public\.user_profiles/);
    expect(lower).not.toMatch(/drop\s+table/);
    expect(lower).not.toMatch(/create\s+table/);
  });

  it("uses ON CONFLICT (id) DO NOTHING — never overwrites existing profiles", () => {
    expect(lower).toMatch(/on\s+conflict\s*\(\s*id\s*\)\s+do\s+nothing/);
  });

  it("filters source rows to non-deleted auth users without an existing profile (idempotent re-run = no-op)", () => {
    expect(lower).toMatch(/from\s+auth\.users/);
    expect(lower).toMatch(/deleted_at\s+is\s+null/);
    expect(lower).toMatch(
      /not\s+exists\s*\(\s*select\s+1\s+from\s+public\.user_profiles\s+up\s+where\s+up\.id\s*=\s*au\.id/,
    );
  });

  it("inserts safe defaults that mirror the column defaults / helper output", () => {
    // Expect the per_booking + on_demand defaults consistent with `ensureUserProfileForAuthUser`.
    expect(lower).toMatch(/'per_booking'/);
    expect(lower).toMatch(/'on_demand'/);
    expect(lower).toMatch(/'regular'/);
    expect(lower).toMatch(/'ok'/);
    // No hard-coded names — full_name comes from auth metadata or NULL.
    expect(lower).toMatch(/raw_user_meta_data\s*->>\s*'full_name'/);
    expect(lower).toMatch(/raw_user_meta_data\s*->>\s*'name'/);
  });

  it("does NOT touch financial / payout / RLS surface area", () => {
    expect(lower).not.toMatch(/cleaner_payouts/);
    expect(lower).not.toMatch(/cleaner_earnings/);
    expect(lower).not.toMatch(/dispatch_offers/);
    expect(lower).not.toMatch(/recurring_bookings/);
    expect(lower).not.toMatch(/monthly_invoices/);
    expect(lower).not.toMatch(/\bcreate\s+policy/);
    expect(lower).not.toMatch(/\bdrop\s+policy/);
    expect(lower).not.toMatch(/\bgrant\b/);
  });
});

describe("H-6 / H-4 — repo sweep: future migrations may not reintroduce silent missing-profile fallbacks", () => {
  it("no recurring/cron/profile-fetching code uses ?? 'per_booking' on a possibly-null row outside ensureUserProfileForAuthUser", () => {
    const cronSrc = r("app/api/cron/generate-recurring-bookings/route.ts");
    const stripped = cronSrc.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
    expect(stripped).not.toMatch(/profileRow\s*\)\s*\?\.\s*billing_type\s*\?\?\s*"per_booking"/);
  });

  it("the backfill migration is the canonical orphan-repair landmark and stays at version 20260939", () => {
    const target = "20260939_h6_h4_user_profiles_backfill.sql";
    const resolved = resolveRepositoryMigration(target);
    expect(resolved.filename).toBe(target);
    expect(["active", "legacy"]).toContain(resolved.kind);
    // No other active migration should be a 'user_profiles_backfill' AFTER this one
    // (a future run-once would clobber this canonical landmark; future repairs
    // should be properly named, e.g. 'user_profiles_orphan_repair_2027_01').
    const files = listActiveMigrationFilenames({ repoRoot });
    const conflicting = files.filter(
      (f) => f > target && /user_profiles_backfill\.sql$/i.test(f),
    );
    expect(conflicting).toEqual([]);
  });
});
