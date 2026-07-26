/**
 * devSeedGuard.ts — Development-only outbound communication guard.
 *
 * Prevents any provider request (SMS, WhatsApp, voice, push, email) from being
 * dispatched to a seed recipient. Import and call `assertNotSeedRecipient` at
 * every outbound provider call site when NODE_ENV !== "production".
 *
 * The guard is a no-op in production (`NODE_ENV === "production"`), so it can
 * be safely imported without affecting live traffic.
 *
 * Usage:
 *   import { assertNotSeedRecipient } from "@/lib/seed/devSeedGuard";
 *
 *   // Before any outbound SMS/WhatsApp/call:
 *   assertNotSeedRecipient({ phone: recipientPhone, channel: "sms" });
 *
 *   // Before any outbound email:
 *   assertNotSeedRecipient({ email: recipientEmail, channel: "email" });
 *
 *   // Combined check:
 *   assertNotSeedRecipient({ phone, email, channel: "whatsapp" });
 */

// ──────────────────────────────────────────────────────────────────────────────
// Seed phone numbers (+27 000 range — unmistakably synthetic)
// These must be kept in sync with scripts/seed-dev.mjs TEST_PHONES.
// +27 000 xxx xxxx cannot be dialled on any SA or international network.
// SA area codes never begin with zero, making this range structurally impossible.
// ──────────────────────────────────────────────────────────────────────────────

export const SEED_PHONES: ReadonlySet<string> = new Set([
  "+27000000001",  // admin
  "+27000000011",  // cleaner.one
  "+27000000012",  // cleaner.two
  "+27000000013",  // cleaner.three
  "+27000000014",  // cleaner.four
  "+27000000015",  // cleaner.five
  "+27000000016",  // cleaner.six
  "+27000000021",  // customer.one
  "+27000000022",  // customer.two
  "+27000000023",  // customer.three
  "+27000000024",  // customer.four
  "+27000000025",  // customer.five
  "+27000000026",  // customer.six
  "+27000000027",  // customer.seven
  "+27000000028",  // customer.eight
]);

/** Normalise a phone string for comparison (strip whitespace and dashes). */
export function normaliseSeedPhone(raw: string): string {
  return raw.replace(/[\s\-()]/g, "");
}

// ──────────────────────────────────────────────────────────────────────────────
// Seed email addresses (@example.com — IANA reserved, cannot deliver)
// ──────────────────────────────────────────────────────────────────────────────

export const SEED_EMAILS: ReadonlySet<string> = new Set([
  "admin.one@example.com",
  "admin.two@example.com",
  "finance.admin@example.com",
  "cleaner.one@example.com",
  "cleaner.two@example.com",
  "cleaner.three@example.com",
  "cleaner.four@example.com",
  "cleaner.five@example.com",
  "cleaner.six@example.com",
  "customer.one@example.com",
  "customer.two@example.com",
  "customer.three@example.com",
  "customer.four@example.com",
  "customer.five@example.com",
  "customer.six@example.com",
  "customer.seven@example.com",
  "customer.eight@example.com",
]);

/** Returns true if the normalised phone matches a seed phone or the +27000 prefix. */
export function isSeedPhone(phone: string): boolean {
  const n = normaliseSeedPhone(phone);
  // Exact match against known seed numbers
  if (SEED_PHONES.has(n)) return true;
  // Structural guard: +27 000 range is inherently synthetic
  if (n.startsWith("+27000")) return true;
  return false;
}

/** Returns true if the email is a seed email or an @example.com address. */
export function isSeedEmail(email: string): boolean {
  const lower = email.trim().toLowerCase();
  if (SEED_EMAILS.has(lower)) return true;
  // @example.com is IANA-reserved; all addresses there are synthetic
  if (lower.endsWith("@example.com")) return true;
  return false;
}

// ──────────────────────────────────────────────────────────────────────────────
// Guard functions
// ──────────────────────────────────────────────────────────────────────────────

export type OutboundChannel = "sms" | "whatsapp" | "voice" | "push" | "email" | "other";

export interface SeedGuardOpts {
  phone?: string | null;
  email?: string | null;
  channel: OutboundChannel;
  /** Optional description for clearer error messages. */
  context?: string;
}

/**
 * Throws if any supplied recipient is a synthetic seed identity.
 * Call this before any outbound provider request in non-production environments.
 *
 * In production (`NODE_ENV === "production"`) this is a no-op.
 */
export function assertNotSeedRecipient(opts: SeedGuardOpts): void {
  if (process.env.NODE_ENV === "production") return; // guard disabled in production

  const ctx = opts.context ? ` [${opts.context}]` : "";

  if (opts.phone && isSeedPhone(opts.phone)) {
    throw new Error(
      `DEV SEED GUARD${ctx}: refusing to dispatch ${opts.channel} to seed phone '${opts.phone}'. ` +
      `Seed recipients must never reach any real communication provider.`,
    );
  }

  if (opts.email && isSeedEmail(opts.email)) {
    throw new Error(
      `DEV SEED GUARD${ctx}: refusing to dispatch ${opts.channel} to seed email '${opts.email}'. ` +
      `Seed recipients must never reach any real communication provider.`,
    );
  }
}

/**
 * Returns true if any supplied recipient is a seed identity.
 * Use this for conditional suppression instead of throwing.
 */
export function isSeedRecipient(opts: Omit<SeedGuardOpts, "channel">): boolean {
  if (opts.phone && isSeedPhone(opts.phone)) return true;
  if (opts.email && isSeedEmail(opts.email)) return true;
  return false;
}

/**
 * Checks a WhatsApp recipient (phone number) before queuing.
 * Call before inserting into whatsapp_queue or calling the Meta Cloud API.
 */
export function assertNotSeedWhatsApp(phone: string, context?: string): void {
  assertNotSeedRecipient({ phone, channel: "whatsapp", context });
}

/**
 * Checks an SMS recipient before calling Twilio or any SMS provider.
 */
export function assertNotSeedSms(phone: string, context?: string): void {
  assertNotSeedRecipient({ phone, channel: "sms", context });
}

/**
 * Checks an email recipient before calling Resend or any email provider.
 */
export function assertNotSeedEmail(email: string, context?: string): void {
  assertNotSeedRecipient({ email, channel: "email", context });
}

/**
 * Checks a push notification recipient before calling Expo or APNs/FCM.
 */
export function assertNotSeedPush(email: string, context?: string): void {
  assertNotSeedRecipient({ email, channel: "push", context });
}
