import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { assignTrainingModule, loadTrainingComplianceSummary, updateTrainingAssignment } from "@/lib/workforce/trainingCompliance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function hasPermission(admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>, userId: string, write: boolean) {
  const permissions = write ? ["cleaner.edit", "incident.manage"] : ["cleaner.view", "cleaner.documents.view", "incident.manage"];
  for (const permission of permissions) {
    const { data } = await admin.rpc("admin_has_permission", { p_user_id: userId, p_permission: permission, p_branch_id: null, p_team_id: null });
    if (data === true) return true;
  }
  return false;
}

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  if (!(await hasPermission(admin, auth.userId, false))) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  try {
    const cleanerId = new URL(request.url).searchParams.get("cleaner_id")?.trim() || null;
    return NextResponse.json(await loadTrainingComplianceSummary(admin, cleanerId));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load training/compliance." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  if (!(await hasPermission(admin, auth.userId, true))) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  const action = String(body.action ?? "assign").trim();
  if (action === "assign") {
    const cleanerId = String(body.cleanerId ?? "").trim();
    const moduleId = String(body.moduleId ?? "").trim();
    if (!cleanerId || !moduleId) return NextResponse.json({ error: "cleanerId and moduleId are required." }, { status: 400 });
    const result = await assignTrainingModule(admin, { cleanerId, moduleId, dueAt: typeof body.dueAt === "string" ? body.dueAt : null, assignedBy: auth.userId });
    return result.ok ? NextResponse.json(result, { status: 201 }) : NextResponse.json({ error: result.error }, { status: 400 });
  }
  if (action === "update_assignment") {
    const id = String(body.id ?? "").trim();
    const status = String(body.status ?? "").trim();
    if (!id || !status) return NextResponse.json({ error: "id and status are required." }, { status: 400 });
    const score = typeof body.score === "number" ? body.score : null;
    const result = await updateTrainingAssignment(admin, { id, status, score, verifiedBy: auth.userId });
    return result.ok ? NextResponse.json(result) : NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
}
