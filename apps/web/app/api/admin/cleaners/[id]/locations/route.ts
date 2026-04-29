import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseLocationIds(raw: unknown): string[] | null {
  const arr = (raw as { locationIds?: unknown }).locationIds ?? (raw as { location_ids?: unknown }).location_ids;
  if (!Array.isArray(arr)) return null;
  const out = arr.map((x) => String(x).trim()).filter(Boolean);
  return out;
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Missing cleaner id." }, { status: 400 });

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) return NextResponse.json({ error: "Missing authorization." }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const pub = createClient(url, anon);
  const {
    data: { user },
    error: sessionErr,
  } = await pub.auth.getUser(token);
  if (sessionErr || !user?.email || !isAdmin(user.email)) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const ids = parseLocationIds(body);
  if (!ids) return NextResponse.json({ error: "locationIds array is required." }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data: exists, error: exErr } = await admin.from("cleaners").select("id").eq("id", id).maybeSingle();
  if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });
  if (!exists) return NextResponse.json({ error: "Cleaner not found." }, { status: 404 });

  const { error: delErr } = await admin.from("cleaner_locations").delete().eq("cleaner_id", id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  if (ids.length === 0) {
    return NextResponse.json({ ok: true, count: 0 });
  }

  const rows = ids.map((location_id) => ({ cleaner_id: id, location_id }));
  const { error: insErr } = await admin.from("cleaner_locations").insert(rows);
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, count: ids.length });
}
