/**
 * Customer/growth SMS policy: `primary` only when there is no email on file;
 * `fallback` only after an email send was attempted and did not succeed.
 * Cleaner WhatsApp→SMS uses `fallback` (primary channel was WhatsApp, not email).
 */
export type SmsRole = "fallback" | "primary";
