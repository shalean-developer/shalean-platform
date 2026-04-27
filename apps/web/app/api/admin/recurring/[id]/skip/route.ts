import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin/requireAdminSession";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminSession(request);
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!id?.trim()) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data: row, error: loadErr } = await admin
    .from("recurring_bookings")
    .select("next_run_date")
    .eq("id", id.trim())
    .maybeSingle();

  if (loadErr || !row) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const skipDate = String((row as { next_run_date: string }).next_run_date);

  const { error } = await admin
    .from("recurring_bookings")
    .update({ skip_next_occurrence_date: skipDate })
    .eq("id", id.trim());

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logSystemEvent({
    level: "info",
    source: "admin/recurring/skip",
    message: "recurring_skip_next_set",
    context: { recurring_id: id.trim(), admin_id: auth.user.id, skip_next_occurrence_date: skipDate },
  });

  return NextResponse.json({ ok: true, id: id.trim(), skip_next_occurrence_date: skipDate });
}
