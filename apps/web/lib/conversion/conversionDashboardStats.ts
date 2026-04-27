import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logSystemEvent } from "@/lib/logging/systemLog";

export type PaymentConversionFunnel = {
  since: string;
  /** Bookings that received a first payment-link send in the window (cohort base). */
  payment_link_first_sent: number;
  /** Of that cohort, bookings with a recorded completion (paid). */
  cohort_paid: number;
  /** Cohort conversion: paid / first-sent (0 if no sends). */
  cohort_payment_conversion_rate: number;
  /** Current open pipeline: pending payment with a link on file. */
  pending_payment_with_link: number;
};

/**
 * Payment-link funnel from `bookings` timestamps (cohort: first send in window → paid).
 */
export async function fetchPaymentConversionFunnel(
  admin: SupabaseClient,
  sinceIso: string,
): Promise<PaymentConversionFunnel> {
  const { count: payment_link_first_sent, error: e1 } = await admin
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .not("payment_link_first_sent_at", "is", null)
    .gte("payment_link_first_sent_at", sinceIso);

  const { count: cohort_paid, error: e2 } = await admin
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .not("payment_link_first_sent_at", "is", null)
    .gte("payment_link_first_sent_at", sinceIso)
    .not("payment_completed_at", "is", null);

  const { count: pending_payment_with_link, error: e3 } = await admin
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending_payment")
    .not("payment_link", "is", null);

  if (e1 || e2 || e3) {
    await logSystemEvent({
      level: "warn",
      source: "conversion_dashboard_stats",
      message: "funnel_count_partial_failure",
      context: { sinceIso, e1: e1?.message, e2: e2?.message, e3: e3?.message },
    });
  }

  const sent = Number(payment_link_first_sent ?? 0);
  const paid = Number(cohort_paid ?? 0);
  return {
    since: sinceIso,
    payment_link_first_sent: sent,
    cohort_paid: paid,
    cohort_payment_conversion_rate: sent > 0 ? Math.round((1e4 * paid) / sent) / 1e4 : 0,
    pending_payment_with_link: Number(pending_payment_with_link ?? 0),
  };
}

/** Funnel counts for bookings whose first payment-link send fell in `[startIso, endIso)`. */
export async function fetchPaymentConversionFunnelRange(
  admin: SupabaseClient,
  startIso: string,
  endIso: string,
): Promise<{
  payment_link_first_sent: number;
  cohort_paid: number;
  cohort_payment_conversion_rate: number;
}> {
  const { count: sent, error: e1 } = await admin
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .not("payment_link_first_sent_at", "is", null)
    .gte("payment_link_first_sent_at", startIso)
    .lt("payment_link_first_sent_at", endIso);

  const { count: paid, error: e2 } = await admin
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .not("payment_link_first_sent_at", "is", null)
    .gte("payment_link_first_sent_at", startIso)
    .lt("payment_link_first_sent_at", endIso)
    .not("payment_completed_at", "is", null);

  if (e1 || e2) {
    await logSystemEvent({
      level: "warn",
      source: "conversion_dashboard_stats",
      message: "funnel_range_count_failed",
      context: { startIso, endIso, e1: e1?.message, e2: e2?.message },
    });
  }

  const s = Number(sent ?? 0);
  const p = Number(paid ?? 0);
  return {
    payment_link_first_sent: s,
    cohort_paid: p,
    cohort_payment_conversion_rate: s > 0 ? Math.round((1e4 * p) / s) / 1e4 : 0,
  };
}
