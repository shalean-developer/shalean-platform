import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { CONVERSION_EXPERIMENT_KEYS } from "@/lib/conversion/conversionExperimentAnalytics";
import { logSystemEvent } from "@/lib/logging/systemLog";

const ATTRIBUTION_SKEW_MS = 5000;

/**
 * Records one row per active experiment exposure when a booking pays (idempotent per booking + key).
 * Skips attribution when exposure is missing, lacks `created_at`, or appears after payment (clock-safe window).
 */
export async function recordConversionExperimentResultsOnPayment(
  admin: SupabaseClient,
  params: {
    bookingId: string;
    userId: string | null | undefined;
    revenueCents: number;
    paidAtIso: string;
  },
): Promise<void> {
  const bookingId = String(params.bookingId ?? "").trim();
  if (!bookingId) return;
  const uid =
    typeof params.userId === "string" && params.userId.trim() ? params.userId.trim() : (null as string | null);
  const revenue = Math.max(0, Math.round(Number(params.revenueCents) || 0));
  const payMs = Date.parse(params.paidAtIso);
  if (!Number.isFinite(payMs)) return;

  for (const experiment_key of CONVERSION_EXPERIMENT_KEYS) {
    const { data: exp } = await admin
      .from("ai_experiment_exposures")
      .select("variant, created_at")
      .eq("subject_id", bookingId)
      .eq("experiment_key", experiment_key)
      .maybeSingle();

    if (!exp || typeof exp !== "object" || !("variant" in exp)) continue;
    const variant = String((exp as { variant?: string }).variant ?? "control");
    const exposureCreatedAt =
      "created_at" in exp && typeof (exp as { created_at?: string }).created_at === "string"
        ? String((exp as { created_at: string }).created_at)
        : "";
    const expMs = Date.parse(exposureCreatedAt);
    if (!Number.isFinite(expMs)) {
      await logSystemEvent({
        level: "info",
        source: "conversion_experiment_results",
        message: "skip_attribution_missing_exposure_timestamp",
        context: { bookingId, experiment_key },
      });
      continue;
    }
    if (expMs > payMs + ATTRIBUTION_SKEW_MS) {
      await logSystemEvent({
        level: "info",
        source: "conversion_experiment_results",
        message: "skip_attribution_exposure_after_payment",
        context: { bookingId, experiment_key, exposureCreatedAt, paidAtIso: params.paidAtIso },
      });
      continue;
    }

    const { error } = await admin.from("conversion_experiment_results").insert({
      experiment_key,
      variant,
      subject_id: bookingId,
      user_id: uid,
      booking_id: bookingId,
      converted: true,
      revenue_cents: revenue,
      metadata: {
        source: "payment_success",
        attribution_valid: true,
        exposure_created_at: exposureCreatedAt,
        paid_at: params.paidAtIso,
      },
    });

    if (error?.code === "23505") continue;
    if (error) {
      await logSystemEvent({
        level: "warn",
        source: "conversion_experiment_results",
        message: "insert_conversion_result_failed",
        context: { bookingId, experiment_key, error: error.message },
      });
    }
  }
}
