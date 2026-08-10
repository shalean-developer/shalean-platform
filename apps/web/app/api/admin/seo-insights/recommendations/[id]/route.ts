import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = ["open", "in_progress", "applied", "verified", "dismissed"] as const;
type WorkflowStatus = (typeof STATUSES)[number];

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { id } = await ctx.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });

  const nextStatus = typeof body.status === "string" ? body.status as WorkflowStatus : null;
  if (!nextStatus || !STATUSES.includes(nextStatus)) return NextResponse.json({ error: "Invalid workflow status." }, { status: 400 });
  const ownerEmail = typeof body.owner_email === "string" ? body.owner_email.trim().toLowerCase() : null;
  const note = typeof body.note === "string" ? body.note.trim() : null;
  if ((nextStatus === "verified" || nextStatus === "dismissed") && !note) {
    return NextResponse.json({ error: "A verification or dismissal note is required." }, { status: 400 });
  }

  const { data: current, error: readError } = await admin
    .from("seo_insights_recommendations")
    .select("id,workflow_status,owner_email,applied_at,started_at,verified_at,dismissed_at")
    .eq("id", id)
    .maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!current) return NextResponse.json({ error: "Recommendation not found." }, { status: 404 });

  const now = new Date().toISOString();
  const update: Record<string, unknown> = {
    workflow_status: nextStatus,
    owner_email: ownerEmail || current.owner_email || auth.email,
    updated_at: now,
    verification_note: nextStatus === "verified" || nextStatus === "dismissed" ? note : null,
  };
  if (nextStatus === "in_progress" && !current.started_at) update.started_at = now;
  if (nextStatus === "applied" && !current.applied_at) update.applied_at = now;
  if (nextStatus === "verified") update.verified_at = now;
  if (nextStatus === "dismissed") update.dismissed_at = now;

  const { data: updated, error: updateError } = await admin
    .from("seo_insights_recommendations")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  const { error: historyError } = await admin.from("seo_recommendation_status_history").insert({
    recommendation_id: id,
    from_status: current.workflow_status,
    to_status: nextStatus,
    owner_email: update.owner_email,
    changed_by_email: auth.email,
    note,
  });
  if (historyError) return NextResponse.json({ error: `Recommendation updated but history failed: ${historyError.message}` }, { status: 500 });

  return NextResponse.json({ recommendation: updated });
}
