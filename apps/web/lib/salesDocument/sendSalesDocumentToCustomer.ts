import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { trustDocPageUrl } from "@/lib/pay/trustPayPageUrl";
import { initializePaystackForSalesDocument } from "@/lib/salesDocument/initializePaystackForSalesDocument";
import { sendSalesDocumentEmail } from "@/lib/salesDocument/sendSalesDocumentEmail";
import { syncSalesDocumentToZoho } from "@/lib/salesDocument/syncSalesDocumentToZoho";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import {
  releaseNotificationIdempotencyClaim,
  tryClaimNotificationIdempotency,
} from "@/lib/notifications/notificationIdempotencyClaim";
import { trustSalesDocPayPageUrl } from "@/lib/pay/trustPayPageUrl";

function formatDueDate(isoDate: string | null): string {
  if (!isoDate) return "";
  try {
    const d = new Date(`${isoDate.slice(0, 10)}T12:00:00Z`);
    return d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return isoDate;
  }
}

export async function sendSalesDocumentToCustomer(
  admin: SupabaseClient,
  documentId: string,
): Promise<{ ok: true; viewUrl: string } | { ok: false; error: string }> {
  const { data, error } = await admin.from("sales_documents").select("*").eq("id", documentId).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "document_not_found" };

  const row = data as {
    id: string;
    document_type: "quote" | "invoice";
    status: string;
    customer_id: string | null;
    customer_email: string;
    customer_name: string;
    total_cents: number;
    due_date: string | null;
    public_token: string;
    balance_cents: number;
    sent_at: string | null;
  };

  if (row.status === "void" || row.status === "paid" || row.status === "refunded") {
    return { ok: false, error: "invalid_status" };
  }
  if (row.status === "requested") {
    return { ok: false, error: "prepare_quote_before_send" };
  }
  if (row.document_type === "quote" && row.status === "accepted") {
    return { ok: false, error: "accepted_quote_is_immutable" };
  }
  if (row.total_cents <= 0) {
    return { ok: false, error: "total_required_before_send" };
  }

  const viewUrl = trustDocPageUrl(row.id, row.public_token);
  let paymentUrlForZoho: string | null = null;

  if (row.document_type === "invoice") {
    const pay = await initializePaystackForSalesDocument(admin, {
      documentId: row.id,
      customerEmail: row.customer_email,
    });
    if (!pay.ok) return { ok: false, error: pay.error };
    paymentUrlForZoho = trustSalesDocPayPageUrl(row.id, pay.reference, pay.authorizationUrl);
  }

  const zohoPrepared = await syncSalesDocumentToZoho(admin, row.id, {
    paymentUrl: paymentUrlForZoho,
    markSent: false,
  });
  if (!zohoPrepared.ok) return { ok: false, error: `zoho_prepare:${zohoPrepared.error}` };

  const deliveryClaim = {
    reference: `sales_document_delivery:v1:${row.id}:${row.sent_at ?? "initial"}`,
    eventType: row.document_type === "quote" ? "sales_quote_sent" : "sales_invoice_sent",
    channel: "email" as const,
  };
  const shouldSendEmail = await tryClaimNotificationIdempotency(admin, deliveryClaim);

  let mail: { sent: boolean; error?: string; emailId?: string | null } = {
    sent: true,
    emailId: null,
  };

  if (shouldSendEmail) {
    mail = await sendSalesDocumentEmail({
      to: row.customer_email,
      documentType: row.document_type,
      customerName: row.customer_name,
      totalZar: row.total_cents / 100,
      viewUrl,
      dueDateLabel: formatDueDate(row.due_date),
      customerId: row.customer_id,
      documentId: row.id,
    });

    if (!mail.sent) {
      await releaseNotificationIdempotencyClaim(admin, deliveryClaim);
      return { ok: false, error: mail.error ?? "email_failed" };
    }
  } else {
    await logSystemEvent({
      level: "info",
      source: "sales_document/send",
      message: "sales_document_email_idempotent_replay",
      context: {
        document_id: row.id,
        document_type: row.document_type,
        sent_at_before: row.sent_at,
      },
    });
  }

  const nowIso = new Date().toISOString();
  const nextStatus = row.document_type === "quote" ? "sent" : "sent";
  const { error: statusErr } = await admin
    .from("sales_documents")
    .update({ status: nextStatus, sent_at: nowIso })
    .eq("id", row.id);

  if (statusErr) return { ok: false, error: statusErr.message };

  const zohoSent = await syncSalesDocumentToZoho(admin, row.id, {
    paymentUrl: paymentUrlForZoho,
    markSent: true,
  });
  if (!zohoSent.ok) {
    await reportOperationalIssue(
      "warn",
      "sales_document/send",
      "zoho_sent_reconciliation_failed_after_customer_delivery",
      {
        document_id: row.id,
        document_type: row.document_type,
        error: zohoSent.error,
        email_id: mail.emailId ?? null,
      },
    );
    await logSystemEvent({
      level: "warn",
      source: "sales_document/send",
      message: "zoho_sent_reconciliation_failed_after_customer_delivery",
      context: {
        document_id: row.id,
        document_type: row.document_type,
        error: zohoSent.error,
        email_id: mail.emailId ?? null,
        customer_email_delivered: true,
        shalean_status_sent: true,
      },
    });
  }

  return { ok: true, viewUrl };
}
