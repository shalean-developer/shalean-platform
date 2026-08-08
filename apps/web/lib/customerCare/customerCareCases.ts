import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type CustomerCareCaseStatus = "open" | "investigating" | "waiting_customer" | "waiting_internal" | "resolved" | "closed";
export type CustomerCareCasePriority = "low" | "normal" | "high" | "critical";

function slaHours(priority: CustomerCareCasePriority): { firstResponse: number; resolution: number } {
  if (priority === "critical") return { firstResponse: 1, resolution: 4 };
  if (priority === "high") return { firstResponse: 2, resolution: 12 };
  if (priority === "low") return { firstResponse: 8, resolution: 72 };
  return { firstResponse: 4, resolution: 24 };
}

function addHours(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

export async function createCustomerCareCase(
  admin: SupabaseClient,
  params: {
    bookingId?: string | null;
    customerId?: string | null;
    customerEmail?: string | null;
    customerPhone?: string | null;
    category: string;
    priority?: CustomerCareCasePriority;
    subject: string;
    description: string;
    assignedTo?: string | null;
    createdBy: string;
    evidence?: unknown[];
    metadata?: Record<string, unknown>;
  },
) {
  const priority = params.priority ?? "normal";
  const sla = slaHours(priority);
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("customer_care_cases")
    .insert({
      booking_id: params.bookingId ?? null,
      customer_id: params.customerId ?? null,
      customer_email: params.customerEmail?.trim().toLowerCase() || null,
      customer_phone: params.customerPhone?.trim() || null,
      category: params.category,
      priority,
      status: "open",
      subject: params.subject.trim(),
      description: params.description.trim(),
      assigned_to: params.assignedTo ?? params.createdBy,
      created_by: params.createdBy,
      first_response_due_at: addHours(sla.firstResponse),
      resolution_due_at: addHours(sla.resolution),
      evidence: params.evidence ?? [],
      metadata: params.metadata ?? {},
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();
  if (error) return { ok: false as const, error: error.message };

  await admin.from("customer_care_case_events").insert({
    case_id: data.id,
    event_type: "created",
    actor_user_id: params.createdBy,
    note: params.description.trim().slice(0, 2000),
    payload: { category: params.category, priority },
  });
  return { ok: true as const, case: data };
}

export async function updateCustomerCareCase(
  admin: SupabaseClient,
  params: {
    caseId: string;
    actorUserId: string;
    status?: CustomerCareCaseStatus;
    assignedTo?: string | null;
    note?: string;
    resolutionSummary?: string;
    refundAccountingId?: string | null;
    creditAmountCents?: number | null;
    evidence?: unknown[];
  },
) {
  const { data: current, error: currentError } = await admin
    .from("customer_care_cases")
    .select("*")
    .eq("id", params.caseId)
    .maybeSingle();
  if (currentError) return { ok: false as const, error: currentError.message };
  if (!current) return { ok: false as const, error: "case_not_found" };

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { updated_at: now };
  if (params.status) patch.status = params.status;
  if (params.assignedTo !== undefined) patch.assigned_to = params.assignedTo;
  if (params.resolutionSummary !== undefined) patch.resolution_summary = params.resolutionSummary.trim() || null;
  if (params.refundAccountingId !== undefined) patch.refund_accounting_id = params.refundAccountingId;
  if (params.creditAmountCents !== undefined) patch.credit_amount_cents = params.creditAmountCents;
  if (params.evidence !== undefined) patch.evidence = params.evidence;
  if (!current.first_responded_at && params.note?.trim()) patch.first_responded_at = now;
  if (params.status === "resolved") patch.resolved_at = now;
  if (params.status === "closed") {
    patch.resolved_at = current.resolved_at ?? now;
    patch.closed_at = now;
  }
  if (params.status && !["resolved", "closed"].includes(params.status)) {
    patch.resolved_at = null;
    patch.closed_at = null;
  }

  const { data, error } = await admin
    .from("customer_care_cases")
    .update(patch)
    .eq("id", params.caseId)
    .select("*")
    .single();
  if (error) return { ok: false as const, error: error.message };

  let eventType = "note";
  if (params.status === "resolved") eventType = "resolved";
  else if (params.status === "closed") eventType = "closed";
  else if (params.status && params.status !== current.status) eventType = params.status === "open" ? "reopened" : "status_changed";
  else if (params.assignedTo !== undefined && params.assignedTo !== current.assigned_to) eventType = "assigned";
  else if (params.refundAccountingId) eventType = "refund_linked";
  else if (params.creditAmountCents != null) eventType = "credit_recorded";
  else if (params.evidence) eventType = "evidence_added";

  await admin.from("customer_care_case_events").insert({
    case_id: params.caseId,
    event_type: eventType,
    actor_user_id: params.actorUserId,
    note: params.note?.trim().slice(0, 4000) || null,
    payload: { status: params.status ?? data.status, assigned_to: data.assigned_to },
  });
  return { ok: true as const, case: data };
}
