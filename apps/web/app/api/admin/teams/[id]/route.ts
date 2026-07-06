import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admin";
import { clampTeamRosterCapacity } from "@/lib/dispatch/teamJobsPerDay";
import { setTeamLeadCleaner } from "@/lib/admin/setTeamLeadCleaner";
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

  let body: {
    is_active?: boolean;
    capacity_per_day?: number;
    name?: string;
    service_type?: string;
    lead_cleaner_id?: string | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const patch: {
    is_active?: boolean;
    capacity_per_day?: number;
    name?: string;
    service_type?: string;
    lead_cleaner_id?: string | null;
  } = {};
  if (typeof body.is_active === "boolean") patch.is_active = body.is_active;
  if (body.name != null) {
    const name = String(body.name).trim();
    if (!name) return NextResponse.json({ error: "name cannot be empty." }, { status: 400 });
    patch.name = name;
  }
  if (body.capacity_per_day != null) {
    const capRaw = Math.floor(Number(body.capacity_per_day));
    if (!Number.isFinite(capRaw) || capRaw <= 0) {
      return NextResponse.json({ error: "capacity_per_day must be between 2 and 15." }, { status: 400 });
    }
    patch.capacity_per_day = clampTeamRosterCapacity(capRaw);
  }
  if (body.service_type != null) {
    const serviceType = String(body.service_type).trim();
    if (!["deep_cleaning", "move_cleaning"].includes(serviceType)) {
      return NextResponse.json({ error: "service_type must be deep_cleaning or move_cleaning." }, { status: 400 });
    }
    patch.service_type = serviceType;
  }

  if (body.lead_cleaner_id !== undefined) {
    const leadId = body.lead_cleaner_id == null ? "" : String(body.lead_cleaner_id).trim();
    if (!leadId) {
      return NextResponse.json({ error: "lead_cleaner_id cannot be empty — pick a roster member." }, { status: 400 });
    }
    const leadResult = await setTeamLeadCleaner(admin, teamId, leadId);
    if (!leadResult.ok) {
      return NextResponse.json({ error: leadResult.error }, { status: leadResult.status });
    }
  }

  if (Object.keys(patch).length === 0 && body.lead_cleaner_id === undefined) {
    return NextResponse.json({ error: "Provide name, service_type, is_active, capacity_per_day, and/or lead_cleaner_id." }, { status: 400 });
  }

  if (Object.keys(patch).length === 0) {
    const { data: teamOnly, error: teamOnlyErr } = await admin
      .from("teams")
      .select("id, name, service_type, capacity_per_day, is_active, created_at, lead_cleaner_id")
      .eq("id", teamId)
      .maybeSingle();
    if (teamOnlyErr) return NextResponse.json({ error: teamOnlyErr.message }, { status: 500 });
    if (!teamOnly) return NextResponse.json({ error: "Team not found." }, { status: 404 });
    return NextResponse.json({ ok: true, team: teamOnly });
  }

  const { data, error } = await admin
    .from("teams")
    .update(patch)
    .eq("id", teamId)
    .select("id, name, service_type, capacity_per_day, is_active, created_at, lead_cleaner_id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Team not found." }, { status: 404 });
  return NextResponse.json({ ok: true, team: data });
}
