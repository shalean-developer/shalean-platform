import { NextResponse } from "next/server";
import { findAuthUserIdByEmail } from "@/lib/cleaner/linkCleanerAuth";
import { customerGeneratedLoginEmailFromAnyPhone } from "@/lib/customer/customerIdentity";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import { normalizeSouthAfricaPhone } from "@/lib/utils/phone";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  listAuthUsersMatchingNeedle,
  scanAuthUsersForAdminCustomerSearch,
} from "@/lib/admin/searchAuthUsersForAdminCustomerLookup";
import {
  loadUserProfilesForAdminCustomerSearch,
  type AdminCustomerSearchProfileRow,
} from "@/lib/admin/loadUserProfilesForAdminCustomerSearch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type AdminCustomerSearchRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  billing_type: string;
  schedule_type: string;
};

const FULL_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Build a customer search row from already-fetched profile + auth data.
 *
 * Response-shape contract (preserved exactly from the legacy
 * `pushRowFromProfileAndAuth` helper):
 *   - `email` = preferred override (caller-supplied) ?? auth email ?? null
 *   - `full_name` = profile.full_name ||
 *                   caller-supplied metaFullName ||
 *                   auth user_metadata fallback (full_name / name) || null
 *   - `billing_type` = profile.billing_type ?? "per_booking"
 *   - `schedule_type` = profile.schedule_type ?? "on_demand"
 *
 * This helper performs no I/O — all data comes from the batched maps. Pass
 * `pref` to override email / metaFullName (used when the caller already has
 * those values from a prior auth scan and wants to skip recomputation).
 */
function buildCustomerSearchRow(
  userId: string,
  profile: AdminCustomerSearchProfileRow | null,
  authMetaFromBatch: { email: string | null; metaDisplayName: string | null } | null,
  pref?: { email?: string | null; metaFullName?: string | null },
): AdminCustomerSearchRow {
  const email =
    pref?.email ??
    (authMetaFromBatch?.email ? normalizeEmail(String(authMetaFromBatch.email)) : null);
  const fullNameProfile =
    typeof profile?.full_name === "string" ? profile.full_name.trim() : "";
  const full_name =
    fullNameProfile ||
    (pref?.metaFullName && pref.metaFullName.trim()) ||
    authMetaFromBatch?.metaDisplayName ||
    null;
  return {
    id: userId,
    email,
    full_name,
    billing_type: String(profile?.billing_type ?? "per_booking"),
    schedule_type: String(profile?.schedule_type ?? "on_demand"),
  };
}

async function pushRowFromProfileAndAuth(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  out: AdminCustomerSearchRow[],
  seen: Set<string>,
  userId: string,
  pref?: { email?: string | null; metaFullName?: string | null },
): Promise<void> {
  if (!userId || seen.has(userId)) return;
  const { data: prof } = await admin
    .from("user_profiles")
    .select("id, full_name, billing_type, schedule_type")
    .eq("id", userId)
    .maybeSingle();
  const profile = prof as AdminCustomerSearchProfileRow | null;

  // Single-user fast path: only fetch auth data if the caller hasn't
  // already supplied the email + display name from a prior scan. This
  // preserves the legacy behaviour for the phone / id / full-email paths
  // (each looks up exactly one user, not N) without re-fetching when the
  // caller already has the data.
  let authMeta: { email: string | null; metaDisplayName: string | null } | null = null;
  if (pref?.email == null || pref?.metaFullName == null) {
    const { data: authData } = await admin.auth.admin.getUserById(userId);
    if (authData?.user) {
      const meta = authData.user.user_metadata as Record<string, unknown> | undefined;
      const metaName =
        typeof meta?.full_name === "string" && meta.full_name.trim()
          ? meta.full_name.trim()
          : typeof meta?.name === "string" && String(meta.name).trim()
            ? String(meta.name).trim()
            : null;
      authMeta = {
        email: authData.user.email ? normalizeEmail(String(authData.user.email)) : null,
        metaDisplayName: metaName,
      };
    }
  }

  seen.add(userId);
  out.push(buildCustomerSearchRow(userId, profile, authMeta, pref));
}

/**
 * Admin: search customers for booking create (profiles + auth email).
 * `q` — partial name (profile or auth metadata), partial email, or full email (exact when valid).
 */
export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const idParam = (searchParams.get("id") ?? "").trim();
  const q = (searchParams.get("q") ?? "").trim();
  const phoneParam = (searchParams.get("phone") ?? "").trim();

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const out: AdminCustomerSearchRow[] = [];
  const seen = new Set<string>();

  if (phoneParam.length >= 5) {
    const norm = normalizeSouthAfricaPhone(phoneParam);
    if (norm) {
      const gen = customerGeneratedLoginEmailFromAnyPhone(norm);
      if (gen) {
        const uid = await findAuthUserIdByEmail(admin, gen);
        if (uid) {
          await pushRowFromProfileAndAuth(admin, out, seen, uid, { email: gen });
          return NextResponse.json({ customers: out });
        }
      }
    }
    return NextResponse.json({ customers: [] });
  }

  if (/^[0-9a-f-]{36}$/i.test(idParam)) {
    const { data: authData, error: authErr } = await admin.auth.admin.getUserById(idParam);
    if (authErr || !authData?.user?.id) {
      return NextResponse.json({ customers: [] });
    }
    const email = authData.user.email ? normalizeEmail(String(authData.user.email)) : null;
    const meta = authData.user.user_metadata as Record<string, unknown> | undefined;
    const nameFromMeta =
      typeof meta?.full_name === "string"
        ? meta.full_name.trim()
        : typeof meta?.name === "string"
          ? String(meta.name).trim()
          : null;
    const { data: prof, error } = await admin
      .from("user_profiles")
      .select("id, full_name, billing_type, schedule_type")
      .eq("id", idParam)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const p = prof as Record<string, unknown> | null;
    out.push({
      id: idParam,
      email,
      full_name: typeof p?.full_name === "string" ? String(p.full_name) : nameFromMeta,
      billing_type: String(p?.billing_type ?? "per_booking"),
      schedule_type: String(p?.schedule_type ?? "on_demand"),
    });
    return NextResponse.json({ customers: out });
  }

  const qDigits = q.replace(/\D/g, "");
  if (!phoneParam && q.length >= 5 && qDigits.length >= 9 && !q.includes("@")) {
    const norm = normalizeSouthAfricaPhone(q);
    if (norm) {
      const gen = customerGeneratedLoginEmailFromAnyPhone(norm);
      if (gen) {
        const uid = await findAuthUserIdByEmail(admin, gen);
        if (uid) {
          await pushRowFromProfileAndAuth(admin, out, seen, uid, { email: gen });
          return NextResponse.json({ customers: out });
        }
      }
    }
  }

  if (q.length < 2) {
    return NextResponse.json({ error: "Query must be at least 2 characters." }, { status: 400 });
  }

  if (q.includes("@")) {
    const em = normalizeEmail(q);
    if (FULL_EMAIL.test(em)) {
      const uid = await findAuthUserIdByEmail(admin, em);
      if (uid) {
        await pushRowFromProfileAndAuth(admin, out, seen, uid, { email: em });
        return NextResponse.json({ customers: out });
      }
      // Defence in depth: if the RPC + bookings + listUsers pagination chain
      // fails to resolve a known-good email (e.g. RPC briefly unavailable),
      // fall through to the substring scan over auth.admin.listUsers so the
      // admin sees the existing auth user instead of "No matches" — which
      // would otherwise push them to create a duplicate account.
    }
    // H-13 batched path: one paginated listUsers scan + one batched
    // user_profiles `.in("id", ids)` lookup for the matched auth users.
    const authHits = await listAuthUsersMatchingNeedle(admin, q, { maxPages: 12, maxResults: 20 });
    const hitIds: string[] = [];
    for (const [, hit] of authHits) hitIds.push(hit.id);
    const profilesByIdEmail = await loadUserProfilesForAdminCustomerSearch(admin, hitIds);
    for (const [, hit] of authHits) {
      if (seen.has(hit.id)) continue;
      seen.add(hit.id);
      out.push(
        buildCustomerSearchRow(
          hit.id,
          profilesByIdEmail.get(hit.id) ?? null,
          { email: hit.email, metaDisplayName: hit.metaDisplayName },
          { email: hit.email, metaFullName: hit.metaDisplayName },
        ),
      );
      if (out.length >= 20) break;
    }
    return NextResponse.json({ customers: out });
  }

  const pattern = `%${q.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
  const { data: profiles, error } = await admin
    .from("user_profiles")
    .select("id, full_name, billing_type, schedule_type")
    .ilike("full_name", pattern)
    .limit(15);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // H-13 batched path: build a single id-set from the profile-ilike result
  // and run one combined `auth.admin.listUsers` pagination that captures both
  // those ids AND the needle matches. A single profile `.in("id", ids)`
  // query then enriches any auth-only hits (which won't already have a row
  // in the ilike result). This replaces the legacy O(N) per-row
  // `getUserById` + per-row `user_profiles.eq("id", id)` calls.
  const ilikeRows: AdminCustomerSearchProfileRow[] = [];
  const ilikeProfileById = new Map<string, AdminCustomerSearchProfileRow>();
  const ilikeIds = new Set<string>();
  const ilikeOrder: string[] = [];
  for (const raw of profiles ?? []) {
    const p = raw as Record<string, unknown>;
    const id = typeof p.id === "string" ? p.id : "";
    if (!id || ilikeIds.has(id)) continue;
    const row: AdminCustomerSearchProfileRow = {
      id,
      full_name: typeof p.full_name === "string" ? p.full_name : null,
      billing_type: typeof p.billing_type === "string" ? p.billing_type : null,
      schedule_type: typeof p.schedule_type === "string" ? p.schedule_type : null,
    };
    ilikeRows.push(row);
    ilikeProfileById.set(id, row);
    ilikeIds.add(id);
    ilikeOrder.push(id);
  }

  const { needleMatches, capturedById } = await scanAuthUsersForAdminCustomerSearch(admin, {
    needle: q,
    captureIds: ilikeIds,
    maxPages: 12,
    maxNeedleResults: 25,
  });

  // Profiles for needle-only hits (the auth listUsers scan returns email +
  // meta but never a `user_profiles` row).
  const needleOnlyIds: string[] = [];
  for (const id of needleMatches.keys()) {
    if (!ilikeIds.has(id)) needleOnlyIds.push(id);
  }
  const needleOnlyProfiles = await loadUserProfilesForAdminCustomerSearch(admin, needleOnlyIds);

  // Emit profile-ilike matches first (preserves prior ordering).
  for (const id of ilikeOrder) {
    if (seen.has(id)) continue;
    seen.add(id);
    const captured = capturedById.get(id) ?? null;
    out.push(
      buildCustomerSearchRow(id, ilikeProfileById.get(id) ?? null, captured),
    );
    if (out.length >= 20) {
      return NextResponse.json({ customers: out });
    }
  }

  // Then auth-needle matches, skipping ones already emitted.
  for (const [, hit] of needleMatches) {
    if (seen.has(hit.id)) continue;
    seen.add(hit.id);
    const profile =
      ilikeProfileById.get(hit.id) ?? needleOnlyProfiles.get(hit.id) ?? null;
    out.push(
      buildCustomerSearchRow(
        hit.id,
        profile,
        { email: hit.email, metaDisplayName: hit.metaDisplayName },
        { email: hit.email, metaFullName: hit.metaDisplayName },
      ),
    );
    if (out.length >= 20) break;
  }

  return NextResponse.json({ customers: out });
}
