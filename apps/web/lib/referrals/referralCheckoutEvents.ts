import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { reportOperationalIssue } from "@/lib/logging/systemLog";

/**
 * Allowed `referral_events.event_type` values — keep aligned with
 * `referral_events_event_type_check` in Supabase migrations.
 */
export type ReferralAnalyticsEventType =
  | "checkout_discount_applied"
  | "cleaner_checkout_attribution"
  | "referral_conversion_completed"
  | "referral_reward_credited";

export const REFERRAL_EVENT_CHECKOUT_DISCOUNT_APPLIED = "checkout_discount_applied" satisfies ReferralAnalyticsEventType;
export const REFERRAL_EVENT_CLEANER_CHECKOUT_ATTRIBUTION =
  "cleaner_checkout_attribution" satisfies ReferralAnalyticsEventType;
export const REFERRAL_EVENT_CONVERSION_COMPLETED =
  "referral_conversion_completed" satisfies ReferralAnalyticsEventType;
export const REFERRAL_EVENT_REWARD_CREDITED = "referral_reward_credited" satisfies ReferralAnalyticsEventType;

export type ReferralRedemptionSnapshot = {
  redemptionId: string;
  bookingId: string;
  referralCode: string;
  referrerId: string;
  referrerType: "customer" | "cleaner";
  refereeUserId: string | null;
  valueZar: number;
};

function baseMetadata(snap: ReferralRedemptionSnapshot): Record<string, unknown> {
  return {
    source: "paystack_success",
    referral_code: snap.referralCode,
    redemption_id: snap.redemptionId,
    source_context: null,
  };
}

async function insertReferralEventRow(params: {
  admin: SupabaseClient;
  eventType: ReferralAnalyticsEventType;
  snap: ReferralRedemptionSnapshot;
  metadata: Record<string, unknown>;
}): Promise<void> {
  const { error } = await params.admin.from("referral_events").insert({
    event_type: params.eventType,
    booking_id: params.snap.bookingId,
    referral_redemption_id: params.snap.redemptionId,
    referrer_id: params.snap.referrerId,
    referrer_type: params.snap.referrerType,
    referee_user_id: params.snap.refereeUserId,
    value_zar: Math.round(params.snap.valueZar),
    metadata: params.metadata,
  });
  if (!error) return;
  if (error.code === "23505") return;
  await reportOperationalIssue("warn", "referralCheckoutEvents/insertReferralEventRow", error.message, {
    eventType: params.eventType,
    bookingId: params.snap.bookingId,
  });
}

async function insertUserEventReferralCheckout(params: {
  admin: SupabaseClient;
  eventType: typeof REFERRAL_EVENT_CHECKOUT_DISCOUNT_APPLIED | typeof REFERRAL_EVENT_CLEANER_CHECKOUT_ATTRIBUTION;
  snap: ReferralRedemptionSnapshot;
  payload: Record<string, unknown>;
}): Promise<void> {
  const { error } = await params.admin.from("user_events").insert({
    user_id: params.snap.refereeUserId,
    event_type: params.eventType,
    booking_id: params.snap.bookingId,
    payload: params.payload,
  });
  if (!error) return;
  if (error.code === "23505") return;
  await reportOperationalIssue("warn", "referralCheckoutEvents/insertUserEventReferralCheckout", error.message, {
    eventType: params.eventType,
    bookingId: params.snap.bookingId,
  });
}

/**
 * Emitted only after a referral_discount_redemptions row exists for this booking (insert or idempotent verify).
 * Idempotent per (event_type, booking_id) on referral_events and user_events.
 */
export async function emitReferralCheckoutRedemptionEvents(
  admin: SupabaseClient,
  snap: ReferralRedemptionSnapshot,
): Promise<void> {
  const metaBase = baseMetadata(snap);

  await insertReferralEventRow({
    admin,
    eventType: REFERRAL_EVENT_CHECKOUT_DISCOUNT_APPLIED,
    snap,
    metadata: { ...metaBase },
  });

  await insertUserEventReferralCheckout({
    admin,
    eventType: REFERRAL_EVENT_CHECKOUT_DISCOUNT_APPLIED,
    snap,
    payload: {
      referral_code: snap.referralCode,
      referrer_id: snap.referrerId,
      referrer_type: snap.referrerType,
      referral_redemption_id: snap.redemptionId,
      value_zar: snap.valueZar,
      source: "paystack_success",
    },
  });

  if (snap.referrerType === "cleaner") {
    await insertReferralEventRow({
      admin,
      eventType: REFERRAL_EVENT_CLEANER_CHECKOUT_ATTRIBUTION,
      snap,
      metadata: { ...metaBase },
    });

    await insertUserEventReferralCheckout({
      admin,
      eventType: REFERRAL_EVENT_CLEANER_CHECKOUT_ATTRIBUTION,
      snap,
      payload: {
        referral_code: snap.referralCode,
        referrer_id: snap.referrerId,
        referrer_type: "cleaner",
        referral_redemption_id: snap.redemptionId,
        value_zar: snap.valueZar,
        source: "paystack_success",
      },
    });
  }
}
