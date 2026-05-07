import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  REFERRAL_EVENT_CONVERSION_COMPLETED,
  REFERRAL_EVENT_REWARD_CREDITED,
  type ReferralAnalyticsEventType,
} from "@/lib/referrals/referralCheckoutEvents";
import { reportOperationalIssue } from "@/lib/logging/systemLog";

async function insertReferralLifecycleEvent(params: {
  admin: SupabaseClient;
  eventType: ReferralAnalyticsEventType;
  referralId: string;
  referrerId: string;
  referrerType: "customer" | "cleaner";
  refereeUserId: string | null;
  bookingId: string | null;
  valueZar: number | null;
  metadata: Record<string, unknown>;
}): Promise<void> {
  const { error } = await params.admin.from("referral_events").insert({
    event_type: params.eventType,
    referral_id: params.referralId,
    referrer_id: params.referrerId,
    referrer_type: params.referrerType,
    referee_user_id: params.refereeUserId,
    booking_id: params.bookingId,
    value_zar: params.valueZar,
    metadata: params.metadata,
  });
  if (!error) return;
  if (error.code === "23505") return;
  await reportOperationalIssue("warn", "referralLifecycleEvents/insert", error.message, {
    eventType: params.eventType,
    referralId: params.referralId,
  });
}

/**
 * After customer referral row is `rewarded` and wallet credit persisted — analytics only.
 */
export async function emitCustomerReferralLifecycleRewardEvents(params: {
  admin: SupabaseClient;
  referralId: string;
  referrerId: string;
  refereeUserId: string | null;
  bookingId: string | null;
  rewardZar: number;
}): Promise<void> {
  const commonMeta = {
    reward_amount_zar: params.rewardZar,
    source: "processCustomerReferralAfterFirstPaidBooking",
  };
  await insertReferralLifecycleEvent({
    admin: params.admin,
    eventType: REFERRAL_EVENT_CONVERSION_COMPLETED,
    referralId: params.referralId,
    referrerId: params.referrerId,
    referrerType: "customer",
    refereeUserId: params.refereeUserId,
    bookingId: params.bookingId,
    valueZar: params.rewardZar,
    metadata: {
      ...commonMeta,
      reward_type: "wallet_credit",
      booking_id: params.bookingId,
    },
  });
  await insertReferralLifecycleEvent({
    admin: params.admin,
    eventType: REFERRAL_EVENT_REWARD_CREDITED,
    referralId: params.referralId,
    referrerId: params.referrerId,
    referrerType: "customer",
    refereeUserId: params.refereeUserId,
    bookingId: params.bookingId,
    valueZar: params.rewardZar,
    metadata: {
      ...commonMeta,
      reward_type: "wallet_credit",
      booking_id: params.bookingId,
    },
  });
}

/**
 * Cleaner recruitment: conversion when referral row reaches `completed`; reward after bonus persisted.
 */
export async function emitCleanerReferralConversionCompleted(params: {
  admin: SupabaseClient;
  referralId: string;
  referrerCleanerId: string;
  refereeCleanerId: string;
  rewardAmountZar: number;
}): Promise<void> {
  await insertReferralLifecycleEvent({
    admin: params.admin,
    eventType: REFERRAL_EVENT_CONVERSION_COMPLETED,
    referralId: params.referralId,
    referrerId: params.referrerCleanerId,
    referrerType: "cleaner",
    refereeUserId: params.refereeCleanerId,
    bookingId: null,
    valueZar: params.rewardAmountZar,
    metadata: {
      reward_amount_zar: params.rewardAmountZar,
      reward_type: "cleaner_recruitment",
      source: "completeCleanerReferralOnFirstJob",
      phase: "conversion",
    },
  });
}

export async function emitCleanerReferralRewardCredited(params: {
  admin: SupabaseClient;
  referralId: string;
  referrerCleanerId: string;
  refereeCleanerId: string;
  rewardZar: number;
}): Promise<void> {
  await insertReferralLifecycleEvent({
    admin: params.admin,
    eventType: REFERRAL_EVENT_REWARD_CREDITED,
    referralId: params.referralId,
    referrerId: params.referrerCleanerId,
    referrerType: "cleaner",
    refereeUserId: params.refereeCleanerId,
    bookingId: null,
    valueZar: params.rewardZar,
    metadata: {
      reward_amount_zar: params.rewardZar,
      reward_type: "cleaner_bonus",
      source: "completeCleanerReferralOnFirstJob",
    },
  });
}
