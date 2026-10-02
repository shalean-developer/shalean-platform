import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

type QuoteLifecycleStage = "follow_up" | "won";

async function recordStageChange(
  admin: SupabaseClient,
  params: {
    quoteId: string;
    fromStage: string | null;
    toStage: QuoteLifecycleStage;
    source: string;
  },
): Promise<void> {
  if (params.fromStage === params.toStage) return;
  await admin.from("sales_opportunity_activities").insert({
    sales_document_id: params.quoteId,
    activity_type: "stage_change",
    body: `Stage changed from ${params.fromStage ?? "unassigned"} to ${params.toStage}`,
    metadata: {
      from: params.fromStage,
      to: params.toStage,
      source: params.source,
    },
    created_by: null,
  });
}

export async function markQuoteOpportunityFollowUp(
  admin: SupabaseClient,
  quoteId: string,
  source: "quote_sent" | "customer_view",
): Promise<void> {
  const { data } = await admin
    .from("sales_documents")
    .select("id, document_type, converted_from_id, crm_stage, crm_next_follow_up_at")
    .eq("id", quoteId)
    .maybeSingle();

  if (!data || String(data.document_type) !== "quote" || data.converted_from_id) return;

  const previousStage = data.crm_stage ? String(data.crm_stage) : null;
  if (previousStage === "won" || previousStage === "lost") return;

  const followUpMs = source === "quote_sent" ? 48 * 60 * 60_000 : 24 * 60 * 60_000;
  const patch: Record<string, unknown> = { crm_stage: "follow_up" };
  if (!data.crm_next_follow_up_at) {
    patch.crm_next_follow_up_at = new Date(Date.now() + followUpMs).toISOString();
  }

  await admin.from("sales_documents").update(patch).eq("id", quoteId);
  await recordStageChange(admin, {
    quoteId,
    fromStage: previousStage,
    toStage: "follow_up",
    source,
  });
}

export async function markQuoteOpportunityWon(
  admin: SupabaseClient,
  quoteId: string,
  source: "quote_accepted",
): Promise<void> {
  const { data } = await admin
    .from("sales_documents")
    .select("id, document_type, converted_from_id, crm_stage")
    .eq("id", quoteId)
    .maybeSingle();

  if (!data || String(data.document_type) !== "quote" || data.converted_from_id) return;

  const previousStage = data.crm_stage ? String(data.crm_stage) : null;
  if (previousStage === "won") return;

  const nowIso = new Date().toISOString();
  await admin
    .from("sales_documents")
    .update({
      crm_stage: "won",
      crm_won_at: nowIso,
      crm_lost_at: null,
      crm_lost_reason: null,
      crm_next_follow_up_at: null,
    })
    .eq("id", quoteId);

  await recordStageChange(admin, {
    quoteId,
    fromStage: previousStage,
    toStage: "won",
    source,
  });
}
