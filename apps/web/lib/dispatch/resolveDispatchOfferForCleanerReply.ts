import type { SupabaseClient } from "@supabase/supabase-js";
import {
  pickDispatchOfferForCleanerReply,
  type DispatchOfferReplyCandidate,
} from "@/lib/dispatch/pickDispatchOfferForCleanerReply";

export type ResolvedDispatchOfferForReply = {
  offerId: string;
  bookingId: string;
};

/**
 * Load this cleaner's pending dispatch offers and resolve which one the inbound reply targets.
 * Expired rows are excluded by {@link pickDispatchOfferForCleanerReply}.
 */
export async function resolveDispatchOfferForCleanerReply(params: {
  supabase: SupabaseClient;
  cleanerId: string;
  contextMessageId?: string | null;
}): Promise<ResolvedDispatchOfferForReply | null> {
  const { data, error } = await params.supabase
    .from("dispatch_offers")
    .select("id, booking_id, status, expires_at, offer_whatsapp_message_id, whatsapp_sent_at, created_at")
    .eq("cleaner_id", params.cleanerId)
    .eq("status", "pending");

  if (error || !data?.length) return null;

  const rows = data as DispatchOfferReplyCandidate[];
  const picked = pickDispatchOfferForCleanerReply(
    rows,
    params.contextMessageId ?? undefined,
    Date.now(),
  );
  if (!picked) return null;
  return { offerId: picked.id, bookingId: picked.booking_id };
}
