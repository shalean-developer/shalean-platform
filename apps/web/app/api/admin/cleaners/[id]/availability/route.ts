import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admin";
import { replaceCleanerAvailabilityFromWeekly } from "@/lib/admin/replaceCleanerAvailabilityFromWeekly";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseWeekly(raw: unknown): { day: number; start: string; end: string }[] | null {
  if (!Array.isArray(raw)) return null;
  const out: { day: number; start: string; end: string }[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const o = item as Record<string, unknown>;
    const day = Number(o.day);
    const start = String(o.start ?? "").trim().slice(0, 5);
    const end = String(o.end ?? "").trim().slice(0, 5);
    if (!Number.isInteger(day) || day < 0 || day > 6) return null;
    if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return null;
    out.push({ day, start, end });
  }
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
  const o = body as Record<string, unknown>;
  const weekly = parseWeekly(o.weeklySchedule ?? o.weekly_schedule);
  if (!weekly) return NextResponse.json({ error: "weeklySchedule must be a valid array." }, { status: 400 });
  const horizonRaw = Number(o.horizonDays ?? o.horizon_days ?? 60);
  const horizonDays = Number.isFinite(horizonRaw) ? Math.round(horizonRaw) : 60;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data: exists, error: exErr } = await admin.from("cleaners").select("id").eq("id", id).maybeSingle();
  if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });
  if (!exists) return NextResponse.json({ error: "Cleaner not found." }, { status: 404 });

  try {
    const r = await replaceCleanerAvailabilityFromWeekly(admin, {
      cleanerId: id,
      weeklySchedule: weekly,
      horizonDays,
    });
    return NextResponse.json({ ok: true, inserted: r.inserted });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Save failed." }, { status: 500 });
  }
}
