import { NextResponse } from "next/server";

import { requireAnyAdminPermissionFromRequest } from "@/lib/admin/requirePermission";
import {
  isSalesCrmActivityType,
  isSalesCrmStage,
  normalizedCrmText,
  opportunityRootId,
  parseOptionalCrmDate,
} from "@/lib/admin/sales/salesCrm";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CRM_PERMISSIONS = ["invoice.manage", "customer.contact", "marketing.view"] as const;

async function rootFor(admin: ReturnType<typeof getSupabaseAdmin>, id: string) {
  if (!admin) return null;
  const { data } = await admin.from("sales_documents").select("id,converted_from_id").eq("id", id).maybeSingle();
  if (!data) return null;
  return opportunityRootId(data as { id: string; converted_from_id?: string | null });
}

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAnyAdminPermissionFromRequest(request, CRM_PERMISSIONS);
  if (!auth.ok) return auth.response;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  const { id } = await ctx.params;
  const rootId = await rootFor(admin, id);
  if (!rootId) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const [{ data: opportunity, error }, { data: activities, error: activitiesError }] = await Promise.all([
    admin.from("sales_documents").select("id,crm_stage,crm_owner_user_id,crm_next_follow_up_at,crm_first_responded_at,crm_won_at,crm_lost_at,crm_lost_reason,lead_source,utm_source,utm_medium,utm_campaign,utm_term,utm_content,created_at,updated_at").eq("id", rootId).single(),
    admin.from("sales_opportunity_activities").select("id,activity_type,body,metadata,created_by,created_at").eq("sales_document_id", rootId).order("created_at", { ascending: false }).limit(100),
  ]);
  if (error || activitiesError) return NextResponse.json({ error: error?.message ?? activitiesError?.message }, { status: 500 });
  return NextResponse.json({ opportunity, activities: activities ?? [] });
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAnyAdminPermissionFromRequest(request, CRM_PERMISSIONS);
  if (!auth.ok) return auth.response;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  const { id } = await ctx.params;
  const rootId = await rootFor(admin, id);
  if (!rootId) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const updates: Record<string, unknown> = {};
  if (body.stage !== undefined) {
    if (!isSalesCrmStage(body.stage)) return NextResponse.json({ error: "invalid_stage" }, { status: 400 });
    if (body.stage === "lost" && !normalizedCrmText(body.lost_reason, 500)) {
      return NextResponse.json({ error: "lost_reason_required" }, { status: 400 });
    }
    updates.crm_stage = body.stage;
    updates.crm_won_at = body.stage === "won" ? new Date().toISOString() : null;
    updates.crm_lost_at = body.stage === "lost" ? new Date().toISOString() : null;
    updates.crm_lost_reason = body.stage === "lost" ? normalizedCrmText(body.lost_reason, 500) : null;
  }
  if (body.next_follow_up_at !== undefined) {
    const followUp = parseOptionalCrmDate(body.next_follow_up_at);
    if (followUp === undefined) return NextResponse.json({ error: "invalid_follow_up" }, { status: 400 });
    updates.crm_next_follow_up_at = followUp;
  }
  if (body.owner_user_id !== undefined) {
    updates.crm_owner_user_id = typeof body.owner_user_id === "string" && body.owner_user_id.trim() ? body.owner_user_id.trim() : null;
  }
  if (body.lead_source !== undefined) updates.lead_source = normalizedCrmText(body.lead_source, 100) ?? "other";
  if (!Object.keys(updates).length) return NextResponse.json({ error: "no_changes" }, { status: 400 });

  const { data: previous } = await admin.from("sales_documents").select("crm_stage").eq("id", rootId).single();
  const { error } = await admin.from("sales_documents").update(updates).eq("id", rootId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (updates.crm_stage && updates.crm_stage !== previous?.crm_stage) {
    const { error: auditError } = await admin.from("sales_opportunity_activities").insert({
      sales_document_id: rootId,
      activity_type: "stage_change",
      body: `Stage changed from ${previous?.crm_stage ?? "unassigned"} to ${updates.crm_stage}`,
      metadata: { from: previous?.crm_stage ?? null, to: updates.crm_stage },
      created_by: auth.user.id,
    });
    if (auditError) return NextResponse.json({ error: "stage_saved_audit_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAnyAdminPermissionFromRequest(request, CRM_PERMISSIONS);
  if (!auth.ok) return auth.response;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  const { id } = await ctx.params;
  const rootId = await rootFor(admin, id);
  if (!rootId) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (!isSalesCrmActivityType(body.activity_type)) return NextResponse.json({ error: "invalid_activity_type" }, { status: 400 });
  const text = normalizedCrmText(body.body);
  if (!text) return NextResponse.json({ error: "activity_body_required" }, { status: 400 });
  const { error } = await admin.from("sales_opportunity_activities").insert({ sales_document_id: rootId, activity_type: body.activity_type, body: text, created_by: auth.user.id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await admin.from("sales_documents").update({ crm_first_responded_at: new Date().toISOString() }).eq("id", rootId).is("crm_first_responded_at", null);
  return NextResponse.json({ ok: true });
}
