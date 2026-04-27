import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { decideGrowthActionWithAi } from "@/lib/growth/decideGrowthActionWithAi";
import { calculateCustomerLTV } from "@/lib/growth/customerLTV";
import { evaluateCustomerRetentionState } from "@/lib/growth/customerRetention";
import { segmentCustomer } from "@/lib/growth/customerSegment";
import {
  sendGrowthRetentionReminderEmail,
  sendGrowthTouchSms,
  sendGrowthWinBackEmail,
} from "@/lib/growth/growthEmails";
import { recordGrowthActionOutcomeSent } from "@/lib/growth/growthActionOutcomes";
import { discountBudgetOk, hasGrowthCooldown, insertGrowthTouch } from "@/lib/growth/growthTouchCooldown";
import { loadCustomerGrowthContext, persistCustomerSegmentRow } from "@/lib/growth/loadCustomerGrowthContext";
import { applySendDelayIfNeeded } from "@/lib/ai-autonomy/optimizeTiming";
import { logSystemEvent } from "@/lib/logging/systemLog";

const MAX_USERS = 120;

export type RetentionCronSummary = {
  scanned: number;
  emailsSent: number;
  smsFallbackSent: number;
  skippedCooldown: number;
  skippedInactiveCity: number;
  skippedNoContact: number;
  skippedChannel: number;
};

/**
 * Retention + win-back automation. Respects growth touch cooldowns (separate from payment-link sends).
 * Policy: **email first**, SMS only if email is missing or the email send failed (no WhatsApp).
 */
export async function runCustomerRetentionCronBatch(admin: SupabaseClient): Promise<RetentionCronSummary> {
  const out: RetentionCronSummary = {
    scanned: 0,
    emailsSent: 0,
    smsFallbackSent: 0,
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
    const hasEmail = Boolean(ctx.email?.trim());
    const hasPhone = Boolean(ctx.phone?.trim());

    const decision = await decideGrowthActionWithAi(
      admin,
      { segment, ltv, retention, discountBudgetOk: budgetOk, hasEmail, hasPhone },
      { userId },
    );

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
        channel: "email",
        fallback: "sms",
        growth_channel: decision.channel,
        growth_policy: "email_first_sms_fallback",
      },
    });

    if (decision.action === "do_nothing") {
      out.skippedChannel++;
      continue;
    }

    if (!hasEmail && !hasPhone) {
      out.skippedNoContact++;
      continue;
    }

    const smsVariant = retention === "churned" ? "win_back" : "retention_reminder";

    let deliveredEmail = false;
    let deliveredSms = false;

    if (hasEmail) {
      {
        const segKey = String(segment) as "new" | "repeat" | "loyal" | "churned" | "unknown";
        await applySendDelayIfNeeded(
          admin,
          userId,
          "growth_email",
          segKey === "new" || segKey === "repeat" || segKey === "loyal" || segKey === "churned" ? segKey : "unknown",
          undefined,
        );
      }
      deliveredEmail =
        retention === "churned"
          ? await sendGrowthWinBackEmail({ to: ctx.email!.trim(), userId, supabaseAdmin: admin })
          : await sendGrowthRetentionReminderEmail({ to: ctx.email!.trim(), userId, supabaseAdmin: admin });

      if (!deliveredEmail && hasPhone) {
        deliveredSms = await sendGrowthTouchSms({
          phone: ctx.phone!.trim(),
          userId,
          variant: smsVariant,
          smsRole: "fallback",
        });
      }
    } else if (hasPhone && decision.channel === "sms") {
      deliveredSms = await sendGrowthTouchSms({
        phone: ctx.phone!.trim(),
        userId,
        variant: smsVariant,
        smsRole: "primary",
      });
    } else {
      out.skippedNoContact++;
      continue;
    }

    if (!deliveredEmail && !deliveredSms) {
      out.skippedChannel++;
      continue;
    }

    if (deliveredEmail) out.emailsSent++;
    if (deliveredSms) out.smsFallbackSent++;

    const touchChannel: "email" | "sms" = deliveredEmail ? "email" : "sms";
    await insertGrowthTouch(admin, {
      user_id: userId,
      touch_type: touchType,
      channel: touchChannel,
    });
    await recordGrowthActionOutcomeSent({
      admin,
      userId,
      actionType: touchType,
      channel: touchChannel,
    });
    await admin.from("user_events").insert({
      user_id: userId,
      event_type: retention === "churned" ? "growth_win_back" : "growth_retention_reminder",
      booking_id: null,
      payload: {
        segment,
        ltv: ltv.ltv_score,
        action: decision.action,
        channel: touchChannel,
        email_attempted: hasEmail,
        sms_used: deliveredSms,
      },
    });
  }

  return out;
}
