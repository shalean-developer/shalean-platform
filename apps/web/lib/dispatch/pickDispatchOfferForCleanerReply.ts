/** Pending offer row fields used for WhatsApp reply → offer resolution (Phase 8C). */
export type DispatchOfferReplyCandidate = {
  id: string;
  booking_id: string;
  status: string;
  expires_at: string;
  offer_whatsapp_message_id: string | null;
  whatsapp_sent_at: string | null;
  created_at: string;
};

const REPLY_AMBIGUITY_WINDOW_MS = 10 * 60 * 1000;

function offerSentAtMs(o: DispatchOfferReplyCandidate): number {
  const raw = o.whatsapp_sent_at ?? o.created_at;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Pick the dispatch offer a cleaner's reply refers to.
 * - With `contextMessageId`: only an exact match on `offer_whatsapp_message_id` (no fallback — avoids wrong booking).
 * - Without context: newest non-expired pending by send time, preferring offers sent within {@link REPLY_AMBIGUITY_WINDOW_MS}.
 */
export function pickDispatchOfferForCleanerReply(
  offers: DispatchOfferReplyCandidate[],
  contextMessageId: string | undefined,
  nowMs: number,
): DispatchOfferReplyCandidate | null {
  const pending = offers.filter((o) => {
    if (String(o.status ?? "").toLowerCase() !== "pending") return false;
    const exp = new Date(o.expires_at).getTime();
    return Number.isFinite(exp) && exp > nowMs;
  });
  if (pending.length === 0) return null;

  const ctx = contextMessageId?.trim();
  if (ctx) {
    const exact = pending.find((o) => o.offer_whatsapp_message_id === ctx);
    return exact ?? null;
  }

  const inWindow = pending.filter((o) => nowMs - offerSentAtMs(o) <= REPLY_AMBIGUITY_WINDOW_MS);
  const pool = inWindow.length > 0 ? inWindow : pending;
  const sorted = [...pool].sort((a, b) => offerSentAtMs(b) - offerSentAtMs(a));
  return sorted[0] ?? null;
}
