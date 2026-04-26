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

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await ensureAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id: teamId } = await ctx.params;
  if (!teamId) return NextResponse.json({ error: "Missing team id." }, { status: 400 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  let body: { is_active?: boolean };
  try {
    body = (await request.json()) as { is_active?: boolean };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (typeof body.is_active !== "boolean") {
    return NextResponse.json({ error: "is_active boolean required." }, { status: 400 });
  }

  const { data, error } = await admin
    .from("teams")
    .update({ is_active: body.is_active })
    .eq("id", teamId)
    .select("id, name, service_type, capacity_per_day, is_active, created_at")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Team not found." }, { status: 404 });
  return NextResponse.json({ ok: true, team: data });
}
