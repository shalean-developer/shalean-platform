/**
 * Cleaner offer A/B: strict enum for metrics cardinality.
 * Assignment: sticky per cleaner via `assignCleanerUxVariantForCleaner` (server at offer creation).
 *
 * Env: `CLEANER_UX_EXPERIMENT=off` → always `control` (no experiment).
 *
 * Future (if cross-service consistency matters): move allocation to a Postgres RPC or persist cohort on `cleaners`.
 */

export type CleanerUxVariant = "control" | "sound_on" | "high_urgency" | "cta_v2";

export const CLEANER_UX_VARIANTS: readonly CleanerUxVariant[] = [
  "control",
  "sound_on",
  "high_urgency",
  "cta_v2",
] as const;

const VARIANT_SET = new Set<string>(CLEANER_UX_VARIANTS);

/** KPI (see `lib/metrics/counters.ts`): primary ↓ time_to_accept_ms p50/p90; secondary ↑ accept rate, ↓ offers_per_booking. */
export function sanitizeCleanerUxVariant(raw: unknown): CleanerUxVariant | "unknown" {
  if (typeof raw !== "string") return "unknown";
  const s = raw.trim().toLowerCase();
  if (!VARIANT_SET.has(s)) return "unknown";
  return s as CleanerUxVariant;
}

function fnv1a32(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Sticky variant per cleaner (deterministic hash). */
export function assignCleanerUxVariantForCleaner(cleanerId: string): CleanerUxVariant {
  if (process.env.CLEANER_UX_EXPERIMENT === "off") return "control";
  const key = cleanerId.trim().toLowerCase();
  if (!key) return "control";
  const idx = fnv1a32(key) % CLEANER_UX_VARIANTS.length;
  return CLEANER_UX_VARIANTS[idx]!;
}

export type CleanerOfferUxConfig = {
  sound: boolean;
  urgencyHighSec: number;
  urgencyMedSec: number;
  headlineKey: "default" | "alt";
  ctaAcceptKey: "quick" | "take_job";
};

export function getCleanerOfferUxConfigForVariant(v: CleanerUxVariant | "unknown"): CleanerOfferUxConfig {
  const base: CleanerOfferUxConfig = {
    sound: false,
    urgencyHighSec: 12,
    urgencyMedSec: 45,
    headlineKey: "default",
    ctaAcceptKey: "quick",
  };
  switch (v) {
    case "sound_on":
      return { ...base, sound: true };
    case "high_urgency":
      return { ...base, sound: true, urgencyHighSec: 8, urgencyMedSec: 28 };
    case "cta_v2":
      return { ...base, headlineKey: "alt", ctaAcceptKey: "take_job" };
    case "control":
    case "unknown":
    default:
      return base;
  }
}

/** Map persisted DB value to UI config (null/unknown → control UX). */
export function getCleanerOfferUxConfigFromPersisted(persisted: string | null | undefined): CleanerOfferUxConfig {
  const v = sanitizeCleanerUxVariant(persisted);
  return getCleanerOfferUxConfigForVariant(v === "unknown" ? "control" : v);
}

/** JSON body for accept POST (echoes server-assigned cell; server still trusts `dispatch_offers.ux_variant`). */
export function buildCleanerOfferAcceptBody(ux_variant: string | null | undefined): { ux_variant: CleanerUxVariant | "unknown" } {
  return { ux_variant: sanitizeCleanerUxVariant(ux_variant) };
}

export function cleanerOfferHeadline(c: CleanerOfferUxConfig): string {
  return c.headlineKey === "alt"
    ? "Tap accept to lock this job"
    : "Accept now — this slot goes fast";
}

export function cleanerOfferAcceptCta(c: CleanerOfferUxConfig): string {
  return c.ctaAcceptKey === "take_job" ? "Take this job" : "Quick accept";
}
