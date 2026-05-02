/**
 * Customer/growth SMS policy: `primary` only when there is no email on file;
 * `fallback` only after an email send was attempted and did not succeed.
 * Cleaner assignment/reminder SMS uses `primary` (SMS-only channel for those flows).
 */
export type SmsRole = "fallback" | "primary";
