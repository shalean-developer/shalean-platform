import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Auth-user-without-profile mismatch fix: existing `auth.users` rows that have
 * no `user_profiles` row used to be invisible to admin booking customer search
 * (search returned "No matches.") and rejected by admin booking POST
 * ("Select an existing customer."). Both flows now upsert a default
 * `per_booking` / `on_demand` profile via `ensureUserProfileForAuthUser`, and
 * customer search falls back to the auth.admin.listUsers substring scan when
 * the email RPC lookup misses for any reason.
 */
describe("admin auth-user lookup: orphan profile repair wiring", () => {
  const root = process.cwd();

  it("admin booking POST repairs missing user_profiles instead of returning 'Select an existing customer.'", () => {
    const src = readFileSync(join(root, "app/api/admin/bookings/route.ts"), "utf8");
    expect(src).toMatch(/import \{ ensureUserProfileForAuthUser \} from "@\/lib\/admin\/ensureUserProfileForAuthUser"/);
    expect(src).toMatch(/await ensureUserProfileForAuthUser\(admin, userId\)/);
    // Old short-circuit must be gone — orphan auth users are no longer rejected here.
    const beforeCustomerEmail = src.split('const customerEmail =')[0] ?? "";
    expect(beforeCustomerEmail).not.toMatch(/if \(!prof\)\s*\{\s*return\s+bail\(NextResponse\.json\(\{\s*error:\s*"Select an existing customer\."/);
  });

  it("admin customer POST ensures a profile when reusing an existing auth user (phone match, email match, race)", () => {
    const src = readFileSync(join(root, "app/api/admin/customers/route.ts"), "utf8");
    expect(src).toMatch(/import \{ ensureUserProfileForAuthUser \} from "@\/lib\/admin\/ensureUserProfileForAuthUser"/);
    expect(src).toMatch(/await ensureUserProfileForAuthUser\(admin, uidByPhone\)/);
    expect(src).toMatch(/await ensureUserProfileForAuthUser\(admin, uidByEmail\)/);
    // Race branch (createUser → "already" → re-find).
    expect(src).toMatch(/await ensureUserProfileForAuthUser\(admin, uid\)/);
  });

  it("admin booking customer search falls back to listUsers substring scan when email RPC misses", () => {
    const src = readFileSync(join(root, "app/api/admin/bookings/customers/route.ts"), "utf8");
    // Prior version: short-circuited with `return NextResponse.json({ customers: [] })`
    // when `uid` was null for a full email. New version: continues to substring
    // scan via `listAuthUsersMatchingNeedle` so existing-but-unindexed auth users
    // still appear in the dropdown.
    expect(src).not.toMatch(
      /if \(!uid\)\s*\{\s*return NextResponse\.json\(\{ customers: \[\] \}\);\s*\}/,
    );
    expect(src).toMatch(/listAuthUsersMatchingNeedle\(admin, q, \{ maxPages: 12, maxResults: 20 \}\)/);
    expect(src).toMatch(/Defence in depth: if the RPC \+ bookings \+ listUsers pagination chain/);
  });
});
