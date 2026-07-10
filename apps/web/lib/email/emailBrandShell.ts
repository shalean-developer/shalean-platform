/**
 * Shared branded HTML shell for DB-driven customer/ops emails (Resend).
 * Inline styles only — suitable for common email clients.
 */

import { SHALEAN_SOCIAL_LINKS } from "@/lib/brand/shaleanSocialLinks";
import {
  getEmbeddedEmailSocialIconDataUri,
  getEmbeddedShaleanLogoDataUri,
} from "@/lib/email/emailEmbeddedAssets";
import { getPublicAppUrlBase } from "@/lib/email/appUrl";
import { emailSafeGoUrl } from "@/lib/email/emailSafeGoUrl";
import {
  CUSTOMER_SUPPORT_TELEPHONE_DISPLAY,
  CUSTOMER_SUPPORT_WHATSAPP_DISPLAY,
} from "@/lib/site/customerSupport";

export function getShaleanEmailLogoUrl(): string {
  return getEmbeddedShaleanLogoDataUri();
}

export function getShaleanEmailSocialIconUrl(id: ShaleanSocialLinkId): string {
  return getEmbeddedEmailSocialIconDataUri(id);
}

type ShaleanSocialLinkId = (typeof SHALEAN_SOCIAL_LINKS)[number]["id"];

function emailLogoHeader(): string {
  const appUrl = getPublicAppUrlBase();
  const logoUrl = getShaleanEmailLogoUrl();
  return `<a href="${appUrl}" style="display:inline-block;text-decoration:none;margin:0 0 16px;">
  <img
    src="${logoUrl}"
    alt="Shalean Cleaning Services"
    width="140"
    height="40"
    style="display:block;border:0;outline:none;text-decoration:none;max-width:140px;width:140px;height:auto;margin:0;"
  />
</a>`;
}

function socialHrefForEmail(id: ShaleanSocialLinkId): string {
  return emailSafeGoUrl(id);
}

function socialIconCell(link: (typeof SHALEAN_SOCIAL_LINKS)[number]): string {
  const iconUrl = getShaleanEmailSocialIconUrl(link.id);
  const href = socialHrefForEmail(link.id);
  return `<td width="36" height="36" style="width:36px;height:36px;padding:0 6px;line-height:0;font-size:0;">
  <a
    href="${href}"
    target="_blank"
    rel="noopener noreferrer"
    aria-label="${link.label}"
    title="${link.label}"
    style="display:block;width:36px;height:36px;text-decoration:none;line-height:0;"
  >
    <img
      src="${iconUrl}"
      alt="${link.label}"
      width="36"
      height="36"
      style="display:block;border:0;outline:none;width:36px;height:36px;max-width:36px;max-height:36px;border-radius:50%;margin:0;padding:0;"
    />
  </a>
</td>`;
}

function emailSocialFooter(): string {
  const iconCells = SHALEAN_SOCIAL_LINKS.map(socialIconCell).join("");
  const textLinks = SHALEAN_SOCIAL_LINKS.map(
    (link, index) =>
      `${index > 0 ? '<span style="color:#d1d5db;padding:0 6px;">·</span>' : ""}<a href="${socialHrefForEmail(link.id)}" target="_blank" rel="noopener noreferrer" style="color:#6b7280;text-decoration:underline;">${link.label}</a>`,
  ).join("");

  return `<table role="presentation" border="0" cellpadding="0" cellspacing="0" align="center" style="margin:16px auto 8px;">
  <tr>
    <td style="text-align:center;padding-bottom:8px;">
      <p style="margin:0;font-size:12px;color:#6b7280;font-weight:600;">Follow us</p>
    </td>
  </tr>
  <tr>
    <td style="text-align:center;">
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;">
        <tr>${iconCells}</tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="text-align:center;padding-top:8px;">
      <p style="margin:0;font-size:11px;line-height:1.6;">${textLinks}</p>
    </td>
  </tr>
</table>`;
}

export function wrapBrandedEmailContent(innerHtml: string): string {
  const inner = innerHtml.trim();
  const callUrl = emailSafeGoUrl("call");
  const whatsappUrl = emailSafeGoUrl("whatsapp");
  return `
<div style="font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 20px; color: #1f2937; line-height: 1.5; background-color: #ffffff;">
  ${emailLogoHeader()}
  <div style="margin-top: 4px;">
    ${inner}
  </div>
  <p style="margin-top: 24px; font-size: 12px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 16px;">
    Need help? Reply to this email, call <a href="${callUrl}" style="color:#2563eb;text-decoration:none;">${CUSTOMER_SUPPORT_TELEPHONE_DISPLAY}</a>,
    or WhatsApp <a href="${whatsappUrl}" style="color:#2563eb;text-decoration:none;">${CUSTOMER_SUPPORT_WHATSAPP_DISPLAY}</a>.<br/>
    If you didn&apos;t make this booking, contact us immediately.
  </p>
  ${emailSocialFooter()}
  <p style="margin: 8px 0 0; font-size: 12px; color: #9ca3af; text-align: center;">Shalean Cleaning Services</p>
</div>`.trim();
}

/** Primary CTA button for template bodies (href must already be safe for HTML attribute context). */
export function styledEmailButton(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;">${label}</a>`;
}
