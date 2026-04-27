import { describe, expect, it } from "vitest";
import {
  pickDispatchOfferForCleanerReply,
  type DispatchOfferReplyCandidate,
} from "@/lib/dispatch/pickDispatchOfferForCleanerReply";

function row(p: Partial<DispatchOfferReplyCandidate> & Pick<DispatchOfferReplyCandidate, "id" | "booking_id">): DispatchOfferReplyCandidate {
  return {
    status: "pending",
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    offer_whatsapp_message_id: null,
    whatsapp_sent_at: null,
    created_at: new Date(Date.now() - 120_000).toISOString(),
    ...p,
  };
}

describe("pickDispatchOfferForCleanerReply", () => {
  const nowMs = 1_700_000_000_000;

  it("matches exact WhatsApp context to offer_whatsapp_message_id", () => {
    const offers: DispatchOfferReplyCandidate[] = [
      row({ id: "a", booking_id: "b1", offer_whatsapp_message_id: "wamid.A" }),
      row({ id: "b", booking_id: "b2", offer_whatsapp_message_id: "wamid.B" }),
    ];
    const picked = pickDispatchOfferForCleanerReply(offers, "wamid.B", nowMs);
    expect(picked?.id).toBe("b");
    expect(picked?.booking_id).toBe("b2");
  });

  it("returns null when context is set but does not match (no wrong-booking fallback)", () => {
    const offers: DispatchOfferReplyCandidate[] = [
      row({ id: "a", booking_id: "b1", offer_whatsapp_message_id: "wamid.A" }),
    ];
    expect(pickDispatchOfferForCleanerReply(offers, "wamid.OTHER", nowMs)).toBeNull();
  });

  it("ignores expired offers", () => {
    const offers: DispatchOfferReplyCandidate[] = [
      row({
        id: "old",
        booking_id: "b0",
        expires_at: new Date(nowMs - 1000).toISOString(),
        whatsapp_sent_at: new Date(nowMs - 5000).toISOString(),
      }),
      row({
        id: "fresh",
        booking_id: "b1",
        expires_at: new Date(nowMs + 60_000).toISOString(),
        whatsapp_sent_at: new Date(nowMs - 2000).toISOString(),
      }),
    ];
    const picked = pickDispatchOfferForCleanerReply(offers, undefined, nowMs);
    expect(picked?.id).toBe("fresh");
  });

  it("without context, picks most recent by whatsapp_sent_at among pending non-expired", () => {
    const offers: DispatchOfferReplyCandidate[] = [
      row({
        id: "older",
        booking_id: "b1",
        whatsapp_sent_at: new Date(nowMs - 30_000).toISOString(),
      }),
      row({
        id: "newer",
        booking_id: "b2",
        whatsapp_sent_at: new Date(nowMs - 5000).toISOString(),
      }),
    ];
    const picked = pickDispatchOfferForCleanerReply(offers, undefined, nowMs);
    expect(picked?.id).toBe("newer");
  });

  it("prefers offers inside 10m window when multiple pending exist", () => {
    const offers: DispatchOfferReplyCandidate[] = [
      row({
        id: "stale",
        booking_id: "b1",
        whatsapp_sent_at: new Date(nowMs - 12 * 60_000).toISOString(),
      }),
      row({
        id: "recent",
        booking_id: "b2",
        whatsapp_sent_at: new Date(nowMs - 2 * 60_000).toISOString(),
      }),
    ];
    const picked = pickDispatchOfferForCleanerReply(offers, undefined, nowMs);
    expect(picked?.id).toBe("recent");
  });

  it("falls back to all pending when none fall in 10m window", () => {
    const offers: DispatchOfferReplyCandidate[] = [
      row({
        id: "a",
        booking_id: "b1",
        whatsapp_sent_at: new Date(nowMs - 20 * 60_000).toISOString(),
      }),
      row({
        id: "b",
        booking_id: "b2",
        whatsapp_sent_at: new Date(nowMs - 15 * 60_000).toISOString(),
      }),
    ];
    const picked = pickDispatchOfferForCleanerReply(offers, undefined, nowMs);
    expect(picked?.id).toBe("b");
  });
});
