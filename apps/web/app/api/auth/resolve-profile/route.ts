import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { fetchCleanerRowForSupabaseAuthUser } from "@/lib/cleaner/resolveCleanerFromRequest";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { access_token?: string };

/**
 * Validates a Supabase access token and reports whether the user is linked to a cleaner row.
 * Used by customer login/signup to route dual-role accounts without exposing service role to the client.
 */
export async function POST(request: Request) {
  const admin = getSupabaseAdmin();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!admin || !url || !anon) {
    return NextResponse.json({ ok: false, error: "Server configuration error." }, { status: 503 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const token = String(body.access_token ?? "").trim();
  if (!token) {
    return NextResponse.json({ ok: false, error: "access_token is required." }, { status: 400 });
  }

  const pub = createClient(url, anon, { auth: { persistSession: false } });
  const { data: userData, error: userErr } = await pub.auth.getUser(token);
  if (userErr || !userData.user?.id) {
    return NextResponse.json({ ok: false, error: "Invalid or expired token." }, { status: 401 });
  }

  const uid = userData.user.id;
  const row = await fetchCleanerRowForSupabaseAuthUser(admin, uid);
  const isCleaner = Boolean(row?.id);

  return NextResponse.json({
    ok: true,
    userId: uid,
    isCleaner,
    cleanerId: isCleaner ? row!.id : undefined,
  });
}
