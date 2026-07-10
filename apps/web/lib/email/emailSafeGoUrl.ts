import { getPublicAppUrlBase } from "@/lib/email/appUrl";

type EmailGoTarget = "call" | "whatsapp" | "facebook" | "instagram";

/** Absolute on-domain URL for email CTAs (avoids Resend off-domain link insights). */
export function emailSafeGoUrl(target: EmailGoTarget): string {
  const base = getPublicAppUrlBase().replace(/\/$/, "");
  return `${base}/go/${target}`;
}
