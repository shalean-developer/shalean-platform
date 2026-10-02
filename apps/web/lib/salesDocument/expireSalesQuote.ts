import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logSystemEvent } from "@/lib/logging/systemLog";

export async function expireSalesQuote(
  admin: SupabaseClient,
  quoteId: string,
  reason: string = "Quote expired after manual review",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await admin
    .from("sales_documents")
    .select("id, document_type, status, converted_from_id, crm_stage")
    .eq("id", quoteId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "quote_not_found" };
  if (String(data.document_type) !== "quote" || data.converted_from_id) {
    return { ok: false, error: "not_root_quote" };
  }

  const status = String(data.status ?? "").toLowerCase();
  if (!["draft", "sent"].includes(status)) {
    return { ok: false, error: "quote_not_expirable" };
  }

  const previousStage = data.crm_stage ? String(data.crm_stage) : null;
  const nowIso = new Date().toISOString();

  const { error: updateErr } = await admin
    .from("sales_documents")
    .update({
      status: "expired",
      crm_stage: "lost",
      crm_lost_at: nowIso,
      crm_lost_reason: reason,
      crm_next_follow_up_at: null,
      updated_at: nowIso,
    })
    .eq("id", quoteId)
    .in("status", ["draft", "sent"]);

  if (updateErr) return { ok: false, error: updateErr.message };

  if (previousStage !== "lost") {
    await admin.from("sales_opportunity_activities").insert({
      sales_document_id: quoteId,
      activity_type: "stage_change",
      body: `Stage changed from ${previousStage ?? "unassigned"} to lost because the quote expired`,
      metadata: {
        from: previousStage,
        to: "lost",
        source: "manual_quote_expiry",
        reason,
      },
      created_by: null,
    });
  }

  await logSystemEvent({
    level: "info",
    source: "sales_document/lifecycle",
    message: "sales_quote_expired",
    context: {
      quote_id: quoteId,
      reason,
      customer_email_sent: false,
    },
  });

  return { ok: true };
}
