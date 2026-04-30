import { NextResponse } from "next/server";
import { findAuthUserIdByEmail } from "@/lib/cleaner/linkCleanerAuth";
import { customerGeneratedLoginEmailFromAnyPhone } from "@/lib/customer/customerIdentity";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import { normalizeSouthAfricaPhone } from "@/lib/utils/phone";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { listAuthUsersMatchingNeedle } from "@/lib/admin/searchAuthUsersForAdminCustomerLookup";

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
  const { data: authData } = await admin.auth.admin.getUserById(userId);
  const email =
    pref?.email ??
    (authData?.user?.email ? normalizeEmail(String(authData.user.email)) : null);
  const meta = authData?.user?.user_metadata as Record<string, unknown> | undefined;
  const nameFromMeta =
    typeof meta?.full_name === "string"
      ? meta.full_name.trim()
      : typeof meta?.name === "string"
        ? String(meta.name).trim()
        : null;
  const p = prof as Record<string, unknown> | null;
  const fullNameProfile = typeof p?.full_name === "string" ? String(p.full_name).trim() : "";
  const full_name =
    fullNameProfile ||
    pref?.metaFullName ||
    nameFromMeta ||
    null;
  seen.add(userId);
  out.push({
    id: userId,
    email,
    full_name,
    billing_type: String(p?.billing_type ?? "per_booking"),
    schedule_type: String(p?.schedule_type ?? "on_demand"),
  });
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
      if (!uid) {
        return NextResponse.json({ customers: [] });
      }
      await pushRowFromProfileAndAuth(admin, out, seen, uid, { email: em });
      return NextResponse.json({ customers: out });
    }
    // Partial / invalid email fragment — search auth users by substring.
    const authHits = await listAuthUsersMatchingNeedle(admin, q, { maxPages: 12, maxResults: 20 });
    for (const [, hit] of authHits) {
      await pushRowFromProfileAndAuth(admin, out, seen, hit.id, {
        email: hit.email,
        metaFullName: hit.metaDisplayName,
      });
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

  for (const raw of profiles ?? []) {
    const p = raw as Record<string, unknown>;
    const id = typeof p.id === "string" ? p.id : "";
    if (!id) continue;
    await pushRowFromProfileAndAuth(admin, out, seen, id);
    if (out.length >= 20) {
      return NextResponse.json({ customers: out });
    }
  }

  const authHits = await listAuthUsersMatchingNeedle(admin, q, { maxPages: 12, maxResults: 25 });
  for (const [, hit] of authHits) {
    await pushRowFromProfileAndAuth(admin, out, seen, hit.id, {
      email: hit.email,
      metaFullName: hit.metaDisplayName,
    });
    if (out.length >= 20) break;
  }

  return NextResponse.json({ customers: out });
}
