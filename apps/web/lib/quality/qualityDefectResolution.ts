import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { refreshQualityInspectionScore } from "@/lib/quality/qualityInspections";

export async function resolveQualityDefect(
  admin: SupabaseClient,
  input: {
    inspectionId: string;
    defectId: string;
    resolution: "fixed" | "waived";
    correctiveAction: string | null;
    actorUserId: string;
  },
) {
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("quality_inspection_defects")
    .update({
      status: input.resolution,
      corrective_action: input.correctiveAction,
      resolved_at: now,
      resolved_by: input.actorUserId,
      updated_at: now,
    })
    .eq("id", input.defectId)
    .eq("inspection_id", input.inspectionId)
    .select("*")
    .maybeSingle();
  if (error) return { ok: false as const, error: error.message };
  if (!data) return { ok: false as const, error: "Defect not found." };

  await admin.from("quality_inspection_events").insert({
    inspection_id: input.inspectionId,
    event_type: "defect_updated",
    actor_user_id: input.actorUserId,
    payload: {
      defect_id: input.defectId,
      status: input.resolution,
      corrective_action: input.correctiveAction,
    },
  });

  const refreshed = await refreshQualityInspectionScore(admin, input.inspectionId, input.actorUserId);
  if (!refreshed.ok) return refreshed;
  return { ok: true as const, defect: data, inspection: refreshed.inspection, recommendedStatus: refreshed.recommendedStatus };
}
