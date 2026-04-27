import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logAiDecision } from "@/lib/ai-autonomy/decisionLog";
import { aiLearnMinConfidence, isAiAutonomyEnabled } from "@/lib/ai-autonomy/aiAutonomyEnv";
import { mergeAssignmentWeights, updateModelWeights } from "@/lib/ai-autonomy/modelWeights";
import {
  clampProbability,
  predictCleanerAcceptanceSync,
  predictConversionProbability,
} from "@/lib/ai-autonomy/predictions";
import { syncBookingAiFeatures, syncCustomerAiFeatures } from "@/lib/ai-autonomy/featureStoreSync";
import type { SegmentKey } from "@/lib/ai-autonomy/types";

/**
 * Nudge pricing weights from a post-pay observation (target ~ conversion proxy).
 * Non-blocking: safe to `void` from webhooks.
 */
export async function learnFromPaymentSuccess(
  admin: SupabaseClient,
  params: { userId: string | null; bookingId: string; amountCents: number },
): Promise<void> {
  if (!isAiAutonomyEnabled() || !params.userId) return;
  const uid = params.userId.trim();
  if (!uid) return;
  try {
    void syncCustomerAiFeatures(admin, uid).catch(() => undefined);
    void (async () => {
      const { data: b } = await admin
        .from("bookings")
        .select("date, time, location_id, city_id, demand_level")
        .eq("id", params.bookingId)
        .maybeSingle();
      const br = b as {
        date?: string | null;
        time?: string | null;
        location_id?: string | null;
        city_id?: string | null;
        demand_level?: string | null;
      } | null;
      if (br?.date && br?.time) {
        await syncBookingAiFeatures(admin, params.bookingId, {
          date: String(br.date),
          time: String(br.time),
          location_id: br.location_id ?? null,
          city_id: br.city_id ?? null,
          demand: br.demand_level ?? null,
        });
      }
    })().catch(() => undefined);
    const { data: seg } = await admin.from("customer_segment").select("segment").eq("user_id", uid).maybeSingle();
    const segRaw = String((seg as { segment?: string } | null)?.segment ?? "unknown").toLowerCase();
    const segment: SegmentKey | "unknown" =
      segRaw === "new" || segRaw === "repeat" || segRaw === "loyal" || segRaw === "churned" ? segRaw : "unknown";
    const price = Math.max(1, Math.round((params.amountCents || 0) / 100));
    const now = new Date();
    const { probability } = await predictConversionProbability(
      {
        segment,
        price,
        hourOfDay: now.getHours(),
        dayOfWeek: now.getDay(),
        channel: "web",
      },
      admin,
    );
    const predicted = clampProbability(probability);
    const minC = aiLearnMinConfidence();
    if (predicted < minC) return;
    const actual = 1;
    const res = await updateModelWeights(admin, { decision_scope: "pricing", predicted, actual, feature: "price" });
    void logAiDecision(admin, {
      decision_type: "variant",
      context: { bookingId: params.bookingId, userId: uid, kind: "payment_learn" },
      prediction: { predicted, scope: "pricing" },
      chosen_action: { updateOk: res.ok, weights: res.weights },
      outcome: { actual },
      actual_outcome: { paid: true },
      predicted_outcome: { p_conversion: predicted },
    });
  } catch {
    /* non-fatal */
  }
}

/**
 * Nudge assignment weights from an accepted offer (actual = accepted).
 */
export async function learnFromCleanerAcceptance(
  admin: SupabaseClient,
  params: { cleanerId: string; bookingId: string },
): Promise<void> {
  if (!isAiAutonomyEnabled()) return;
  try {
    const { data: b } = await admin
      .from("bookings")
      .select("date, time")
      .eq("id", params.bookingId)
      .maybeSingle();
    const { data: c } = await admin
      .from("cleaners")
      .select("acceptance_rate, acceptance_rate_recent, marketplace_outcome_ema, total_offers, accepted_offers")
      .eq("id", params.cleanerId)
      .maybeSingle();
    if (!b || !c) return;
    const br = b as { date?: string; time?: string };
    const timeHm = String(br.time ?? "12:00").trim().slice(0, 5) || "12:00";
    const p = timeHm.indexOf(":");
    const h = p >= 0 ? Number.parseInt(timeHm.slice(0, p), 10) : 12;
    const hourOfDay = Number.isFinite(h) && h >= 0 && h <= 23 ? h : 12;
    const cr = c as {
      acceptance_rate?: number | null;
      acceptance_rate_recent?: number | null;
      marketplace_outcome_ema?: number | null;
    };
    const ar = Math.min(1, Math.max(0, Number(cr.acceptance_rate ?? 0.5)));
    const arr = Math.min(1, Math.max(0, Number(cr.acceptance_rate_recent ?? 0.5)));
    const w = await mergeAssignmentWeights(admin);
    const pred = predictCleanerAcceptanceSync(
      {
        cleaner: {
          id: params.cleanerId,
          distanceKm: 0,
          acceptanceRecent: arr,
          acceptanceLifetime: ar,
          recentDeclines: 0,
          fatigueOffersLastHour: 0,
          outcomeEma: cr.marketplace_outcome_ema,
        },
        booking: { bookingId: params.bookingId, dateYmd: String(br.date ?? ""), timeHm, hourOfDay },
      },
      w,
    );
    if (pred.probability < aiLearnMinConfidence()) return;
    const res = await updateModelWeights(admin, {
      decision_scope: "assignment",
      predicted: pred.probability,
      actual: 1,
    });
    void logAiDecision(admin, {
      decision_type: "variant",
      context: { bookingId: params.bookingId, cleanerId: params.cleanerId, kind: "acceptance_learn" },
      prediction: { p_accept: pred.probability, explain: pred.explain },
      chosen_action: { updateOk: res.ok },
      outcome: { accepted: true },
      actual_outcome: { accepted: true },
      predicted_outcome: { p_accept: pred.probability },
    });
  } catch {
    /* non-fatal */
  }
}

/**
 * Nudge growth priors on attributed conversion (last-touch growth send).
 */
export async function learnFromGrowthConversion(
  admin: SupabaseClient,
  params: { userId: string; actionType: string },
): Promise<void> {
  if (!isAiAutonomyEnabled()) return;
  try {
    const feat = params.actionType.includes("discount")
      ? "discount"
      : params.actionType.includes("upsell")
        ? "upsell"
        : "nothing";
    const { data: seg } = await admin
      .from("customer_segment")
      .select("segment")
      .eq("user_id", params.userId)
      .maybeSingle();
    const segRaw = String((seg as { segment?: string } | null)?.segment ?? "unknown").toLowerCase();
    const segment: SegmentKey | "unknown" =
      segRaw === "new" || segRaw === "repeat" || segRaw === "loyal" || segRaw === "churned" ? segRaw : "unknown";
    const now = new Date();
    const { probability } = await predictConversionProbability(
      {
        segment,
        price: 120,
        hourOfDay: now.getHours(),
        dayOfWeek: now.getDay(),
        channel: "email",
      },
      admin,
    );
    const predicted = clampProbability(probability);
    if (predicted < aiLearnMinConfidence()) return;
    const res = await updateModelWeights(admin, {
      decision_scope: "growth",
      predicted,
      actual: 1,
      feature: feat,
    });
    void logAiDecision(admin, {
      decision_type: "variant",
      context: { userId: params.userId, actionType: params.actionType, kind: "growth_learn" },
      prediction: { p_conversion: predicted, prior_feature: feat },
      chosen_action: { updateOk: res.ok, feature: feat },
      outcome: { converted: true },
    });
  } catch {
    /* non-fatal */
  }
}
