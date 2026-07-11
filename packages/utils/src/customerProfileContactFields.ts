import { normalizeEmail } from "./normalizeEmail";
import { pickBillingEmail } from "./shaleanBillingContactEmail";
import { normalizeSouthAfricaPhone } from "./phone";

export type CustomerProfileContactInput = {
  fullName?: string | null;
  billingEmail?: string | null;
  phone?: string | null;
  preferredNotificationChannel?: "whatsapp" | "sms" | "email" | null;
};

export type NormalizedCustomerProfileContact = {
  full_name?: string;
  billing_email?: string | null;
  phone?: string | null;
  phone_e164?: string | null;
  preferred_notification_channel?: "whatsapp" | "sms" | "email" | null;
};

/** Maps account UI `preferred_contact` to `user_profiles.preferred_notification_channel`. */
export function mapPreferredContactToNotificationChannel(
  preferred: string | null | undefined,
): "whatsapp" | "sms" | "email" | null {
  const v = String(preferred ?? "").trim().toLowerCase();
  if (v === "whatsapp") return "whatsapp";
  if (v === "email") return "email";
  if (v === "phone" || v === "sms") return "sms";
  return null;
}

export function normalizeCustomerProfileContactFields(
  input: CustomerProfileContactInput,
): NormalizedCustomerProfileContact {
  const out: NormalizedCustomerProfileContact = {};

  const name = String(input.fullName ?? "").trim();
  if (name.length >= 2) out.full_name = name;

  const billing = pickBillingEmail([input.billingEmail]);
  if (billing) out.billing_email = billing;

  const phoneRaw = String(input.phone ?? "").trim();
  if (phoneRaw) {
    const e164 = normalizeSouthAfricaPhone(phoneRaw);
    out.phone = e164 ?? phoneRaw;
    if (e164) out.phone_e164 = e164;
  }

  const pref = input.preferredNotificationChannel;
  if (pref === "whatsapp" || pref === "sms" || pref === "email") {
    out.preferred_notification_channel = pref;
  }

  return out;
}

/** Returns a real billing email from a login address when applicable. */
export function billingEmailFromLoginEmail(loginEmail: string | null | undefined): string | null {
  return pickBillingEmail([loginEmail ? normalizeEmail(loginEmail) : null]);
}
