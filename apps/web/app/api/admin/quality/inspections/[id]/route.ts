import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  addQualityDefect,
  refreshQualityInspectionScore,
  signOffQualityInspection,
  type QualityDefectSeverity,
} from "@/lib/quality/qualityInspections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

async function hasQaPermission(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  userId: string,
  write: boolean,
) {
  const permissions = write
    ? ["incident.manage"]
    : ["incident.manage", "booking.view", "cleaner.view"];
  for (const permission of permissions) {
    const { data } = await admin.rpc("admin_has_permission", {
      p_user_id: userId,
      p_permission: permission,
      p_branch_id: null,
      p_team_id: null,
    });
    if (data === true) return true;
  }
  return false;
}

export async function GET(request: Request, { params }: Params) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  if (!(await hasQaPermission(admin, auth.userId, false))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  const { id } = await params;
  const [{ data: inspection, error }, { data: defects }, { data: events }] = await Promise.all([
    admin.from("quality_inspections").select("*").eq("id", id).maybeSingle(),
    admin.from("quality_inspection_defects").select("*").eq("inspection_id", id).order("created_at", { ascending: true }),
    admin.from("quality_inspection_events").select("*").eq("inspection_id", id).order("created_at", { ascending: true }),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!inspection) return NextResponse.json({ error: "Inspection not found." }, { status: 404 });
  return NextResponse.json({ inspection, defects: defects ?? [], events: events ?? [] });
}

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  if (!(await hasQaPermission(admin, auth.userId, true))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  const action = String(body.action ?? "").trim();

  if (action === "refresh_score") {
    const result = await refreshQualityInspectionScore(admin, id, auth.userId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json(result);
  }

  if (action === "sign_off") {
    const note = String(body.note ?? "").trim();
    const result = await signOffQualityInspection(admin, {
      inspectionId: id,
      actorUserId: auth.userId,
      note,
    });
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

  return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
}
