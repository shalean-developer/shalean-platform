import "server-only";

import { getDefaultFromAddress, getResend, describeResendApiKeyMisconfig } from "@/lib/email/resendFrom";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";

export async function sendSalesDocumentEmail(params: {
  to: string;
  documentType: "quote" | "invoice";
  customerName: string;
  totalZar: number;
  viewUrl: string;
  dueDateLabel?: string;
}): Promise<{ sent: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    const configError = describeResendApiKeyMisconfig();
    await reportOperationalIssue("warn", "sales_document/email", configError, { to: params.to });
    return { sent: false, error: configError };
  }

  const amount = `R ${Math.round(params.totalZar).toLocaleString("en-ZA")}`;
  const isQuote = params.documentType === "quote";
  const subject = isQuote ? "Your Shalean quote" : "Your Shalean invoice";
  const intro = isQuote
    ? `We prepared a quote for <strong>${params.customerName}</strong>.`
    : `Your invoice for <strong>${params.customerName}</strong> is ready.`;

  const html = `
    <p>Hi,</p>
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

  const { error } = await resend.emails.send({
    from: getDefaultFromAddress(),
    to: params.to,
    subject,
    html,
  });

  if (error) {
    const msg = /api key is invalid/i.test(error.message)
      ? "Email failed: Resend API key on production is invalid. In Vercel → shalean-platform → Environment Variables, set RESEND_API_KEY to your current re_… key from resend.com/api-keys, then redeploy."
      : error.message;
    await reportOperationalIssue("warn", "sales_document/email", error.message, { to: params.to });
    return { sent: false, error: msg };
  }

  await logSystemEvent({
    level: "info",
    source: "sales_document/email",
    message: "sales_document_sent",
    context: { to: params.to, type: params.documentType },
  });

  return { sent: true };
}
