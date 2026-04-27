import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { decideGrowthActionWithAi } from "@/lib/growth/decideGrowthActionWithAi";
import { calculateCustomerLTV } from "@/lib/growth/customerLTV";
import { evaluateCustomerRetentionState } from "@/lib/growth/customerRetention";
import { segmentCustomer } from "@/lib/growth/customerSegment";
import { discountBudgetOk } from "@/lib/growth/growthTouchCooldown";
import { loadCustomerGrowthContext } from "@/lib/growth/loadCustomerGrowthContext";
import { logSystemEvent } from "@/lib/logging/systemLog";

/**
 * Non-blocking hint for LTV / growth routing (no outbound send — avoids stacking with booking confirmation).
 */
export async function logPostBookingGrowthDecision(admin: SupabaseClient, userId: string): Promise<void> {
  const ctx = await loadCustomerGrowthContext(admin, userId);
  if (!ctx) return;
  const retention = evaluateCustomerRetentionState({ lastBookingActivityAt: ctx.lastBookingActivityAt });
  const ltv = calculateCustomerLTV({
    totalSpentCents: ctx.totalSpentCents,
    bookingCount: ctx.bookingCount,
    hasActiveSubscription: ctx.hasActiveSubscription,
  });
  const segment = segmentCustomer({ bookingCount: ctx.bookingCount, retentionState: retention });
  const budgetOk = await discountBudgetOk(admin, userId);
  const d = await decideGrowthActionWithAi(admin, { segment, ltv, retention, discountBudgetOk: budgetOk }, { userId });
  await logSystemEvent({
    level: "info",
    source: "growth_engine",
    message: "post_booking_decision",
    context: {
      userId,
      segment,
      retention,
      ltv: ltv.ltv_score,
      action: d.action,
      channel: d.channel,
    },
  });
}
