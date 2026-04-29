import { NextResponse } from "next/server";
import { fillCleanerAvailabilityGapsFromLegacyColumns } from "@/lib/admin/fillCleanerAvailabilityGaps";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Vercel Cron: extend rolling calendar from legacy daily times. */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
  }

  try {
    const r = await fillCleanerAvailabilityGapsFromLegacyColumns(admin, 45);
    return NextResponse.json({ ok: true, inserted: r.inserted });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Cron failed." }, { status: 500 });
  }
}
