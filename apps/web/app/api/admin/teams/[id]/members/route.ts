import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ensureAdmin(request: Request): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) return { ok: false, status: 401, error: "Missing authorization." };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return { ok: false, status: 503, error: "Server configuration error." };
  const pub = createClient(url, anon);
  const {
    data: { user },
  } = await pub.auth.getUser(token);
  if (!user?.email || !isAdmin(user.email)) return { ok: false, status: 403, error: "Forbidden." };
  return { ok: true };
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await ensureAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id: teamId } = await ctx.params;
  if (!teamId) return NextResponse.json({ error: "Missing team id." }, { status: 400 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  let body: { cleanerIds?: string[] };
  try {
    body = (await request.json()) as { cleanerIds?: string[] };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const cleanerIds = Array.isArray(body.cleanerIds)
    ? body.cleanerIds.map((id) => String(id ?? "").trim()).filter(Boolean)
    : [];
  if (cleanerIds.length === 0) {
    return NextResponse.json({ error: "cleanerIds required." }, { status: 400 });
  }

  const { data: cleaners, error: cErr } = await admin.from("cleaners").select("id").in("id", cleanerIds);
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
  const validIds = new Set((cleaners ?? []).map((row) => String((row as { id?: string }).id ?? "")));
  const rows = cleanerIds.filter((id) => validIds.has(id)).map((cleanerId) => ({
    team_id: teamId,
    cleaner_id: cleanerId,
    active_from: new Date().toISOString(),
    active_to: null,
  }));
  if (!rows.length) return NextResponse.json({ error: "No valid cleaners found." }, { status: 400 });

  const { error } = await admin.from("team_members").insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, inserted: rows.length });
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await ensureAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id: teamId } = await ctx.params;
  if (!teamId) return NextResponse.json({ error: "Missing team id." }, { status: 400 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  let body: { cleanerId?: string };
  try {
    body = (await request.json()) as { cleanerId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const cleanerId = String(body.cleanerId ?? "").trim();
  if (!cleanerId) return NextResponse.json({ error: "cleanerId required." }, { status: 400 });

  const { count, error: activeErr } = await admin
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("team_id", teamId)
    .eq("is_team_job", true)
    .in("status", ["assigned", "in_progress"]);
  if (activeErr) return NextResponse.json({ error: activeErr.message }, { status: 500 });
  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: "Cannot remove members while team has active jobs." }, { status: 409 });
  }

  const { error } = await admin.from("team_members").delete().eq("team_id", teamId).eq("cleaner_id", cleanerId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

