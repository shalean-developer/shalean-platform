import { isCustomerFacingProduction, type EnvLike } from "@/lib/env/deploymentEnvironment";

/** Owner-approved office inbox; never used as a fallback in staging or local runs. */
export function adminNotificationRecipientSetting(env: EnvLike = process.env): string {
  return env.ADMIN_NOTIFICATION_EMAIL?.trim() || (isCustomerFacingProduction(env) ? "info@shalean.co.za" : "");
}

export function getAdminNotificationRecipients(): string[] {
  const raw = adminNotificationRecipientSetting();
  if (!raw) throw new Error("ADMIN_NOTIFICATION_EMAIL is required for admin booking notifications");
  const recipients = raw.split(",").map((value) => value.trim()).filter(Boolean);
  if (!recipients.length || recipients.some((value) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))) {
    throw new Error("ADMIN_NOTIFICATION_EMAIL must contain valid email addresses");
  }
  return [...new Set(recipients)];
}
