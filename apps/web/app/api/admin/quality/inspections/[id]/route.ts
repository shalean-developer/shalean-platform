import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveQualityDefect } from "@/lib/quality/qualityDefectResolution";
import {
  addQualityDefect,
  refreshQualityInspectionScore,
  signOffQualityInspection,
  type QualityDefectSeverity,
} from "@/lib/quality/qualityInspections";
import { bookingBelongsToSupervisorScope, resolveSupervisorTeamScope } from "@/lib/workforce/supervisorTeamScope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

async function hasQaPermission(admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>, userId: string, write: boolean) {
  const permissions = write ? ["incident.manage"] : ["incident.manage", "booking.view", "cleaner.view"];
  for (const permission of permissions) {
    const { data } = await admin.rpc("admin_has_permission", { p_user_id: userId, p_permission: permission, p_branch_id: null, p_team_id: null });
    if (data === true) return true;
  }
  return false;
}

async function loadInspectionAndCheckScope(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  inspectionId: string,
  userId: string,
) {
  const { data: inspection, error } = await admin.from("quality_inspections").select("*").eq("id", inspectionId).maybeSingle();
  if (error) return { ok: false as const, status: 500, error: error.message };
  if (!inspection) return { ok: false as const, status: 404, error: "Inspection not found." };
  const scope = await resolveSupervisorTeamScope(admin, userId);
  if (scope.isSupervisor) {
    const bookingId = String((inspection as { booking_id?: string }).booking_id ?? "");
    if (!bookingId || !(await bookingBelongsToSupervisorScope(admin, bookingId, scope))) {
      return { ok: false as const, status: 403, error: "Forbidden." };
    }
  }
  return { ok: true as const, inspection, scope };
}

export async function GET(request: Request, { params }: Params) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  if (!(await hasQaPermission(admin, auth.userId, false))) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const { id } = await params;
  const access = await loadInspectionAndCheckScope(admin, id, auth.userId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const [{ data: defects }, { data: events }] = await Promise.all([
    admin.from("quality_inspection_defects").select("*").eq("inspection_id", id).order("created_at", { ascending: true }),
    admin.from("quality_inspection_events").select("*").eq("inspection_id", id).order("created_at", { ascending: true }),
  ]);
  return NextResponse.json({ inspection: access.inspection, defects: defects ?? [], events: events ?? [], scoped: access.scope.isSupervisor });
}

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  if (!(await hasQaPermission(admin, auth.userId, true))) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const { id } = await params;
  const access = await loadInspectionAndCheckScope(admin, id, auth.userId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  const action = String(body.action ?? "").trim();

  if (action === "refresh_score") {
    const result = await refreshQualityInspectionScore(admin, id, auth.userId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json(result);
  }
  if (action === "sign_off") {
    const result = await signOffQualityInspection(admin, { inspectionId: id, actorUserId: auth.userId, note: String(body.note ?? "").trim() });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json(result);
  }
  if (action === "add_defect") {
    const sectionKey = String(body.sectionKey ?? "").trim();
    const severity = String(body.severity ?? "").trim() as QualityDefectSeverity;
    const description = String(body.description ?? "").trim();
    if (!sectionKey || !["minor", "major", "critical"].includes(severity) || description.length < 3) {
      return NextResponse.json({ error: "sectionKey, severity and description are required." }, { status: 400 });
    }
    const result = await addQualityDefect(admin, {
      inspectionId: id,
      sectionKey,
      severity,
      description,
      dueAt: typeof body.dueAt === "string" && body.dueAt.trim() ? body.dueAt : null,
      actorUserId: auth.userId,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json(result, { status: 201 });
  }
  if (action === "resolve_defect") {
    const defectId = String(body.defectId ?? "").trim();
    const resolution = String(body.resolution ?? "").trim();
    if (!defectId || (resolution !== "fixed" && resolution !== "waived")) {
      return NextResponse.json({ error: "defectId and a fixed/waived resolution are required." }, { status: 400 });
    }
    const result = await resolveQualityDefect(admin, {
      inspectionId: id,
      defectId,
      resolution,
      correctiveAction: typeof body.correctiveAction === "string" && body.correctiveAction.trim() ? body.correctiveAction.trim() : null,
      actorUserId: auth.userId,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json(result);
  }
  return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
}
