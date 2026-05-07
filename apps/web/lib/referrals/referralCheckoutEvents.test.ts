import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  emitReferralCheckoutRedemptionEvents,
  REFERRAL_EVENT_CHECKOUT_DISCOUNT_APPLIED,
  REFERRAL_EVENT_CLEANER_CHECKOUT_ATTRIBUTION,
} from "@/lib/referrals/referralCheckoutEvents";

function buildMockAdmin(
  referralInserts: { event_type: string; booking_id: string }[],
  userInserts: { event_type: string; booking_id: string }[],
) {
  return {
    from: (table: string) => {
      if (table === "referral_events") {
        return {
          insert: (row: { event_type: string; booking_id: string }) => {
            referralInserts.push({ event_type: row.event_type, booking_id: row.booking_id });
            return { error: null };
          },
        };
      }
      if (table === "user_events") {
        return {
          insert: (row: { event_type: string; booking_id: string }) => {
            userInserts.push({ event_type: row.event_type, booking_id: row.booking_id });
            return { error: null };
          },
        };
      }
      return {};
    },
  } as unknown as SupabaseClient;
}

describe("emitReferralCheckoutRedemptionEvents", () => {
  it("emits checkout_discount for customer referrer only (no cleaner attribution)", async () => {
    const refRows: { event_type: string; booking_id: string }[] = [];
    const ueRows: { event_type: string; booking_id: string }[] = [];
    const admin = buildMockAdmin(refRows, ueRows);
    await emitReferralCheckoutRedemptionEvents(admin, {
      redemptionId: "r1",
      bookingId: "b1",
      referralCode: "SHALEAN0001",
      referrerId: "u1",
      referrerType: "customer",
      refereeUserId: "ref-1",
      valueZar: 50,
    });
    expect(refRows.map((r) => r.event_type)).toEqual([REFERRAL_EVENT_CHECKOUT_DISCOUNT_APPLIED]);
    expect(ueRows.map((r) => r.event_type)).toEqual([REFERRAL_EVENT_CHECKOUT_DISCOUNT_APPLIED]);
  });

  it("emits both events for cleaner referrer", async () => {
    const refRows: { event_type: string; booking_id: string }[] = [];
    const ueRows: { event_type: string; booking_id: string }[] = [];
    const admin = buildMockAdmin(refRows, ueRows);
    await emitReferralCheckoutRedemptionEvents(admin, {
      redemptionId: "r2",
      bookingId: "b2",
      referralCode: "SHALEAN0002",
      referrerId: "c1",
      referrerType: "cleaner",
      refereeUserId: null,
      valueZar: 50,
    });
    expect(refRows.map((r) => r.event_type)).toEqual([
      REFERRAL_EVENT_CHECKOUT_DISCOUNT_APPLIED,
      REFERRAL_EVENT_CLEANER_CHECKOUT_ATTRIBUTION,
    ]);
    expect(ueRows.map((r) => r.event_type)).toEqual([
      REFERRAL_EVENT_CHECKOUT_DISCOUNT_APPLIED,
      REFERRAL_EVENT_CLEANER_CHECKOUT_ATTRIBUTION,
    ]);
  });
});
