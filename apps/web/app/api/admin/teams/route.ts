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

export async function GET(request: Request) {
  const auth = await ensureAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data, error } = await admin
    .from("teams")
    .select("id, name, service_type, capacity_per_day, is_active, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ teams: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await ensureAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  let body: { name?: string; service_type?: string; capacity_per_day?: number; is_active?: boolean };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const name = String(body.name ?? "").trim();
  const serviceType = String(body.service_type ?? "").trim();
  const capacity = Number(body.capacity_per_day ?? 0);
  if (!name) return NextResponse.json({ error: "name required." }, { status: 400 });
  if (!["deep_cleaning", "move_cleaning"].includes(serviceType)) {
    return NextResponse.json({ error: "service_type must be deep_cleaning or move_cleaning." }, { status: 400 });
  }
  if (!Number.isFinite(capacity) || capacity <= 0) {
    return NextResponse.json({ error: "capacity_per_day must be > 0." }, { status: 400 });
  }

  const { data, error } = await admin
    .from("teams")
    .insert({
      name,
      service_type: serviceType,
      capacity_per_day: Math.floor(capacity),
      is_active: body.is_active !== false,
    })
    .select("id, name, service_type, capacity_per_day, is_active, created_at")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, team: data }, { status: 201 });
}

export async function DELETE(request: Request) {
  const auth = await ensureAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  let body: { teamId?: string };
  try {
    body = (await request.json()) as { teamId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const teamId = String(body.teamId ?? "").trim();
  if (!teamId) return NextResponse.json({ error: "teamId required." }, { status: 400 });

  const { count, error: countErr } = await admin
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("team_id", teamId)
    .eq("is_team_job", true)
    .in("status", ["pending", "assigned", "in_progress"]);
  if (countErr) return NextResponse.json({ error: countErr.message }, { status: 500 });
  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: "Cannot delete team with active bookings." }, { status: 409 });
  }

  const { error } = await admin.from("teams").delete().eq("id", teamId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

