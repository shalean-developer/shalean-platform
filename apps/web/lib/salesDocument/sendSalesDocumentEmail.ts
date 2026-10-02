import "server-only";

import { getDefaultFromAddress } from "@/lib/email/resendFrom";
import { safeResendSend } from "@/lib/email/safeResendSend";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { customerNameFromEmail } from "@/lib/templates/bookingEmailTemplateData";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendSalesDocumentEmail(params: {
  to: string;
  documentType: "quote" | "invoice";
  customerName: string;
  totalZar: number;
  viewUrl: string;
  dueDateLabel?: string;
  customerId?: string | null;
  documentId?: string | null;
}): Promise<{ sent: boolean; error?: string; emailId?: string | null }> {

  const amount = `R ${Math.round(params.totalZar).toLocaleString("en-ZA")}`;
  const isQuote = params.documentType === "quote";
  const subject = isQuote ? "Your Shalean quote" : "Your Shalean invoice";
  const displayName = customerNameFromEmail(params.to, params.customerName);
  const greet = escapeHtml(displayName);
  const intro = isQuote
    ? `We prepared a quote for <strong>${greet}</strong>.`
    : `Your invoice for <strong>${greet}</strong> is ready.`;

  const html = `
    <p>Hi ${greet},</p>
    <p>${intro}</p>
    <p><strong>Amount:</strong> ${amount}${
      params.dueDateLabel && !isQuote ? `<br/><strong>Due:</strong> ${params.dueDateLabel}` : ""
    }</p>
    <p><a href="${params.viewUrl}">View ${isQuote ? "quote" : "invoice"} online</a></p>
    <p>${
      isQuote
        ? "Review and accept the quote from that page — no account required. Sign in anytime to see your documents in your Shalean account."
        : "You can pay online from that page — no account required. Sign in anytime to see your documents in your Shalean account."
    }</p>
    <p>Thank you for choosing Shalean.</p>
  `;

  const result = await safeResendSend({
    from: getDefaultFromAddress(),
    to: params.to,
    subject,
    html,
    context: {
      customerId: params.customerId ?? null,
      messageType: params.documentType === "quote" ? "sales_quote" : "sales_invoice",
    },
    tags: params.documentId
      ? [{ name: "sales_document_id", value: params.documentId.slice(0, 256) }]
      : [],
  });

  if (result.error) {
    await reportOperationalIssue("warn", "sales_document/email", result.error.message, {
      to: params.to,
      document_id: params.documentId ?? null,
      error_name: result.error.name ?? null,
    });
    return { sent: false, error: result.error.message };
  }

  await logSystemEvent({
    level: "info",
    source: "sales_document/email",
    message: "sales_document_sent",
    context: { to: params.to, type: params.documentType },
  });

  return { sent: true, emailId: result.data?.id ?? null };
}
