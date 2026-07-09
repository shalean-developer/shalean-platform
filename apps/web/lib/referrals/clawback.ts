import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import { reportOperationalIssue } from "@/lib/logging/systemLog";
import { reverseCleaningCredit } from "@/lib/referrals/credits";
import { countQualifyingBookingsForCustomer } from "@/lib/referrals/eligibility";
import { getReferralProgramSettingsCached } from "@/lib/referrals/settings";

type ClawbackBookingRow = {
  id: string;
  user_id?: string | null;
  customer_email?: string | null;
  status?: string | null;
  refunded_at?: string | null;
  refund_status?: string | null;
};

/**
 * When a referee booking is cancelled or refunded, reverse referrer reward if this
 * was the only qualifying booking and claw back issued cleaning credit.
 */
export async function processReferralClawbackForBooking(params: {
  admin: SupabaseClient;
  booking: ClawbackBookingRow;
  reason: "cancelled" | "refunded";
}): Promise<{ clawedBack: boolean; referralId?: string }> {
  const { admin, booking, reason } = params;
  const bookingId = booking.id;
  const email = normalizeEmail(booking.customer_email ?? "");
  const userId = booking.user_id ?? null;
  if (!email && !userId) return { clawedBack: false };

  const settings = await getReferralProgramSettingsCached(admin);
  const mode = settings.rewardOn === "first_completed_booking" ? "completed" : "paid";
  const qualifyingCount = await countQualifyingBookingsForCustomer(admin, userId, email, mode);

  // Only claw back if no other qualifying bookings remain
  if (qualifyingCount > 0) return { clawedBack: false };

  const { data: rewarded } = await admin
    .from("referrals")
    .select("id, referrer_id, reward_amount, status")
    .eq("referrer_type", "customer")
    .eq("referred_email_or_phone", email)
    .eq("status", "rewarded")
    .order("rewarded_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!rewarded?.id) return { clawedBack: false };

  const referralId = String(rewarded.id);
  const referrerId = String(rewarded.referrer_id);
  const rewardAmount = Math.max(0, Math.round(Number(rewarded.reward_amount ?? 0)));

  const { data: earnTx } = await admin
    .from("cleaning_credit_transactions")
    .select("id, amount_zar")
    .eq("referral_id", referralId)
    .eq("type", "earn")
    .maybeSingle();

  if (earnTx?.id && rewardAmount > 0) {
    const reverseResult = await reverseCleaningCredit({
      admin,
      userId: referrerId,
      amountZar: rewardAmount,
      referralId,
      note: `Clawback: referee booking ${reason} (${bookingId})`,
      createdBy: "system_clawback",
    });
    if (!reverseResult.ok) {
      await reportOperationalIssue("warn", "referrals/clawback", reverseResult.error, {
        bookingId,
        referralId,
        reason,
      });
    }
  }

  const now = new Date().toISOString();
  await admin
    .from("referrals")
    .update({
      status: "cancelled",
      admin_notes: `Auto-clawback: referee booking ${reason} on ${now.slice(0, 10)} (booking ${bookingId})`,
    })
    .eq("id", referralId)
    .eq("status", "rewarded");

  await reportOperationalIssue("warn", "referrals/clawback", "Referral reward clawed back", {
    bookingId,
    referralId,
    referrerId,
    reason,
    rewardAmount,
  });

  return { clawedBack: true, referralId };
}

/** Run clawback when admin marks booking cancelled or refund fields are set. */
export async function maybeProcessReferralClawbackOnBookingChange(params: {
  admin: SupabaseClient;
  bookingId: string;
  previousStatus?: string | null;
  newStatus?: string | null;
  refundedAt?: string | null;
  refundStatus?: string | null;
}): Promise<void> {
  const { admin, bookingId } = params;
  const newStatus = String(params.newStatus ?? "").toLowerCase();
  const hasRefund =
    (typeof params.refundedAt === "string" && params.refundedAt.trim().length > 0) ||
    (typeof params.refundStatus === "string" &&
      ["refunded", "full", "partial", "chargeback", "reversed"].includes(
        params.refundStatus.trim().toLowerCase(),
      ));

  if (newStatus !== "cancelled" && !hasRefund) return;

  const { data: booking } = await admin
    .from("bookings")
    .select("id, user_id, customer_email, status, refunded_at, refund_status")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking?.id) return;

  const reason = hasRefund ? "refunded" : "cancelled";
  await processReferralClawbackForBooking({
    admin,
    booking: booking as ClawbackBookingRow,
    reason,
  });
}
