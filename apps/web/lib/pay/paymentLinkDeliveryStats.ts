import type { PaymentConversionBucket } from "@/lib/booking/paymentConversionBucket";

export type PaymentLinkChannelStats = {
  /** Bookings with a non-empty `payment_link_delivery` object. */
  sample_size: number;
  /** Among rows where WhatsApp was attempted (`sent` or `failed`), share that succeeded. */
  whatsapp_success_rate: number | null;
  /** Among rows where WhatsApp failed, share where SMS still delivered. */
  sms_fallback_rate: number | null;
  /** Share of sampled rows where only email succeeded (no WA/SMS success). */
  email_only_rate: number | null;
};

type ChannelOutcome = "sent" | "failed" | "skipped" | "" | undefined;

function norm(v: unknown): ChannelOutcome {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (s === "sent" || s === "failed" || s === "skipped") return s;
  return "";
}

/**
 * Aggregates latest per-booking channel flags from `payment_link_delivery` (last persist wins per channel).
 */
export function aggregatePaymentLinkDeliveryStats(
  rows: ReadonlyArray<{ payment_link_delivery?: unknown }>,
): PaymentLinkChannelStats {
  let sample = 0;
  let waAttempted = 0;
  let waSent = 0;
  let waFailed = 0;
  let smsAfterWaFail = 0;
  let emailOnly = 0;

  for (const r of rows) {
    const raw = r.payment_link_delivery;
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) continue;
    const d = raw as Record<string, unknown>;
    const w = norm(d.whatsapp);
    const s = norm(d.sms);
    const e = norm(d.email);
    if (!w && !s && !e) continue;
    sample++;

    if (w === "sent" || w === "failed") {
      waAttempted++;
      if (w === "sent") waSent++;
    }
    if (w === "failed") {
      waFailed++;
      if (s === "sent") smsAfterWaFail++;
    }
    if (e === "sent" && w !== "sent" && s !== "sent") {
      emailOnly++;
    }
  }

  return {
    sample_size: sample,
    whatsapp_success_rate: waAttempted > 0 ? Math.round((1e4 * waSent) / waAttempted) / 1e4 : null,
    sms_fallback_rate: waFailed > 0 ? Math.round((1e4 * smsAfterWaFail) / waFailed) / 1e4 : null,
    email_only_rate: sample > 0 ? Math.round((1e4 * emailOnly) / sample) / 1e4 : null,
  };
}

export type ReminderSchedule = {
  /** If true, do not send expiry nudges (customer historically pays immediately). */
  skipReminders: boolean;
  /** Inclusive minutes-left window for the “~1h style” reminder. */
  window1hMin: number;
  window1hMax: number;
  /** Inclusive minutes-left window for the “~15m style” reminder. */
  window15mMin: number;
  window15mMax: number;
};

const DEFAULT_SCHEDULE: ReminderSchedule = {
  skipReminders: false,
  window1hMin: 50,
  window1hMax: 70,
  window15mMin: 8,
  window15mMax: 22,
};

const SLOW_SCHEDULE: ReminderSchedule = {
  skipReminders: false,
  window1hMin: 98,
  window1hMax: 118,
  window15mMin: 32,
  window15mMax: 48,
};

/**
 * Adaptive reminder windows from last known payment conversion bucket for this customer (email).
 */
export function reminderScheduleForPriorBucket(bucket: PaymentConversionBucket | null | undefined): ReminderSchedule {
  if (bucket === "instant") {
    return { ...DEFAULT_SCHEDULE, skipReminders: true };
  }
  if (bucket === "slow" || bucket === "medium") {
    return SLOW_SCHEDULE;
  }
  return DEFAULT_SCHEDULE;
}

/**
 * When predictive risk is high, shift reminder windows earlier (more minutes left until expiry)
 * so SMS / second channel is attempted sooner. No-op when reminders are skipped (instant bucket).
 */
export function escalateReminderSchedule(
  base: ReminderSchedule,
  risk: "low" | "medium" | "high",
): ReminderSchedule {
  if (risk !== "high" || base.skipReminders) return base;
  return {
    ...base,
    window1hMin: Math.min(base.window1hMin + 18, 125),
    window1hMax: Math.min(base.window1hMax + 24, 130),
    window15mMin: Math.min(base.window15mMin + 12, 38),
    window15mMax: Math.min(base.window15mMax + 16, 52),
  };
}
