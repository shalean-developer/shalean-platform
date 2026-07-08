import { styledEmailButton, wrapBrandedEmailContent } from "@/lib/email/emailBrandShell";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type ReengagementEmailParams = {
  rebookUrl: string;
  bookUrl: string;
  firstName?: string | null;
};

/**
 * Premium warm re-engagement email for returning customers.
 * White background, blue accents, rounded CTA — matches Shalean brand shell.
 */
export function buildReengagementEmailHtml(params: ReengagementEmailParams): string {
  const greeting = params.firstName?.trim()
    ? `Welcome back, ${escapeHtml(params.firstName.trim())}!`
    : "Welcome Back!";

  const inner = `
  <h1 style="margin:0 0 16px;font-size:26px;font-weight:700;color:#0f172a;letter-spacing:-0.02em;line-height:1.25;">
    ${greeting}
  </h1>
  <p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:#475569;">
    We hope you&apos;ve been enjoying your clean home.
  </p>
  <p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:#475569;">
    It&apos;s been a while since your last booking, and we&apos;d love to help make your home sparkle again.
  </p>
  <p style="margin:0 0 28px;font-size:16px;line-height:1.6;color:#475569;">
    Booking only takes a couple of minutes.
  </p>
  <p style="margin:0 0 24px;text-align:center;">
    ${styledEmailButton(params.rebookUrl, "Book My Next Cleaning")}
  </p>
  <p style="margin:0 0 28px;text-align:center;font-size:14px;line-height:1.5;color:#64748b;">
    Or <a href="${escapeHtml(params.bookUrl)}" style="color:#2563eb;text-decoration:underline;font-weight:500;">explore our other cleaning services</a>.
  </p>
  <div style="margin-top:32px;padding-top:24px;border-top:1px solid #e2e8f0;text-align:center;">
    <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#64748b;">
      Trusted by homeowners across Cape Town.
    </p>
    <p style="margin:0 0 4px;font-size:13px;line-height:1.6;color:#64748b;">
      Professional cleaners.
    </p>
    <p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;">
      Secure online booking.
    </p>
  </div>`;

  return wrapBrandedEmailContent(inner);
}

export function buildReengagementEmailSubject(firstName?: string | null): string {
  if (firstName?.trim()) return `${firstName.trim()}, we'd love to clean your home again`;
  return "Welcome back — book your next clean";
}
