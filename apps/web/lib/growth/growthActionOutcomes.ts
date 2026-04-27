import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { reportOperationalIssue } from "@/lib/logging/systemLog";

export type GrowthOutcomeChannel = "email" | "whatsapp" | "sms";

export function growthAttributionWindowDays(): number {
  const raw = Number(process.env.GROWTH_OUTCOME_ATTRIBUTION_DAYS ?? "90");
  return Number.isFinite(raw) ? Math.min(365, Math.max(7, Math.round(raw))) : 90;
}

/**
 * Record a growth outbound (decision → action) for later conversion attribution.
 */
export async function recordGrowthActionOutcomeSent(params: {
  admin: SupabaseClient;
  userId: string;
  actionType: string;
  channel: GrowthOutcomeChannel;
  sentAtIso?: string;
}): Promise<string | null> {
  const sentAt = params.sentAtIso ?? new Date().toISOString();
  const { data, error } = await params.admin
    .from("growth_action_outcomes")
    .insert({
      user_id: params.userId,
      action_type: params.actionType,
      channel: params.channel,
      sent_at: sentAt,
      converted: false,
      revenue_generated: 0,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    await reportOperationalIssue("warn", "growthActionOutcomes/record", error.message, {
      userId: params.userId,
      actionType: params.actionType,
    });
    return null;
  }
  return data && typeof data === "object" && "id" in data ? String((data as { id: string }).id) : null;
}

/**
 * Last-touch attribution: the most recent unconverted growth send at or before payment
 * within the attribution window receives credit for this booking (idempotent per booking).
 */
export async function attributePaidBookingToGrowthOutcomes(params: {
  admin: SupabaseClient;
  userId: string | null | undefined;
  bookingId: string;
  amountCents: number;
  paidAtIso: string;
}): Promise<void> {
  const uid = typeof params.userId === "string" && params.userId.trim() ? params.userId.trim() : "";
  if (!uid) return;

  const { data: already } = await params.admin
    .from("growth_action_outcomes")
    .select("id")
    .eq("booking_id", params.bookingId)
    .maybeSingle();
  if (already?.id) return;

  const paidMs = Date.parse(params.paidAtIso);
  if (!Number.isFinite(paidMs)) return;

  const windowMs = growthAttributionWindowDays() * 24 * 60 * 60 * 1000;
  const windowStartIso = new Date(paidMs - windowMs).toISOString();

  const { data: candidate, error } = await params.admin
    .from("growth_action_outcomes")
    .select("id")
    .eq("user_id", uid)
    .eq("converted", false)
    .lte("sent_at", params.paidAtIso)
    .gte("sent_at", windowStartIso)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !candidate?.id) return;

  const revenue = Math.max(0, Math.round(Number(params.amountCents) || 0));
  const { error: upErr } = await params.admin
    .from("growth_action_outcomes")
    .update({
      converted: true,
      conversion_time: params.paidAtIso,
      revenue_generated: revenue,
      booking_id: params.bookingId,
    })
    .eq("id", String((candidate as { id: string }).id))
    .eq("converted", false);

  if (upErr) {
    await reportOperationalIssue("warn", "growthActionOutcomes/attribute", upErr.message, {
      bookingId: params.bookingId,
      outcomeId: (candidate as { id: string }).id,
    });
  }
}

export type GrowthEffectivenessRow = {
  action_type: string;
  channel: string;
  sends: number;
  conversions: number;
  conversion_rate: number;
  total_revenue_cents: number;
  avg_revenue_per_conversion_cents: number | null;
};

export type LearnGrowthEffectivenessParams = {
  /** ISO lower bound on sent_at (inclusive). Default: now - 30d. */
  sinceIso?: string;
  /** Optional filter. */
  actionType?: string;
  channel?: GrowthOutcomeChannel;
};

/**
 * Aggregates growth sends vs conversions for campaign review and future auto-optimization.
 */
export async function learnGrowthEffectiveness(
  admin: SupabaseClient,
  params?: LearnGrowthEffectivenessParams,
): Promise<GrowthEffectivenessRow[]> {
  const since =
    params?.sinceIso ??
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  let q = admin
    .from("growth_action_outcomes")
    .select("action_type, channel, converted, revenue_generated")
    .gte("sent_at", since);

  if (params?.actionType?.trim()) {
    q = q.eq("action_type", params.actionType.trim());
  }
  if (params?.channel) {
    q = q.eq("channel", params.channel);
  }

  const { data, error } = await q;
  if (error || !data?.length) {
    if (error) {
      await reportOperationalIssue("warn", "growthActionOutcomes/learn", error.message, { since });
    }
    return [];
  }

  type Row = { action_type: string; channel: string; converted: boolean; revenue_generated: number | null };
  const byKey = new Map<string, { sends: number; conversions: number; totalRevenue: number }>();

  for (const raw of data as Row[]) {
    const action_type = String(raw.action_type ?? "unknown");
    const channel = String(raw.channel ?? "unknown");
    const key = `${action_type}\t${channel}`;
    const cur = byKey.get(key) ?? { sends: 0, conversions: 0, totalRevenue: 0 };
    cur.sends += 1;
    if (raw.converted) {
      cur.conversions += 1;
      cur.totalRevenue += Math.max(0, Math.round(Number(raw.revenue_generated ?? 0)));
    }
    byKey.set(key, cur);
  }

  const out: GrowthEffectivenessRow[] = [];
  for (const [key, v] of byKey) {
    const [action_type, channel] = key.split("\t");
    const conversion_rate = v.sends > 0 ? v.conversions / v.sends : 0;
    const avg_revenue_per_conversion_cents =
      v.conversions > 0 ? Math.round(v.totalRevenue / v.conversions) : null;
    out.push({
      action_type,
      channel,
      sends: v.sends,
      conversions: v.conversions,
      conversion_rate: Number(conversion_rate.toFixed(4)),
      total_revenue_cents: v.totalRevenue,
      avg_revenue_per_conversion_cents,
    });
  }

  out.sort((a, b) => b.total_revenue_cents - a.total_revenue_cents || b.conversions - a.conversions);
  return out;
}
