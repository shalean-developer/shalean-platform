import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveBookingServiceQaProfile } from "@/lib/booking/bookingServiceQa";

export type QualityInspectionStatus = "draft" | "in_progress" | "passed" | "rework_required" | "failed" | "closed";
export type QualityInspectionType = "supervisor" | "routine" | "random" | "customer_complaint" | "reinspection";
export type QualityDefectSeverity = "minor" | "major" | "critical";

const DEFECT_PENALTY: Record<QualityDefectSeverity, number> = {
  minor: 5,
  major: 15,
  critical: 30,
};

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export async function createQualityInspection(
  admin: SupabaseClient,
  input: { bookingId: string; inspectionType: QualityInspectionType; inspectorUserId: string },
) {
  const { data: booking, error: bookingError } = await admin
    .from("bookings")
    .select("id, service_slug, service, status")
    .eq("id", input.bookingId)
    .maybeSingle();
  if (bookingError) return { ok: false as const, error: bookingError.message };
  if (!booking) return { ok: false as const, error: "Booking not found." };

  const profile = resolveBookingServiceQaProfile(
    (booking as { service_slug?: string | null }).service_slug ?? null,
    (booking as { service?: string | null }).service ?? null,
  );
  if (!profile) {
    return { ok: false as const, error: "Structured QA inspection is currently available for deep and move cleaning bookings." };
  }

  const { data, error } = await admin
    .from("quality_inspections")
    .insert({
      booking_id: input.bookingId,
      inspection_type: input.inspectionType,
      status: "in_progress",
      inspector_user_id: input.inspectorUserId,
      checklist_required_count: profile.sections.length,
      inspected_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) return { ok: false as const, error: error.message };

  await admin.from("quality_inspection_events").insert({
    inspection_id: data.id,
    event_type: "created",
    actor_user_id: input.inspectorUserId,
    payload: { booking_id: input.bookingId, inspection_type: input.inspectionType },
  });

  return { ok: true as const, inspection: data };
}

export async function refreshQualityInspectionScore(
  admin: SupabaseClient,
  inspectionId: string,
  actorUserId: string | null,
) {
  const { data: inspection, error: inspectionError } = await admin
    .from("quality_inspections")
    .select("id, booking_id")
    .eq("id", inspectionId)
    .maybeSingle();
  if (inspectionError) return { ok: false as const, error: inspectionError.message };
  if (!inspection) return { ok: false as const, error: "Inspection not found." };

  const bookingId = String((inspection as { booking_id: string }).booking_id);
  const { data: booking, error: bookingError } = await admin
    .from("bookings")
    .select("service_slug, service")
    .eq("id", bookingId)
    .maybeSingle();
  if (bookingError || !booking) return { ok: false as const, error: bookingError?.message ?? "Booking not found." };

  const profile = resolveBookingServiceQaProfile(
    (booking as { service_slug?: string | null }).service_slug ?? null,
    (booking as { service?: string | null }).service ?? null,
  );
  if (!profile) return { ok: false as const, error: "Booking does not have a structured QA profile." };
  const required = [...profile.sections];
  const requiredSet = new Set(required);

  const [{ data: checklistRows }, { data: photoRows }, { data: defectRows }] = await Promise.all([
    admin
      .from("booking_service_checklists")
      .select("section_key, completed")
      .eq("booking_id", bookingId),
    admin
      .from("booking_service_photos")
      .select("section_key, photo_type")
      .eq("booking_id", bookingId),
    admin
      .from("quality_inspection_defects")
      .select("severity, status")
      .eq("inspection_id", inspectionId),
  ]);

  const completed = new Set<string>();
  for (const raw of checklistRows ?? []) {
    const row = raw as { section_key?: string; completed?: boolean };
    const key = String(row.section_key ?? "").trim();
    if (row.completed === true && requiredSet.has(key)) completed.add(key);
  }

  const before = new Set<string>();
  const after = new Set<string>();
  for (const raw of photoRows ?? []) {
    const row = raw as { section_key?: string; photo_type?: string };
    const key = String(row.section_key ?? "").trim();
    if (!requiredSet.has(key)) continue;
    const type = String(row.photo_type ?? "").trim().toLowerCase();
    if (type === "before") before.add(key);
    if (type === "after") after.add(key);
  }
  const photoComplete = required.filter((key) => before.has(key) && after.has(key)).length;

  let defectPenalty = 0;
  let unresolvedCritical = false;
  for (const raw of defectRows ?? []) {
    const row = raw as { severity?: string; status?: string };
    if (row.status === "fixed" || row.status === "waived") continue;
    if (row.severity === "minor" || row.severity === "major" || row.severity === "critical") {
      defectPenalty += DEFECT_PENALTY[row.severity];
      if (row.severity === "critical") unresolvedCritical = true;
    }
  }
  defectPenalty = Math.min(100, defectPenalty);

  const checklistScore = required.length ? clampScore((completed.size / required.length) * 100) : 100;
  const photoScore = required.length ? clampScore((photoComplete / required.length) * 100) : 100;
  const overallScore = clampScore(checklistScore * 0.6 + photoScore * 0.4 - defectPenalty);

  let recommendedStatus: QualityInspectionStatus = "passed";
  if (unresolvedCritical || overallScore < 60) recommendedStatus = "failed";
  else if (overallScore < 85 || defectPenalty > 0) recommendedStatus = "rework_required";

  const patch = {
    checklist_required_count: required.length,
    checklist_completed_count: completed.size,
    before_photo_sections_count: before.size,
    after_photo_sections_count: after.size,
    checklist_score: checklistScore,
    photo_score: photoScore,
    defect_penalty: defectPenalty,
    overall_score: overallScore,
    updated_at: new Date().toISOString(),
  };
  const { data: updated, error: updateError } = await admin
    .from("quality_inspections")
    .update(patch)
    .eq("id", inspectionId)
    .select("*")
    .single();
  if (updateError) return { ok: false as const, error: updateError.message };

  await admin.from("quality_inspection_events").insert({
    inspection_id: inspectionId,
    event_type: "score_refreshed",
    actor_user_id: actorUserId,
    payload: { ...patch, recommended_status: recommendedStatus },
  });

  return { ok: true as const, inspection: updated, recommendedStatus };
}

export async function signOffQualityInspection(
  admin: SupabaseClient,
  input: { inspectionId: string; actorUserId: string; note: string },
) {
  const refreshed = await refreshQualityInspectionScore(admin, input.inspectionId, input.actorUserId);
  if (!refreshed.ok) return refreshed;

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("quality_inspections")
    .update({
      status: refreshed.recommendedStatus,
      signoff_note: input.note || null,
      signed_off_at: now,
      updated_at: now,
    })
    .eq("id", input.inspectionId)
    .select("*")
    .single();
  if (error) return { ok: false as const, error: error.message };

  await admin.from("quality_inspection_events").insert({
    inspection_id: input.inspectionId,
    event_type: "signed_off",
    actor_user_id: input.actorUserId,
    payload: { status: refreshed.recommendedStatus, overall_score: data.overall_score },
  });

  return { ok: true as const, inspection: data };
}

export async function addQualityDefect(
  admin: SupabaseClient,
  input: {
    inspectionId: string;
    sectionKey: string;
    severity: QualityDefectSeverity;
    description: string;
    dueAt: string | null;
    actorUserId: string;
  },
) {
  const { data, error } = await admin
    .from("quality_inspection_defects")
    .insert({
      inspection_id: input.inspectionId,
      section_key: input.sectionKey,
      severity: input.severity,
      description: input.description,
      due_at: input.dueAt,
    })
    .select("*")
    .single();
  if (error) return { ok: false as const, error: error.message };

  await admin.from("quality_inspection_events").insert({
    inspection_id: input.inspectionId,
    event_type: "defect_added",
    actor_user_id: input.actorUserId,
    payload: { defect_id: data.id, severity: input.severity, section_key: input.sectionKey },
  });
  await refreshQualityInspectionScore(admin, input.inspectionId, input.actorUserId);
  return { ok: true as const, defect: data };
}
