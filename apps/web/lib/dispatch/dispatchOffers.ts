import type { SupabaseClient } from "@supabase/supabase-js";
import { syncCleanerBusyFromBookings } from "@/lib/cleaner/syncCleanerStatus";
import {
  notifyCleanerOfDispatchOffer,
  notifyCleanerOfferAccepted,
  notifyCleanerOfferDeclined,
} from "@/lib/dispatch/offerNotifications";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { notifyCustomerCleanerAssigned } from "@/lib/notifications/customerUserNotifications";

const POLL_MS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export type CreateDispatchOfferRowResult =
  | { ok: true; offerId: string; expiresAtIso: string }
  | { ok: false; error: string };

export async function createDispatchOfferRow(params: {
  supabase: SupabaseClient;
  bookingId: string;
  cleanerId: string;
  rankIndex: number;
  ttlSeconds: number;
}): Promise<CreateDispatchOfferRowResult> {
  const expiresAt = new Date(Date.now() + params.ttlSeconds * 1000).toISOString();
  const { data, error } = await params.supabase
    .from("dispatch_offers")
    .insert({
      booking_id: params.bookingId,
      cleaner_id: params.cleanerId,
      status: "pending",
      rank_index: params.rankIndex,
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    const msg = error?.message ?? "Insert dispatch_offers failed.";
    if (process.env.NODE_ENV !== "production") {
      console.error("[createDispatchOfferRow] insert failed", {
        bookingId: params.bookingId,
        cleanerId: params.cleanerId,
        message: msg,
        details: error,
      });
    }
    await logSystemEvent({
      level: "warn",
      source: "dispatch_offer_insert",
      message: msg,
      context: { bookingId: params.bookingId, cleanerId: params.cleanerId },
    });
    return { ok: false, error: msg };
  }

  const offerId = String(data.id);
  const { error: rpcErr } = await params.supabase.rpc("dispatch_cleaner_offer_sent", {
    p_cleaner_id: params.cleanerId,
  });
  if (rpcErr) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[createDispatchOfferRow] dispatch_cleaner_offer_sent failed (offer kept)", {
        bookingId: params.bookingId,
        cleanerId: params.cleanerId,
        offerId,
        message: rpcErr.message,
      });
    }
    await logSystemEvent({
      level: "warn",
      source: "dispatch_offer_sent_rpc",
      message: rpcErr.message,
      context: { bookingId: params.bookingId, cleanerId: params.cleanerId, offerId },
    });
  }

  const t0 = Date.now();
  await logSystemEvent({
    level: "info",
    source: "dispatch_offer_created",
    message: "Dispatch offer created",
    context: {
      bookingId: params.bookingId,
      cleanerId: params.cleanerId,
      offerId,
      rankIndex: params.rankIndex,
      latency_ms: Date.now() - t0,
    },
  });

  await notifyCleanerOfDispatchOffer({
    bookingId: params.bookingId,
    offerId,
    cleanerId: params.cleanerId,
    expiresAtIso: expiresAt,
  });

  await params.supabase
    .from("bookings")
    .update({ dispatch_status: "offered" })
    .eq("id", params.bookingId);

  return { ok: true, offerId, expiresAtIso: expiresAt };
}

export type OfferPollResult = "assigned" | "rejected" | "expired";

export async function waitForDispatchOfferResolution(params: {
  supabase: SupabaseClient;
  offerId: string;
  bookingId: string;
  cleanerId: string;
  deadlineMs: number;
}): Promise<OfferPollResult> {
  const deadline = Date.now() + params.deadlineMs;
  const t0 = Date.now();

  while (Date.now() < deadline) {
    const [{ data: offer }, { data: booking }] = await Promise.all([
      params.supabase.from("dispatch_offers").select("status").eq("id", params.offerId).maybeSingle(),
      params.supabase.from("bookings").select("cleaner_id, status").eq("id", params.bookingId).maybeSingle(),
    ]);

    const ost = String((offer as { status?: string } | null)?.status ?? "");
    if (ost === "rejected") {
      await logSystemEvent({
        level: "info",
        source: "dispatch_offer_rejected",
        message: "Offer rejected (poll)",
        context: {
          bookingId: params.bookingId,
          offerId: params.offerId,
          cleanerId: params.cleanerId,
          latency_ms: Date.now() - t0,
        },
      });
      return "rejected";
    }

    const b = booking as { cleaner_id?: string | null; status?: string | null } | null;
    if (
      b &&
      String(b.status ?? "").toLowerCase() === "assigned" &&
      String(b.cleaner_id ?? "") === params.cleanerId
    ) {
      await logSystemEvent({
        level: "info",
        source: "dispatch_offer_accepted",
        message: "Offer resolved — booking assigned",
        context: {
          bookingId: params.bookingId,
          offerId: params.offerId,
          cleanerId: params.cleanerId,
          latency_ms: Date.now() - t0,
        },
      });
      return "assigned";
    }

    if (ost === "accepted") {
      return "assigned";
    }

    await sleep(POLL_MS);
  }

  const nowIso = new Date().toISOString();
  const { data: still } = await params.supabase
    .from("dispatch_offers")
    .select("status")
    .eq("id", params.offerId)
    .maybeSingle();
  const finalSt = String((still as { status?: string } | null)?.status ?? "");
  if (finalSt === "rejected") {
    return "rejected";
  }
  if (finalSt === "accepted") {
    return "assigned";
  }

  await params.supabase
    .from("dispatch_offers")
    .update({ status: "expired", responded_at: nowIso })
    .eq("id", params.offerId)
    .eq("status", "pending");

  await logSystemEvent({
    level: "info",
    source: "dispatch_offer_expired",
    message: "Dispatch offer expired",
    context: {
      bookingId: params.bookingId,
      offerId: params.offerId,
      cleanerId: params.cleanerId,
      latency_ms: Date.now() - t0,
    },
  });

  return "expired";
}

export async function acceptDispatchOffer(params: {
  supabase: SupabaseClient;
  offerId: string;
  cleanerId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: offer, error: oErr } = await params.supabase
    .from("dispatch_offers")
    .select("id, booking_id, cleaner_id, status, created_at")
    .eq("id", params.offerId)
    .maybeSingle();

  if (oErr || !offer) return { ok: false, error: "Offer not found." };
  const row = offer as { booking_id?: string; cleaner_id?: string; status?: string; created_at?: string };
  if (String(row.cleaner_id) !== params.cleanerId) return { ok: false, error: "Not your offer." };
  if (String(row.status) !== "pending") return { ok: false, error: "Offer is no longer pending." };

  const bookingId = String(row.booking_id ?? "");
  if (!bookingId) return { ok: false, error: "Invalid offer." };

  const now = new Date().toISOString();
  const createdAt = row.created_at ? new Date(row.created_at).getTime() : Date.now();
  const latencyMs = Math.max(0, Date.now() - createdAt);

  const { data: bookingBefore } = await params.supabase
    .from("bookings")
    .select("status, cleaner_id")
    .eq("id", bookingId)
    .maybeSingle();
  const bs = bookingBefore as { status?: string; cleaner_id?: string | null } | null;
  if (bs && String(bs.status ?? "").toLowerCase() === "assigned" && String(bs.cleaner_id ?? "") !== params.cleanerId) {
    await params.supabase
      .from("dispatch_offers")
      .update({ status: "expired", responded_at: now })
      .eq("id", params.offerId)
      .eq("status", "pending");
    return { ok: false, error: "Another cleaner was assigned." };
  }

  const { data: updatedRows, error: uBook } = await params.supabase
    .from("bookings")
    .update({
      cleaner_id: params.cleanerId,
      status: "assigned",
      dispatch_status: "assigned",
      assigned_at: now,
    })
    .eq("id", bookingId)
    .eq("status", "pending")
    .neq("dispatch_status", "assigned")
    .select("id");

  if (uBook) {
    return { ok: false, error: uBook.message };
  }
  if (!updatedRows?.length) {
    await params.supabase
      .from("dispatch_offers")
      .update({ status: "expired", responded_at: now })
      .eq("id", params.offerId)
      .eq("status", "pending");
    return { ok: false, error: "Booking was already assigned." };
  }

  const { error: exErr } = await params.supabase.rpc("dispatch_expire_peer_offers", {
    p_booking_id: bookingId,
    p_winner_offer_id: params.offerId,
  });
  if (exErr) {
    await logSystemEvent({
      level: "warn",
      source: "dispatch_expire_peers",
      message: exErr.message,
      context: { bookingId, offerId: params.offerId },
    });
  }

  await params.supabase
    .from("dispatch_offers")
    .update({ status: "accepted", responded_at: now })
    .eq("id", params.offerId)
    .eq("status", "pending");

  const { error: rpcErr } = await params.supabase.rpc("dispatch_cleaner_offer_accepted", {
    p_cleaner_id: params.cleanerId,
  });
  if (rpcErr) {
    await logSystemEvent({
      level: "warn",
      source: "dispatch_offer_accept_stats",
      message: rpcErr.message,
      context: { offerId: params.offerId, cleanerId: params.cleanerId, bookingId },
    });
  }

  const { error: metErr } = await params.supabase.rpc("dispatch_record_offer_response", {
    p_cleaner_id: params.cleanerId,
    p_latency_ms: latencyMs,
    p_accepted: true,
  });
  if (metErr) {
    await logSystemEvent({
      level: "warn",
      source: "dispatch_offer_metrics",
      message: metErr.message,
      context: { offerId: params.offerId, cleanerId: params.cleanerId },
    });
  }

  await syncCleanerBusyFromBookings(params.supabase, params.cleanerId);
  await params.supabase.from("cleaners").update({ is_available: false }).eq("id", params.cleanerId);

  await logSystemEvent({
    level: "info",
    source: "dispatch_offer_accepted",
    message: "Offer accepted (API)",
    context: {
      bookingId,
      cleanerId: params.cleanerId,
      offerId: params.offerId,
      latency_ms: latencyMs,
    },
  });

  await notifyCleanerOfferAccepted({
    cleanerId: params.cleanerId,
    bookingId,
    offerId: params.offerId,
  });

  void notifyCustomerCleanerAssigned(params.supabase, bookingId);

  return { ok: true };
}

export async function rejectDispatchOffer(params: {
  supabase: SupabaseClient;
  offerId: string;
  cleanerId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: offer, error: oErr } = await params.supabase
    .from("dispatch_offers")
    .select("id, cleaner_id, status, booking_id, created_at")
    .eq("id", params.offerId)
    .maybeSingle();

  if (oErr || !offer) return { ok: false, error: "Offer not found." };
  const row = offer as { cleaner_id?: string; status?: string; booking_id?: string; created_at?: string };
  if (String(row.cleaner_id) !== params.cleanerId) return { ok: false, error: "Not your offer." };
  if (String(row.status) !== "pending") return { ok: false, error: "Offer is no longer pending." };

  const now = new Date().toISOString();
  const createdAt = row.created_at ? new Date(row.created_at).getTime() : Date.now();
  const latencyMs = Math.max(0, Date.now() - createdAt);

  const { error } = await params.supabase
    .from("dispatch_offers")
    .update({ status: "rejected", responded_at: now })
    .eq("id", params.offerId)
    .eq("status", "pending");

  if (error) return { ok: false, error: error.message };

  const { error: metErr } = await params.supabase.rpc("dispatch_record_offer_response", {
    p_cleaner_id: params.cleanerId,
    p_latency_ms: latencyMs,
    p_accepted: false,
  });
  if (metErr) {
    await logSystemEvent({
      level: "warn",
      source: "dispatch_offer_metrics",
      message: metErr.message,
      context: { offerId: params.offerId, cleanerId: params.cleanerId },
    });
  }

  await logSystemEvent({
    level: "info",
    source: "dispatch_offer_rejected",
    message: "Offer rejected (API)",
    context: {
      bookingId: String(row.booking_id ?? ""),
      cleanerId: params.cleanerId,
      offerId: params.offerId,
      latency_ms: latencyMs,
    },
  });

  await notifyCleanerOfferDeclined({
    cleanerId: params.cleanerId,
    bookingId: String(row.booking_id ?? ""),
    offerId: params.offerId,
  });

  return { ok: true };
}
