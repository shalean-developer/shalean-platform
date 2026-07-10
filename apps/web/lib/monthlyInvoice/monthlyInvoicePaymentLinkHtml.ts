export function escapeHtmlForEmail(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sameHostname(a: string, b: string): boolean {
  try {
    return new URL(a).hostname === new URL(b).hostname;
  } catch {
    return false;
  }
}

/**
 * Branded pay link for invoice emails.
 *
 * Off-domain fallbacks (e.g. checkout.paystack.com) are intentionally omitted —
 * Resend flags mismatched link domains vs the sending domain and they hurt deliverability.
 * The branded `/pay/invoice/…` page redirects to Paystack after load.
 */
export function renderMonthlyInvoicePaymentLinksHtml(params: {
  paymentUrl: string;
  /** @deprecated Ignored when hostname differs from `paymentUrl` (Paystack direct links). */
  paystackFallbackUrl?: string | null;
  primaryLinkText?: string;
  fallbackLinkText?: string;
}): string {
  const primary = params.paymentUrl.trim();
  if (!primary) return "";

  const fallback = String(params.paystackFallbackUrl ?? "").trim();
  const showFallback = Boolean(fallback) && fallback !== primary && sameHostname(primary, fallback);

  const primaryText = params.primaryLinkText ?? "View and pay your invoice online";
  const fallbackText = params.fallbackLinkText ?? "open the payment page";

  let html = `<p><a href="${escapeHtmlForEmail(primary)}">${escapeHtmlForEmail(primaryText)}</a></p>`;
  if (showFallback) {
    html += `<p>If the link above does not open on your device, <a href="${escapeHtmlForEmail(fallback)}">${escapeHtmlForEmail(fallbackText)}</a>.</p>`;
  }
  return html;
}
