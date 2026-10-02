import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { initializePaystackForSalesDocument } from "@/lib/salesDocument/initializePaystackForSalesDocument";
import { logSystemEvent } from "@/lib/logging/systemLog";

export type RecoverSalesDocumentPaymentLinkResult =
  | {
      ok: true;
      authorizationUrl: string;
      reference: string;
      balanceCents: number;
      reused: boolean;
    }
  | { ok: false; error: string };

export async function recoverSalesDocumentPaymentLink(
  admin: SupabaseClient,
  documentId: string,
): Promise<RecoverSalesDocumentPaymentLinkResult> {
  const { data, error } = await admin
    .from("sales_documents")
    .select(
      "id, document_type, status, customer_email, balance_cents, payment_link, payment_link_expires_at",
    )
    .eq("id", documentId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "document_not_found" };
  if (String(data.document_type) !== "invoice") return { ok: false, error: "not_an_invoice" };

  const status = String(data.status ?? "").toLowerCase();
  if (!["sent", "accepted"].includes(status)) {
    return { ok: false, error: "invoice_not_open_for_payment" };
  }

  const balanceCents = Math.max(0, Math.round(Number(data.balance_cents ?? 0)));
  if (balanceCents <= 0) return { ok: false, error: "nothing_due" };

  const link = String(data.payment_link ?? "").trim();
  const expiresAt = data.payment_link_expires_at ? String(data.payment_link_expires_at) : null;
  const expired = Boolean(expiresAt && new Date(expiresAt).getTime() <= Date.now());

  if (link && !expired) {
    return {
      ok: true,
      authorizationUrl: link,
      reference: "",
      balanceCents,
      reused: true,
    };
  }

  const customerEmail = String(data.customer_email ?? "").trim();
  const result = await initializePaystackForSalesDocument(admin, {
    documentId,
    customerEmail,
  });
  if (!result.ok) return result;

  await logSystemEvent({
    level: "info",
    source: "sales_document/payment_link_recovery",
    message: "sales_document_payment_link_recovered",
    context: {
      document_id: documentId,
      reference: result.reference,
      balance_cents: balanceCents,
      reused: Boolean(result.reused),
      customer_email_sent: false,
    },
  });

  return {
    ok: true,
    authorizationUrl: result.authorizationUrl,
    reference: result.reference,
    balanceCents,
    reused: Boolean(result.reused),
  };
}
