import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createQualityInspection, type QualityInspectionType } from "@/lib/quality/qualityInspections";
import { bookingBelongsToSupervisorScope, resolveSupervisorTeamScope } from "@/lib/workforce/supervisorTeamScope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const supervisorScope = await resolveSupervisorTeamScope(admin, auth.userId);
  const url = new URL(request.url);
  const bookingId = url.searchParams.get("booking_id")?.trim();
  const status = url.searchParams.get("status")?.trim();

  if (supervisorScope.isSupervisor && bookingId && !(await bookingBelongsToSupervisorScope(admin, bookingId, supervisorScope))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let query = admin.from("quality_inspections").select("*").order("created_at", { ascending: false }).limit(200);
  if (bookingId) query = query.eq("booking_id", bookingId);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let inspections = data ?? [];
  if (supervisorScope.isSupervisor) {
    const allowed: typeof inspections = [];
    for (const inspection of inspections) {
      const id = String((inspection as { booking_id?: string }).booking_id ?? "");
      if (id && (await bookingBelongsToSupervisorScope(admin, id, supervisorScope))) allowed.push(inspection);
    }
    inspections = allowed;
  }
  return NextResponse.json({ inspections, scoped: supervisorScope.isSupervisor, teamIds: supervisorScope.isSupervisor ? supervisorScope.teamIds : null });
}

export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  const bookingId = String(body.bookingId ?? "").trim();
  if (!bookingId) return NextResponse.json({ error: "bookingId is required." }, { status: 400 });

  const supervisorScope = await resolveSupervisorTeamScope(admin, auth.userId);
  if (supervisorScope.isSupervisor && !(await bookingBelongsToSupervisorScope(admin, bookingId, supervisorScope))) {
    return NextResponse.json({ error: "Supervisors can inspect only bookings assigned to their team." }, { status: 403 });
  }

  const rawType = String(body.inspectionType ?? "supervisor").trim();
  const validTypes: QualityInspectionType[] = ["supervisor", "routine", "random", "customer_complaint", "reinspection"];
  const inspectionType = validTypes.includes(rawType as QualityInspectionType) ? (rawType as QualityInspectionType) : "supervisor";
  const result = await createQualityInspection(admin, { bookingId, inspectionType, inspectorUserId: auth.userId });
  if (!result.ok) {
    const statusCode = result.error === "Booking not found." ? 404 : result.error.startsWith("Structured QA") ? 400 : 500;
    return NextResponse.json({ error: result.error }, { status: statusCode });
  }
  return NextResponse.json({ inspection: result.inspection }, { status: 201 });
}
