import { NextResponse } from "next/server";
import { resolveCleanerIdFromRequest } from "@/lib/cleaner/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { loadTrainingComplianceSummary } from "@/lib/workforce/trainingCompliance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const session = await resolveCleanerIdFromRequest(request, admin);
  if (!session.cleanerId) {
    return NextResponse.json({ error: session.error ?? "Unauthorized." }, { status: session.status ?? 401 });
  }

  try {
    const cleanerId = session.cleanerId;
    const [summary, assignmentsResult, complianceResult] = await Promise.all([
      loadTrainingComplianceSummary(admin, cleanerId),
      admin
        .from("cleaner_training_assignments")
        .select("id, module_id, status, assigned_at, due_at, completed_at, expires_at, score, notes")
        .eq("cleaner_id", cleanerId)
        .order("assigned_at", { ascending: false }),
      admin
        .from("cleaner_compliance_records")
        .select("id, requirement_code, requirement_label, status, issued_at, expires_at, verified_at, notes")
        .eq("cleaner_id", cleanerId)
        .order("requirement_label", { ascending: true }),
    ]);

    if (assignmentsResult.error) throw new Error(assignmentsResult.error.message);
    if (complianceResult.error) throw new Error(complianceResult.error.message);

    const cleaner = summary.cleaners[0] ?? null;
    const modules = (summary.modules ?? []).map((raw) => {
      const module = raw as {
        id: string;
        code?: string | null;
        title?: string | null;
        description?: string | null;
        category?: string | null;
        is_required?: boolean | null;
        validity_days?: number | null;
      };
      return {
        id: String(module.id),
        code: String(module.code ?? ""),
        title: String(module.title ?? "Training module"),
        description: module.description ?? null,
        category: module.category ?? null,
        isRequired: module.is_required === true,
        validityDays: module.validity_days ?? null,
      };
    });

    return NextResponse.json({
      cleaner: cleaner
        ? {
            cleanerId: cleaner.cleanerId,
            cleanerName: cleaner.cleanerName,
            ready: cleaner.ready,
            overdueTraining: cleaner.overdueTraining,
            nonCompliant: cleaner.nonCompliant,
            missingComplianceEvidence: cleaner.missingComplianceEvidence,
            trainingAssigned: cleaner.trainingAssigned,
            trainingCompleted: cleaner.trainingCompleted,
            complianceRecords: cleaner.complianceRecords,
          }
        : null,
      modules,
      assignments: assignmentsResult.data ?? [],
      compliance: complianceResult.data ?? [],
      meta: {
        sourceOfTruth: {
          modules: "workforce_training_modules",
          assignments: "cleaner_training_assignments",
          compliance: "cleaner_compliance_records",
        },
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load training/compliance." },
      { status: 500 },
    );
  }
}
