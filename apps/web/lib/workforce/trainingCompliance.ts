import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export async function loadTrainingComplianceSummary(admin: SupabaseClient, cleanerId?: string | null) {
  let cleanersQuery = admin.from("cleaners").select("id, full_name, status, is_active").order("full_name", { ascending: true });
  if (cleanerId) cleanersQuery = cleanersQuery.eq("id", cleanerId);
  const { data: cleaners, error: cleanerError } = await cleanersQuery;
  if (cleanerError) throw new Error(cleanerError.message);
  const ids = (cleaners ?? []).map((r) => String((r as { id: string }).id));
  if (!ids.length) return { cleaners: [], modules: [] };

  const [{ data: modules, error: moduleError }, { data: training, error: trainingError }, { data: compliance, error: complianceError }] = await Promise.all([
    admin.from("workforce_training_modules").select("*").eq("is_active", true).order("title", { ascending: true }),
    admin.from("cleaner_training_assignments").select("*").in("cleaner_id", ids),
    admin.from("cleaner_compliance_records").select("*").in("cleaner_id", ids),
  ]);
  if (moduleError) throw new Error(moduleError.message);
  if (trainingError) throw new Error(trainingError.message);
  if (complianceError) throw new Error(complianceError.message);

  const activeModules = (modules ?? []) as Array<{ id: string; is_required?: boolean | null; validity_days?: number | null }>;
  const requiredModuleIds = new Set(activeModules.filter((m) => m.is_required === true).map((m) => String(m.id)));
  const now = Date.now();

  const rows = (cleaners ?? []).map((raw) => {
    const c = raw as { id: string; full_name?: string | null; status?: string | null; is_active?: boolean | null };
    const assignments = (training ?? []).filter((a) => String((a as { cleaner_id: string }).cleaner_id) === c.id);
    const complianceRows = (compliance ?? []).filter((a) => String((a as { cleaner_id: string }).cleaner_id) === c.id);

    const assignmentByModule = new Map(assignments.map((a) => [String((a as { module_id: string }).module_id), a]));
    let overdueTraining = 0;
    for (const moduleId of requiredModuleIds) {
      const assignment = assignmentByModule.get(moduleId) as { status?: string; due_at?: string | null; expires_at?: string | null } | undefined;
      if (!assignment) {
        overdueTraining += 1;
        continue;
      }
      const status = String(assignment.status ?? "");
      if (status === "waived") continue;
      if (status === "completed") {
        if (assignment.expires_at && Date.parse(assignment.expires_at) < now) overdueTraining += 1;
        continue;
      }
      if (!assignment.due_at || Date.parse(assignment.due_at) < now || status === "expired") overdueTraining += 1;
    }

    const nonCompliant = complianceRows.filter((a) => {
      const row = a as { status?: string; expires_at?: string | null };
      const status = String(row.status ?? "");
      if (status === "waived") return false;
      if (status !== "valid") return true;
      return row.expires_at ? Date.parse(`${row.expires_at}T23:59:59.999Z`) < now : false;
    }).length;

    return {
      cleanerId: c.id,
      cleanerName: String(c.full_name ?? "Cleaner").trim() || "Cleaner",
      status: c.status ?? null,
      trainingAssigned: assignments.length,
      trainingCompleted: assignments.filter((a) => String((a as { status?: string }).status) === "completed").length,
      overdueTraining,
      complianceRecords: complianceRows.length,
      nonCompliant,
      ready: overdueTraining === 0 && nonCompliant === 0,
    };
  });
  return { cleaners: rows, modules: modules ?? [] };
}

export async function assignTrainingModule(admin: SupabaseClient, input: { cleanerId: string; moduleId: string; dueAt?: string | null; assignedBy: string }) {
  const { data, error } = await admin.from("cleaner_training_assignments").upsert({
    cleaner_id: input.cleanerId,
    module_id: input.moduleId,
    status: "assigned",
    due_at: input.dueAt ?? null,
    assigned_by: input.assignedBy,
    updated_at: new Date().toISOString(),
  }, { onConflict: "cleaner_id,module_id" }).select("*").single();
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, assignment: data };
}

export async function updateTrainingAssignment(admin: SupabaseClient, input: { id: string; status: string; score?: number | null; verifiedBy: string }) {
  const allowed = ["assigned", "in_progress", "completed", "expired", "waived"];
  if (!allowed.includes(input.status)) return { ok: false as const, error: "Invalid training status." };
  const now = new Date();
  const nowIso = now.toISOString();
  const patch: Record<string, unknown> = { status: input.status, updated_at: nowIso };

  if (input.status === "completed") {
    const { data: existing, error: existingError } = await admin
      .from("cleaner_training_assignments")
      .select("module_id")
      .eq("id", input.id)
      .maybeSingle();
    if (existingError) return { ok: false as const, error: existingError.message };
    if (!existing) return { ok: false as const, error: "Training assignment not found." };

    const { data: module, error: moduleError } = await admin
      .from("workforce_training_modules")
      .select("validity_days")
      .eq("id", String((existing as { module_id: string }).module_id))
      .maybeSingle();
    if (moduleError) return { ok: false as const, error: moduleError.message };

    patch.completed_at = nowIso;
    patch.verified_by = input.verifiedBy;
    const validityDays = Number((module as { validity_days?: number | null } | null)?.validity_days ?? 0);
    if (Number.isFinite(validityDays) && validityDays > 0) {
      patch.expires_at = new Date(now.getTime() + validityDays * 86_400_000).toISOString();
    } else {
      patch.expires_at = null;
    }
  }

  if (typeof input.score === "number") patch.score = input.score;
  const { data, error } = await admin.from("cleaner_training_assignments").update(patch).eq("id", input.id).select("*").single();
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, assignment: data };
}
