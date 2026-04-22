import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { digitsOnly, normalizeSouthAfricaPhone, southAfricaPhoneLookupVariants } from "@/lib/utils/phone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      error: "Method not allowed. Use POST with { phone, password }.",
      hint: "Open /cleaner/login for the UI form.",
    },
    { status: 405 },
  );
}

type CleanerLoginRow = {
  id: string;
  full_name: string | null;
  phone_number: string | null;
  phone: string | null;
  email: string | null;
  auth_user_id: string | null;
  status: string | null;
};

async function resolveLoginEmail(admin: SupabaseClient, row: CleanerLoginRow): Promise<string | null> {
  const fromRow = String(row.email ?? "").trim().toLowerCase();
  if (fromRow) return fromRow;
  const aid = String(row.auth_user_id ?? "").trim();
  if (!aid) return null;
  const { data, error } = await admin.auth.admin.getUserById(aid);
  if (error || !data.user?.email) return null;
  return String(data.user.email).trim().toLowerCase();
}

export async function POST(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  let body: { phone?: string; password?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const phone = String(body.phone ?? "").trim();
  const password = String(body.password ?? "");
  if (!phone || !password) {
    return NextResponse.json({ error: "Phone and password are required." }, { status: 400 });
  }

  const variants = [...new Set(southAfricaPhoneLookupVariants(phone))].filter(Boolean);
  let cleaner: CleanerLoginRow | null = null;
  let queryError: string | null = null;

  if (variants.length > 0) {
    const { data, error } = await admin
      .from("cleaners")
      .select("id, full_name, phone_number, phone, email, auth_user_id, status")
      .in("phone", variants)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) queryError = error.message;
    else if (data?.length) cleaner = data[0] as CleanerLoginRow;
  }

  if (!cleaner && variants.length > 0) {
    const { data, error } = await admin
      .from("cleaners")
      .select("id, full_name, phone_number, phone, email, auth_user_id, status")
      .in("phone_number", variants)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) {
      if (!queryError) queryError = error.message;
    } else if (data?.length) {
      cleaner = data[0] as CleanerLoginRow;
    }
  }

  const canonical = normalizeSouthAfricaPhone(phone);
  if (!cleaner && canonical) {
    const nine = canonical.slice(-9);
    const { data: fuzzyRows, error: fuzzyErr } = await admin
      .from("cleaners")
      .select("id, full_name, phone_number, phone, email, auth_user_id, status")
      .or(`phone.ilike.%${nine}%,phone_number.ilike.%${nine}%`)
      .limit(40);
    if (fuzzyErr) {
      if (!queryError) queryError = fuzzyErr.message;
    } else if (fuzzyRows?.length) {
      cleaner =
        (fuzzyRows.find((row) => {
          const r = row as CleanerLoginRow;
          const p1 = r.phone ? normalizeSouthAfricaPhone(r.phone) : null;
          const p2 = r.phone_number ? normalizeSouthAfricaPhone(r.phone_number) : null;
          return p1 === canonical || p2 === canonical;
        }) as CleanerLoginRow) ?? null;
    }
  }

  if (queryError && !cleaner) {
    const debug =
      process.env.NODE_ENV !== "production"
        ? { reason: "query_error", details: queryError, variants }
        : undefined;
    return NextResponse.json({ error: "Invalid credentials", debug }, { status: 401 });
  }
  if (!cleaner) {
    const debug =
      process.env.NODE_ENV !== "production"
        ? { reason: "cleaner_not_found", variants, canonical, digits: digitsOnly(phone) }
        : undefined;
    return NextResponse.json({ error: "Invalid credentials", debug }, { status: 401 });
  }

  const authUid = String(cleaner.auth_user_id ?? "").trim();
  if (!authUid) {
    const debug =
      process.env.NODE_ENV !== "production" ? { reason: "missing_auth_user_id", cleanerId: cleaner.id } : undefined;
    return NextResponse.json(
      {
        error: "This account is not ready for login. Ask an admin to link Supabase Auth (backfill).",
        debug,
      },
      { status: 401 },
    );
  }

  const email = await resolveLoginEmail(admin, cleaner);
  if (!email) {
    const debug =
      process.env.NODE_ENV !== "production"
        ? { reason: "missing_login_email", cleanerId: cleaner.id }
        : undefined;
    return NextResponse.json(
      { error: "This account is not ready for login. Ask an admin to link Auth and add an email.", debug },
      { status: 401 },
    );
  }

  const pub = createClient(url, anon, { auth: { persistSession: false } });
  const { data: signData, error: signErr } = await pub.auth.signInWithPassword({ email, password });
  if (signErr || !signData.session?.user) {
    const debug =
      process.env.NODE_ENV !== "production"
        ? { reason: "auth_sign_in_failed", cleanerId: cleaner.id, details: signErr?.message }
        : undefined;
    return NextResponse.json({ error: "Invalid credentials", debug }, { status: 401 });
  }

  const uid = signData.session.user.id;
  if (uid !== authUid) {
    await pub.auth.signOut().catch(() => {});
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    cleanerId: cleaner.id,
    session: {
      access_token: signData.session.access_token,
      refresh_token: signData.session.refresh_token,
      expires_in: signData.session.expires_in,
      expires_at: signData.session.expires_at,
      token_type: signData.session.token_type,
    },
    cleaner: {
      id: cleaner.id,
      full_name: cleaner.full_name,
      phone_number: cleaner.phone_number,
      status: cleaner.status,
    },
  });
}
