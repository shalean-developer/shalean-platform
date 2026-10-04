import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type SalesFollowUpQueueKind =
  | "stale_request"
  | "sent_unviewed"
  | "viewed_no_response"
  | "overdue_follow_up";

export type SalesFollowUpQueueRow = {
  document_id: string;
  customer_name: string;
  customer_email: string;
  status: string;
  crm_stage: string | null;
  kind: SalesFollowUpQueueKind;
  reason: string;
  created_at: string;
  sent_at: string | null;
  first_viewed_at: string | null;
  view_count: number;
  next_follow_up_at: string | null;
  age_days: number;
  overdue: boolean;
};

const DAY_MS = 24 * 60 * 60_000;

function ageDays(iso: string | null | undefined, nowMs: number): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((nowMs - t) / DAY_MS));
}

export async function loadSalesFollowUpQueue(
  admin: SupabaseClient,
  nowMs: number = Date.now(),
): Promise<SalesFollowUpQueueRow[]> {
  const { data, error } = await admin
    .from("sales_documents")
    .select(
      "id, customer_name, customer_email, document_type, status, crm_stage, created_at, sent_at, first_viewed_at, view_count, crm_next_follow_up_at",
    )
    .eq("document_type", "quote")
    .is("converted_from_id", null)
    .in("status", ["requested", "draft", "sent"])
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  const rows: SalesFollowUpQueueRow[] = [];

  for (const raw of data ?? []) {
    const stage = raw.crm_stage ? String(raw.crm_stage) : null;
    if (stage === "won" || stage === "lost") continue;

    const createdAt = String(raw.created_at);
    const sentAt = raw.sent_at ? String(raw.sent_at) : null;
    const firstViewedAt = raw.first_viewed_at ? String(raw.first_viewed_at) : null;
    const followUpAt = raw.crm_next_follow_up_at ? String(raw.crm_next_follow_up_at) : null;
    const status = String(raw.status ?? "");
    const createdAge = ageDays(createdAt, nowMs);
    const sentAge = ageDays(sentAt, nowMs);
    const followUpMs = followUpAt ? Date.parse(followUpAt) : Number.NaN;
    const overdue = Number.isFinite(followUpMs) && followUpMs < nowMs;

    let kind: SalesFollowUpQueueKind | null = null;
    let reason = "";

    if (overdue) {
      kind = "overdue_follow_up";
      reason = "Scheduled follow-up is overdue.";
    } else if (status === "requested" && createdAge >= 1) {
      kind = "stale_request";
      reason = `Quote request has waited ${createdAge} day${createdAge === 1 ? "" : "s"} for review.`;
    } else if (status === "sent" && !firstViewedAt && sentAge >= 7) {
      kind = "sent_unviewed";
      reason = `Quote was sent ${sentAge} days ago and has not been opened.`;
    } else if (status === "sent" && firstViewedAt && sentAge >= 14) {
      kind = "viewed_no_response";
      reason = `Quote was opened but remains unanswered ${sentAge} days after sending.`;
    }

    if (!kind) continue;

    rows.push({
      document_id: String(raw.id),
      customer_name: String(raw.customer_name ?? ""),
      customer_email: String(raw.customer_email ?? ""),
      status,
      crm_stage: stage,
      kind,
      reason,
      created_at: createdAt,
      sent_at: sentAt,
      first_viewed_at: firstViewedAt,
      view_count: Math.max(0, Math.round(Number(raw.view_count ?? 0))),
      next_follow_up_at: followUpAt,
      age_days: status === "sent" ? sentAge : createdAge,
      overdue,
    });
  }

  const priority: Record<SalesFollowUpQueueKind, number> = {
    overdue_follow_up: 0,
    stale_request: 1,
    viewed_no_response: 2,
    sent_unviewed: 3,
  };

  return rows.sort((a, b) => {
    const p = priority[a.kind] - priority[b.kind];
    if (p !== 0) return p;
    const aTime = a.next_follow_up_at ?? a.sent_at ?? a.created_at;
    const bTime = b.next_follow_up_at ?? b.sent_at ?? b.created_at;
    return Date.parse(aTime) - Date.parse(bTime);
  });
}
