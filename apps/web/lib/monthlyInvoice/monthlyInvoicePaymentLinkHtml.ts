export function escapeHtmlForEmail(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Primary branded pay link plus optional Paystack direct URL when DNS or mobile networks
 * cannot resolve the app domain.
 */
export function renderMonthlyInvoicePaymentLinksHtml(params: {
  paymentUrl: string;
  paystackFallbackUrl?: string | null;
  primaryLinkText?: string;
  fallbackLinkText?: string;
}): string {
  const primary = params.paymentUrl.trim();
  if (!primary) return "";

  const fallback = String(params.paystackFallbackUrl ?? "").trim();
  const showFallback = Boolean(fallback) && fallback !== primary;

  const primaryText = params.primaryLinkText ?? "View and pay your invoice online";
  const fallbackText = params.fallbackLinkText ?? "pay directly via Paystack";

  let html = `<p><a href="${escapeHtmlForEmail(primary)}">${escapeHtmlForEmail(primaryText)}</a></p>`;
  if (showFallback) {
    html += `<p>If the link above does not open on your device, <a href="${escapeHtmlForEmail(fallback)}">${escapeHtmlForEmail(fallbackText)}</a>.</p>`;
  }
  return html;
}
