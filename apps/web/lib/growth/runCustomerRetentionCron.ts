import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { decideGrowthActionWithAi } from "@/lib/growth/decideGrowthActionWithAi";
import { calculateCustomerLTV } from "@/lib/growth/customerLTV";
import { evaluateCustomerRetentionState } from "@/lib/growth/customerRetention";
import { segmentCustomer } from "@/lib/growth/customerSegment";
import { sendGrowthRetentionReminderEmail, sendGrowthWinBackEmail } from "@/lib/growth/growthEmails";
import { recordGrowthActionOutcomeSent } from "@/lib/growth/growthActionOutcomes";
import {
  DUMMY_BOOKING_FOR_PRIOR,
  discountBudgetOk,
  hasGrowthCooldown,
  insertGrowthTouch,
} from "@/lib/growth/growthTouchCooldown";
import { loadCustomerGrowthContext, persistCustomerSegmentRow } from "@/lib/growth/loadCustomerGrowthContext";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { decidePaymentLinkAction } from "@/lib/pay/paymentDecisionEngine";
import { fetchRecentPaymentLinkChannelStats } from "@/lib/pay/paymentDecisionDispatch";
import { priorPaymentConversionBucketForCustomer } from "@/lib/pay/priorPaymentConversionBucket";

const MAX_USERS = 120;

export type RetentionCronSummary = {
  scanned: number;
  emailsSent: number;
  skippedCooldown: number;
  skippedInactiveCity: number;
  skippedNoContact: number;
  skippedChannel: number;
};

/**
 * Retention + win-back automation. Respects growth touch cooldowns (separate from payment-link sends).
 * Uses the payment decision engine only for channel ordering / risk context — does not mutate booking rows.
 */
export async function runCustomerRetentionCronBatch(admin: SupabaseClient): Promise<RetentionCronSummary> {
  const out: RetentionCronSummary = {
    scanned: 0,
    emailsSent: 0,
    skippedCooldown: 0,
    skippedInactiveCity: 0,
    skippedNoContact: 0,
    skippedChannel: 0,
  };

  const { data: profiles, error } = await admin
    .from("user_profiles")
    .select("id")
    .gt("booking_count", 0)
    .order("updated_at", { ascending: false })
    .limit(MAX_USERS);

  if (error || !profiles?.length) return out;

  const channelStats = await fetchRecentPaymentLinkChannelStats(admin);
  const priorCache = new Map();

  for (const row of profiles) {
    const userId = typeof row.id === "string" ? row.id : "";
    if (!userId) continue;
    out.scanned++;

    const ctx = await loadCustomerGrowthContext(admin, userId);
    if (!ctx) continue;

    await persistCustomerSegmentRow(admin, ctx);

    if (ctx.cityActive === false) {
      out.skippedInactiveCity++;
      continue;
    }

    const retention = evaluateCustomerRetentionState({ lastBookingActivityAt: ctx.lastBookingActivityAt });
    if (retention === "active") continue;

    const touchType = retention === "churned" ? "win_back" : "retention_reminder";
    if (await hasGrowthCooldown(admin, userId, touchType)) {
      out.skippedCooldown++;
      continue;
    }

    const ltv = calculateCustomerLTV({
      totalSpentCents: ctx.totalSpentCents,
      bookingCount: ctx.bookingCount,
      hasActiveSubscription: ctx.hasActiveSubscription,
    });
    const segment = segmentCustomer({ bookingCount: ctx.bookingCount, retentionState: retention });
    const budgetOk = await discountBudgetOk(admin, userId);
    const decision = await decideGrowthActionWithAi(admin, { segment, ltv, retention, discountBudgetOk: budgetOk }, { userId });

    const priorBucket = await priorPaymentConversionBucketForCustomer(
      admin,
      {
        emailRaw: ctx.email,
        phoneRaw: ctx.phone,
        excludeBookingId: DUMMY_BOOKING_FOR_PRIOR,
      },
      priorCache,
    );

    const channelDecision = decidePaymentLinkAction({
      intent: "reminder",
      notificationMode: "chain_plus_email",
      hasPhone: Boolean(ctx.phone?.trim()),
      hasEmail: Boolean(ctx.email?.trim()),
      priorPaymentConversionBucket: priorBucket,
      channelStats,
      booking: {
        payment_link_send_count: 0,
        payment_conversion_bucket: null,
        payment_link_first_sent_at: null,
        payment_link_delivery: {},
        payment_last_touch_channel: null,
      },
      nowMs: Date.now(),
    });

    await logSystemEvent({
      level: "info",
      source: "growth_engine",
      message: "retention_eval",
      context: {
        userId,
        retention,
        segment,
        ltv_score: ltv.ltv_score,
        growth_action: decision.action,
        payment_engine_channels: channelDecision.channels,
        send_now: channelDecision.send_now,
      },
    });

    if (decision.action === "do_nothing") {
      out.skippedChannel++;
      continue;
    }

    if (!channelDecision.send_now) {
      out.skippedChannel++;
      continue;
    }

    const preferEmail =
      decision.channel === "email" ||
      !ctx.phone?.trim() ||
      !channelDecision.channels.some((c) => c === "whatsapp" || c === "sms");

    if (!ctx.email?.trim()) {
      out.skippedNoContact++;
      continue;
    }

    if (!preferEmail) {
      /** WhatsApp growth templates are not wired yet; avoid silent failures and do not spam SMS here. */
      out.skippedChannel++;
      continue;
    }

    const ok =
      retention === "churned"
        ? await sendGrowthWinBackEmail({ to: ctx.email.trim(), userId })
        : await sendGrowthRetentionReminderEmail({ to: ctx.email.trim(), userId });

    if (ok) {
      out.emailsSent++;
      await insertGrowthTouch(admin, {
        user_id: userId,
        touch_type: touchType,
        channel: "email",
      });
      await recordGrowthActionOutcomeSent({
        admin,
        userId,
        actionType: touchType,
        channel: "email",
      });
      await admin.from("user_events").insert({
        user_id: userId,
        event_type: retention === "churned" ? "growth_win_back" : "growth_retention_reminder",
        booking_id: null,
        payload: { segment, ltv: ltv.ltv_score, action: decision.action },
      });
    }
  }

  return out;
}
