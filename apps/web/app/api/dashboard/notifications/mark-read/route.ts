import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) {
    return NextResponse.json({ error: "Missing authorization." }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const pub = createClient(url, anon);
  const { data: userData, error: userErr } = await pub.auth.getUser(token);
  if (userErr || !userData.user?.id) {
    return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
  }

  let body: { id?: string | null; all?: boolean };
  try {
    body = (await request.json()) as { id?: string | null; all?: boolean };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const uid = userData.user.id;
  const now = new Date().toISOString();

  if (body.all) {
    const { error } = await admin.from("user_notifications").update({ read_at: now }).eq("user_id", uid).is("read_at", null);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) {
    return NextResponse.json({ error: "id or all required." }, { status: 400 });
  }

  const { data: row, error: selErr } = await admin.from("user_notifications").select("id, user_id").eq("id", id).maybeSingle();

  if (selErr || !row) {
    return NextResponse.json({ error: "Notification not found." }, { status: 404 });
  }

  if (String((row as { user_id?: string }).user_id) !== uid) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { error } = await admin.from("user_notifications").update({ read_at: now }).eq("id", id).eq("user_id", uid);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
