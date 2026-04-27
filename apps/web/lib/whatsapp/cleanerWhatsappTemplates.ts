import "server-only";

import { logSystemEvent } from "@/lib/logging/systemLog";

/**
 * Phase 8B: stable keys for product + `notification_logs` / analytics.
 * Meta Business Manager template **names** may differ; resolve via {@link resolveMetaTemplateName}.
 */
export const CLEANER_WA_TEMPLATE = {
  booking_offer: "booking_offer",
  booking_assigned: "booking_assigned",
  reminder: "reminder",
  escalation: "escalation",
  offer_ack: "offer_ack",
  cleaner_welcome: "cleaner_welcome",
  cleaner_approved: "cleaner_approved",
} as const;

export type CleanerWhatsappProductKey = keyof typeof CLEANER_WA_TEMPLATE;

export const CLEANER_WHATSAPP_TEMPLATE_SPEC_VERSION = "8b-2";

/** Single source for Meta `name` + DB `templates.key` alignment. */
type ResolverKey = keyof typeof CLEANER_WA_TEMPLATE;

export function resolveMetaTemplateName(key: ResolverKey): string {
  const e =
    {
      booking_offer: process.env.WHATSAPP_TEMPLATE_BOOKING_OFFER?.trim() || process.env.WHATSAPP_CLEANER_JOB_OFFER_TEMPLATE?.trim(),
      booking_assigned:
        process.env.WHATSAPP_TEMPLATE_BOOKING_ASSIGNED?.trim() || process.env.WHATSAPP_CLEANER_JOB_ASSIGNED_TEMPLATE?.trim(),
      reminder: process.env.WHATSAPP_TEMPLATE_REMINDER?.trim(),
      escalation: process.env.WHATSAPP_TEMPLATE_ESCALATION?.trim(),
      offer_ack: process.env.WHATSAPP_TEMPLATE_OFFER_ACK?.trim(),
      cleaner_welcome: process.env.WHATSAPP_TEMPLATE_CLEANER_WELCOME?.trim(),
      cleaner_approved: process.env.WHATSAPP_TEMPLATE_CLEANER_APPROVED?.trim(),
    }[key] ?? "";
  if (e) return e;
  return CLEANER_WA_TEMPLATE[key];
}

function clip(s: string, n: number): string {
  return String(s ?? "")
    .trim()
    .slice(0, n);
}

/**
 * R… label for offer template {{5}}. Uses `total_paid_zar` or cents.
 */
export function formatCleanerPayZarLabel(booking: { total_paid_zar?: unknown; amount_paid_cents?: unknown }): string {
  const z = Number(booking.total_paid_zar);
  if (Number.isFinite(z) && z > 0) {
    return clip(`R${Math.round(z)}`, 24);
  }
  const c = Number(booking.amount_paid_cents);
  if (Number.isFinite(c) && c > 0) {
    return clip(`R${Math.round(c / 100)}`, 24);
  }
  return "TBC";
}

/**
 * `booking_offer` body — exactly **five** parameters, fixed order for Meta: {{1}}…{{5}}.
 * {{1}} cleaner_name, {{2}} location, {{3}} date, {{4}} time, {{5}} pay
 *
 * The approved Meta template **body** (static text outside variables) must also tell cleaners how to respond, e.g.:
 * `Reply:\n1 Accept\n2 Decline` — this cannot be injected here without breaking the 5-slot contract.
 */
export function buildBookingOfferBodyParameters(params: {
  cleanerName: string;
  location: string;
  date: string;
  time: string;
  pay: string;
}): string[] {
  return [
    clip(params.cleanerName, 60) || "Cleaner",
    clip(params.location, 80) || "TBC",
    clip(params.date, 40),
    clip(params.time, 40),
    clip(params.pay, 24),
  ];
}

/**
 * @deprecatedLength — combined hint for copy audits (Meta body ≈ 1024 cap per var; keep short).
 */
export function assertTemplateSegmentBudget(parts: string[], label: string): void {
  const joined = parts.join("|");
  if (joined.length > 1800) {
    void logSystemEvent({
      level: "warn",
      source: "whatsapp_template_size",
      message: "Long template segment bundle — check Meta + mobile UX",
      context: { label, len: joined.length },
    });
  }
}
