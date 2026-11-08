import { normalizeSouthAfricaPhone } from "@/lib/utils/phone";

export type ProfileDetails = {
  name: string;
  phone: string;
  whatsapp: string;
  dateOfBirth: string;
  preferredContact: "whatsapp" | "email" | "phone";
};
export type ProfileErrors = Partial<Record<keyof ProfileDetails, string>>;

// The shared legacy normalizer accepts trailing digits; validate the complete input first.
function validPhone(value: string): boolean {
  return !value.trim() || (/^[+\d\s().-]+$/.test(value) && /^(?:\+?27[1-9]\d{8}|0[1-9]\d{8}|[1-9]\d{8})$/.test(value.replace(/[\s().-]/g, "")));
}

export function validateProfileDetails(details: ProfileDetails, today = new Date().toLocaleDateString("en-CA")): ProfileErrors {
  const errors: ProfileErrors = {};
  if (details.name.trim().length < 2 || details.name.trim().length > 120) errors.name = "Enter your full name (2–120 characters).";
  if (!validPhone(details.phone)) errors.phone = "Enter a valid South African number, such as 082 123 4567.";
  if (!validPhone(details.whatsapp)) errors.whatsapp = "Enter a valid South African WhatsApp number.";
  if (details.preferredContact === "phone" && !details.phone.trim()) errors.phone = "Add a phone number or choose Email.";
  if (details.preferredContact === "whatsapp" && !details.whatsapp.trim()) errors.whatsapp = "Add a WhatsApp number or choose Email.";
  const dob = details.dateOfBirth;
  if (dob && (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || !Number.isFinite(Date.parse(dob)) || new Date(dob).toISOString().slice(0, 10) !== dob || dob > today || dob < "1900-01-01")) {
    errors.dateOfBirth = "Enter a valid date of birth between 1900 and today.";
  }
  return errors;
}

export function profileDetailsPatch(details: ProfileDetails) {
  return {
    full_name: details.name.trim(),
    phone: details.phone.trim() ? normalizeSouthAfricaPhone(details.phone)! : null,
    phone_e164: details.phone.trim() ? normalizeSouthAfricaPhone(details.phone)! : null,
    date_of_birth: details.dateOfBirth || null,
    preferred_notification_channel: details.preferredContact === "phone" ? "sms" : details.preferredContact,
  };
}
