import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { predictConversionProbability } from "@/lib/ai-autonomy/predictions";
import type { SegmentKey } from "@/lib/ai-autonomy/types";
import { syncCustomerAiFeatures, syncBookingAiFeatures } from "@/lib/ai-autonomy/featureStoreSync";
import { logAiDecision } from "@/lib/ai-autonomy/decisionLog";
import {
  aiSendTimingCooldownMs,
  aiSendTimingMaxDelaySec,
  isAiAutonomyEnabled,
  isAiTimingOptimizationEnabled,
} from "@/lib/ai-autonomy/aiAutonomyEnv";

function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export type OptimizeSendTimingContext = {
  price?: number;
  segment?: SegmentKey | "unknown";
  source?: "payment_link" | "growth_email" | "payment_notify";
};

/**
 * Suggested delay before sending, using `predictConversionProbability` + (optional) paid hour pattern.
 * Returns 0 when autonomy/timing flags are off.
 */
export async function optimizeSendTiming(
  supabase: SupabaseClient,
  userId: string,
  context: OptimizeSendTimingContext,
): Promise<{ send_delay_seconds: number; explain: Record<string, unknown> }> {
  if (!isAiAutonomyEnabled() || !isAiTimingOptimizationEnabled()) {
    return { send_delay_seconds: 0, explain: { disabled: true } };
  }

  const { data: prof } = await supabase
    .from("user_profiles")
    .select("last_ai_timing_applied_at")
    .eq("id", userId)
    .maybeSingle();
  const lastIso = (prof as { last_ai_timing_applied_at?: string | null } | null)?.last_ai_timing_applied_at;
  if (lastIso) {
    const lastMs = new Date(lastIso).getTime();
    if (Number.isFinite(lastMs) && Date.now() - lastMs < aiSendTimingCooldownMs()) {
      return { send_delay_seconds: 0, explain: { cooldown_24h: true, last_ai_timing_applied_at: lastIso } };
    }
  }

  void syncCustomerAiFeatures(supabase, userId).catch(() => undefined);

  const now = new Date();
  const hourOfDay = now.getHours();
  const dayOfWeek = now.getDay();
  const price = Number.isFinite(context.price) && (context.price ?? 0) > 0 ? Number(context.price) : 120;

  const { data: paidRows } = await supabase
    .from("bookings")
    .select("payment_completed_at")
    .eq("user_id", userId)
    .not("payment_completed_at", "is", null)
    .order("payment_completed_at", { ascending: false })
    .limit(12);

  const hours: number[] = [];
  for (const r of paidRows ?? []) {
    const iso = (r as { payment_completed_at?: string }).payment_completed_at;
    if (iso) {
      const t = new Date(iso);
      if (Number.isFinite(t.getTime())) hours.push(t.getHours());
    }
  }
  let hourAlignment = 0.5;
  if (hours.length >= 2) {
    const modeMap = new Map<number, number>();
    for (const h of hours) modeMap.set(h, (modeMap.get(h) ?? 0) + 1);
    const peakH = [...modeMap.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    const d = Math.min(Math.abs(peakH - hourOfDay), 24 - Math.abs(peakH - hourOfDay));
    hourAlignment = 1 - d / 12;
  }

  const { probability: pConv, explain: predExplain } = await predictConversionProbability(
    {
      segment: (context.segment ?? "unknown") as SegmentKey,
      price,
      hourOfDay,
      dayOfWeek,
      channel: "web",
    },
    supabase,
  );

  const fromConv = Math.round(600 * (1 - pConv) * (1.15 - 0.25 * hourAlignment));
  const maxSec = aiSendTimingMaxDelaySec();
  const send_delay_seconds = Math.min(maxSec, Math.max(0, fromConv));

  void logAiDecision(supabase, {
    decision_type: "timing",
    context: { userId, source: context.source },
    prediction: { conversion_probability: pConv, predExplain, hourAlignment, paidSampleHours: hours.length },
    chosen_action: { send_delay_seconds, maxCapSec: maxSec },
    confidence: pConv,
  });

  return {
    send_delay_seconds,
    explain: {
      pConv,
      hourAlignment,
      pastPaidHours: hours,
      fromConv,
      cap: maxSec,
    },
  };
}

export type FallbackTimingFlow = "payment" | "growth" | "default";

function fallbackMaxDelaySec(flow: FallbackTimingFlow): number {
  if (flow === "payment") return 30;
  if (flow === "growth") return 120;
  return Math.min(120, aiSendTimingMaxDelaySec());
}

/**
 * Suggested wait before customer SMS (e.g. after email miss). Caps: payment 30s, growth 120s.
 */
export async function optimizeFallbackTiming(
  supabase: SupabaseClient,
  params: {
    userId?: string | null;
    bookingId?: string | null;
    priceHint?: number;
    /** Payment confirmation = fast path; growth = more flexible. */
    flow?: FallbackTimingFlow;
  },
): Promise<{ delay_seconds: number; explain: Record<string, unknown> }> {
  if (!isAiAutonomyEnabled() || !isAiTimingOptimizationEnabled()) {
    return { delay_seconds: 0, explain: { disabled: true } };
  }
  const flow = params.flow ?? "default";
  const uid = typeof params.userId === "string" && params.userId.trim() ? params.userId.trim() : null;
  if (params.bookingId) {
    void (async () => {
      const { data: b } = await supabase
        .from("bookings")
        .select("date, time, location_id, city_id, demand_level")
        .eq("id", params.bookingId)
        .maybeSingle();
      const r = b as { date?: string | null; time?: string | null; location_id?: string | null; city_id?: string | null; demand_level?: string | null } | null;
      if (r?.date && r?.time) {
        await syncBookingAiFeatures(supabase, params.bookingId!, {
          date: String(r.date),
          time: String(r.time),
          location_id: r.location_id ?? null,
          city_id: r.city_id ?? null,
          demand: r.demand_level ?? null,
        });
      }
    })().catch(() => undefined);
  }
  if (uid) {
    void syncCustomerAiFeatures(supabase, uid).catch(() => undefined);
  }

  const now = new Date();
  const { probability: pConv } = await predictConversionProbability(
    {
      segment: "unknown",
      price: params.priceHint ?? 150,
      hourOfDay: now.getHours(),
      dayOfWeek: now.getDay(),
      channel: "sms",
    },
    supabase,
  );
  const maxSec = fallbackMaxDelaySec(flow);
  const delay_seconds = Math.min(maxSec, Math.round(180 * (1 - pConv)));

  void logAiDecision(supabase, {
    decision_type: "fallback",
    context: { userId: uid, bookingId: params.bookingId, flow },
    prediction: { conversion_probability: pConv, channel: "sms" },
    chosen_action: { delay_seconds, maxCapSec: maxSec },
    confidence: pConv,
  });

  return { delay_seconds, explain: { pConv, cap: maxSec, flow } };
}

export async function applySendDelayIfNeeded(
  supabase: SupabaseClient,
  userId: string,
  source: NonNullable<OptimizeSendTimingContext["source"]>,
  segment: SegmentKey | "unknown" | undefined,
  price: number | undefined,
): Promise<void> {
  const { send_delay_seconds } = await optimizeSendTiming(supabase, userId, {
    source,
    segment: segment ?? "unknown",
    price,
  });
  if (send_delay_seconds > 0) {
    await sleepMs(Math.min(send_delay_seconds, aiSendTimingMaxDelaySec()) * 1000);
    await supabase
      .from("user_profiles")
      .update({ last_ai_timing_applied_at: new Date().toISOString() })
      .eq("id", userId);
  }
}

export async function applyFallbackDelayIfNeeded(
  supabase: SupabaseClient,
  params: {
    userId?: string | null;
    bookingId?: string | null;
    priceHint?: number;
    flow?: FallbackTimingFlow;
  },
): Promise<void> {
  const { delay_seconds } = await optimizeFallbackTiming(supabase, params);
  if (delay_seconds > 0) {
    await sleepMs(delay_seconds * 1000);
    const uid = typeof params.userId === "string" && params.userId.trim() ? params.userId.trim() : null;
    if (uid) {
      await supabase
        .from("user_profiles")
        .update({ last_ai_timing_applied_at: new Date().toISOString() })
        .eq("id", uid);
    }
  }
}
