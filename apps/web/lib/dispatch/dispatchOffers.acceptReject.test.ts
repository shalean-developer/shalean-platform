import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { acceptDispatchOffer, rejectDispatchOffer } from "@/lib/dispatch/dispatchOffers";

const pastIso = new Date(Date.now() - 60_000).toISOString();

function offerRow(over: Record<string, unknown>) {
  return {
    id: "offer-1",
    booking_id: "book-1",
    cleaner_id: "cleaner-1",
    status: "pending",
    created_at: new Date().toISOString(),
    ux_variant: null,
    expires_at: pastIso,
    whatsapp_sent_at: null as string | null,
    sms_sent_at: null as string | null,
    dispatch_tier: null,
    dispatch_visible_at: null as string | null,
    ...over,
  };
}

function createOfferSelectOnce(row: Record<string, unknown> | null, err: { message: string } | null = null) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: row, error: err })),
        })),
      })),
    })),
  } as unknown as SupabaseClient;
}

describe("acceptDispatchOffer", () => {
  it("returns expired when expires_at is in the past", async () => {
    const supabase = createOfferSelectOnce(offerRow({ expires_at: pastIso }));
    const r = await acceptDispatchOffer({
      supabase,
      offerId: "offer-1",
      cleanerId: "cleaner-1",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failure).toBe("expired");
    }
  });
});

describe("rejectDispatchOffer", () => {
  it("returns expired when expires_at is in the past", async () => {
    const supabase = createOfferSelectOnce(offerRow({ expires_at: pastIso }));
    const r = await rejectDispatchOffer({
      supabase,
      offerId: "offer-1",
      cleanerId: "cleaner-1",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failure).toBe("expired");
    }
  });
});
