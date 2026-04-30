import "server-only";

import {
  isAssignedBookingAcceptReply,
  isAssignedBookingDeclineReply,
  normalizeCleanerReplyText,
} from "@/lib/booking/cleanerReplyIntent";
import { type CreatedBookingRecord } from "@/lib/booking/cleanerJobAssignedWhatsApp";
import { tryOnceReassignAfterDecline } from "@/lib/booking/reassignBookingAfterDecline";
import { sendViaMetaWhatsAppTemplateBody } from "@/lib/dispatch/metaWhatsAppSend";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { logWhatsAppEvent } from "@/lib/whatsapp/logWhatsAppEvent";
import { resolveMetaTemplateName } from "@/lib/whatsapp/cleanerWhatsappTemplates";
import type { SupabaseClient } from "@supabase/supabase-js";

const BOOKING_ASSIGN_REPLY_SELECT =
  "id, customer_name, customer_phone, location, service, date, time, status, created_at, cleaner_id, dispatch_status, assigned_at";

/** Recent assignment window when WhatsApp omits `context.id` (manual reply, old clients). */
const RECENT_ASSIGNED_REPLY_WINDOW_MINUTES = 30;

const BOOKING_UUID_IN_TEXT_RE =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;

export type UnmatchedAssignedReplyReason = "ambiguous" | "no_match";

const UNMATCHED_CLEANER_REPLY_HINT =
  "Sorry, we couldn't match your response to a job. Please reply directly to the job message.";

function isRowAssigned(r: CreatedBookingRecord): boolean {
  return String(r.status ?? "") === "assigned";
}

type ResolveAssignedResult =
  | { ok: true; booking: CreatedBookingRecord }
  | { ok: false; reason: UnmatchedAssignedReplyReason };

/**
 * After context + UUID: only bookings with `assigned_at` in the last
 * {@link RECENT_ASSIGNED_REPLY_WINDOW_MINUTES} minutes — exactly one row, else no match (no stale "lone" fallback).
 */
async function resolveAssignedBookingAmbiguousSafe(
  admin: SupabaseClient,
  cleanerId: string,
  sel: string,
): Promise<ResolveAssignedResult> {
  const thresholdIso = new Date(
    Date.now() - RECENT_ASSIGNED_REPLY_WINDOW_MINUTES * 60 * 1000,
  ).toISOString();

  const { data: recent, error: recentErr } = await admin
    .from("bookings")
    .select(sel)
    .eq("cleaner_id", cleanerId)
    .eq("status", "assigned")
    .not("assigned_at", "is", null)
    .gte("assigned_at", thresholdIso)
    .order("assigned_at", { ascending: false })
    .limit(2);

  if (recentErr) {
    await logSystemEvent({
      level: "warn",
      source: "whatsapp_booking_reply",
      message: "Recent assigned booking lookup failed",
      context: { cleanerId, error: recentErr.message },
    });
    return { ok: false, reason: "no_match" };
  }

  const recentList = (recent ?? []).filter((b) => typeof (b as { id?: unknown }).id === "string") as unknown as CreatedBookingRecord[];

  if (recentList.length > 1) {
    return { ok: false, reason: "ambiguous" };
  }

  if (recentList.length === 1) {
    return { ok: true, booking: recentList[0]! };
  }

  return { ok: false, reason: "no_match" };
}

async function resolveAssignedBookingForCleanerReply(
  admin: SupabaseClient,
  cleanerId: string,
  replyNormalized: string,
  contextMessageId?: string,
): Promise<ResolveAssignedResult> {
  const sel = BOOKING_ASSIGN_REPLY_SELECT;

  const ctx = contextMessageId?.trim();
  if (ctx) {
    const { data: log, error: logErr } = await admin
      .from("whatsapp_logs")
      .select("booking_id")
      .eq("meta_message_id", ctx)
      .maybeSingle();

    if (!logErr && log && typeof (log as { booking_id?: unknown }).booking_id === "string") {
      const bid = (log as { booking_id: string }).booking_id;
      const { data: b } = await admin
        .from("bookings")
        .select(sel)
        .eq("id", bid)
        .eq("cleaner_id", cleanerId)
        .eq("status", "assigned")
        .maybeSingle();
      if (b && typeof (b as { id?: unknown }).id === "string") {
        return { ok: true, booking: b as CreatedBookingRecord };
      }
    }
  }

  const uuidMatch = replyNormalized.match(BOOKING_UUID_IN_TEXT_RE);
  if (uuidMatch) {
    const bid = uuidMatch[0]!;
    const { data: b } = await admin
      .from("bookings")
      .select(sel)
      .eq("id", bid)
      .eq("cleaner_id", cleanerId)
      .eq("status", "assigned")
      .maybeSingle();
    if (b && typeof (b as { id?: unknown }).id === "string") {
      return { ok: true, booking: b as CreatedBookingRecord };
    }
  }

  return resolveAssignedBookingAmbiguousSafe(admin, cleanerId, sel);
}

/** Dedupe key = inbound wamid: one DB log + one WhatsApp hint per inbound message. Without wamid, log only (no hint). */
function voidRecordUnmatchedIntentAndMaybeNotify(
  admin: SupabaseClient,
  params: {
    cleanerId: string;
    intent: "accept" | "decline";
    reason: UnmatchedAssignedReplyReason;
    inboundMessageId?: string;
    cleanerPhoneDigits?: string;
  },
): void {
  void (async () => {
    try {
      let phone = String(params.cleanerPhoneDigits ?? "").trim();
      if (!phone) {
        const { data: c, error } = await admin
          .from("cleaners")
          .select("phone_number, phone")
          .eq("id", params.cleanerId)
          .maybeSingle();
        if (!error && c) {
          const row = c as { phone_number?: string | null; phone?: string | null };
          phone = String(row.phone_number || row.phone || "").trim();
        }
      }

      const wamid = params.inboundMessageId?.trim();

      if (wamid) {
        const { error: dedupeErr } = await admin.from("whatsapp_inbound_feedback_dedupe").insert({
          meta_message_id: wamid,
        });
        if (dedupeErr?.code === "23505") {
          return;
        }
        if (dedupeErr) {
          await logSystemEvent({
            level: "warn",
            source: "whatsapp_booking_reply",
            message: "Unmatched-reply dedupe insert failed",
            context: { cleanerId: params.cleanerId, error: dedupeErr.message, code: dedupeErr.code },
          });
          return;
        }
      }

      const { error: logErr } = await admin.from("whatsapp_cleaner_unmatched_intent_log").insert({
        inbound_message_id: wamid ?? null,
        cleaner_id: params.cleanerId,
        phone: phone || null,
        intent: params.intent,
        reason: params.reason,
      });
      if (logErr) {
        await logSystemEvent({
          level: "warn",
          source: "whatsapp_booking_reply",
          message: "whatsapp_cleaner_unmatched_intent_log insert failed",
          context: { cleanerId: params.cleanerId, error: logErr.message, code: logErr.code },
        });
      }

      await logSystemEvent({
        level: "info",
        source: "whatsapp_booking_reply",
        message:
          params.reason === "ambiguous"
            ? "Unmatched cleaner intent (ambiguous assigned bookings)"
            : "No valid booking match for cleaner reply",
        context: {
          cleanerId: params.cleanerId,
          intent: params.intent,
          reason: params.reason,
          inboundMessageId: wamid ?? null,
          windowMinutes: RECENT_ASSIGNED_REPLY_WINDOW_MINUTES,
        },
      });

      if (!wamid || !phone) {
        return;
      }

      const w = await sendViaMetaWhatsAppTemplateBody({
        phone,
        templateName: resolveMetaTemplateName("offer_ack"),
        languageCode: process.env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() || "en",
        bodyParameters: [UNMATCHED_CLEANER_REPLY_HINT.slice(0, 1020)],
        recipientRole: "cleaner",
      });
      await logWhatsAppEvent(admin, {
        cleaner_id: params.cleanerId,
        template: "offer_ack",
        status: w.ok ? "sent" : "failed",
        error: w.error,
        phone,
        message_type: "template",
        meta_message_id: w.messageId,
      });
    } catch (err) {
      await logSystemEvent({
        level: "warn",
        source: "whatsapp_booking_reply",
        message: "Unmatched cleaner reply follow-up failed",
        context: { cleanerId: params.cleanerId, error: err instanceof Error ? err.message : String(err) },
      });
    }
  })();
}

export type CleanerAssignedBookingReplyResult =
  | { handled: false }
  | { handled: true; action: "booking_accepted"; bookingId: string }
  | { handled: true; action: "booking_declined"; bookingId: string }
  | { handled: true; action: "booking_reply_stale" };

export type TryHandleCleanerAssignedBookingWhatsAppReplyOpts = {
  contextMessageId?: string;
  /** Inbound Meta message id (`messages[].id`) — dedupes unmatched hint + log. */
  inboundMessageId?: string;
  /** Normalized digits from webhook `from` (for log + send when DB phone missing). */
  cleanerPhoneDigits?: string;
};

/**
 * Handles cleaner WhatsApp replies for assigned bookings (legacy assignment / admin flows).
 * Resolves booking via reply-context wamid → whatsapp_logs, UUID in body, then at most one assigned row in the last 30 minutes.
 * Decline runs before accept when both match. One reassignment attempt after decline. Does not throw.
 */
export async function tryHandleCleanerAssignedBookingWhatsAppReply(
  admin: SupabaseClient,
  cleanerId: string,
  replyRaw: string,
  opts?: TryHandleCleanerAssignedBookingWhatsAppReplyOpts,
): Promise<CleanerAssignedBookingReplyResult> {
  try {
    const reply = normalizeCleanerReplyText(replyRaw);
    const decline = isAssignedBookingDeclineReply(reply);
    const accept = isAssignedBookingAcceptReply(reply);
    if (!decline && !accept) {
      return { handled: false };
    }

    const resolved = await resolveAssignedBookingForCleanerReply(
      admin,
      cleanerId,
      reply,
      opts?.contextMessageId,
    );

    if (!resolved.ok) {
      voidRecordUnmatchedIntentAndMaybeNotify(admin, {
        cleanerId,
        intent: decline ? "decline" : "accept",
        reason: resolved.reason,
        inboundMessageId: opts?.inboundMessageId,
        cleanerPhoneDigits: opts?.cleanerPhoneDigits,
      });
      return { handled: false };
    }

    const row = resolved.booking;

    if (!isRowAssigned(row)) {
      await logSystemEvent({
        level: "info",
        source: "whatsapp_booking_reply",
        message: "Skip accept/decline: booking not in assigned state (idempotent)",
        context: { bookingId: row.id, cleanerId, status: row.status },
      });
      return { handled: false };
    }

    if (decline) {
      const { data: updated, error: upErr } = await admin
        .from("bookings")
        .update({
          status: "pending_assignment",
          dispatch_status: "unassigned",
          cleaner_id: null,
          assigned_at: null,
          last_declined_by_cleaner_id: cleanerId,
          last_declined_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .eq("cleaner_id", cleanerId)
        .eq("status", "assigned")
        .select("id")
        .maybeSingle();

      if (upErr || !updated) {
        await logSystemEvent({
          level: "info",
          source: "whatsapp_booking_reply",
          message: "Decline update did not apply (race or stale row)",
          context: { bookingId: row.id, cleanerId, error: upErr?.message },
        });
        return { handled: true, action: "booking_reply_stale" };
      }

      const slotDate = String(row.date ?? "").trim();
      const slotTime = String(row.time ?? "").trim();

      await logSystemEvent({
        level: "info",
        source: "whatsapp_booking_reply",
        message: "Cleaner declined assigned booking via WhatsApp",
        context: { bookingId: row.id, cleanerId },
      });

      await tryOnceReassignAfterDecline(admin, {
        bookingId: row.id,
        slotDate,
        slotTime,
        declinedCleanerId: cleanerId,
      });

      return { handled: true, action: "booking_declined", bookingId: row.id };
    }

    const { data: acceptedRow, error: accErr } = await admin
      .from("bookings")
      .update({
        status: "confirmed",
        dispatch_status: "accepted",
      })
      .eq("id", row.id)
      .eq("cleaner_id", cleanerId)
      .eq("status", "assigned")
      .select(BOOKING_ASSIGN_REPLY_SELECT)
      .maybeSingle();

    if (accErr || !acceptedRow) {
      await logSystemEvent({
        level: "info",
        source: "whatsapp_booking_reply",
        message: "Accept update did not apply (race or stale row)",
        context: { bookingId: row.id, cleanerId, error: accErr?.message },
      });
      return { handled: true, action: "booking_reply_stale" };
    }

    await logSystemEvent({
      level: "info",
      source: "whatsapp_booking_reply",
      message: "Cleaner accepted assigned booking via WhatsApp (customer channel: email/SMS only — no customer WhatsApp)",
      context: { bookingId: row.id, cleanerId },
    });

    return { handled: true, action: "booking_accepted", bookingId: row.id };
  } catch (err) {
    await logSystemEvent({
      level: "error",
      source: "whatsapp_booking_reply",
      message: "tryHandleCleanerAssignedBookingWhatsAppReply threw",
      context: { cleanerId, error: err instanceof Error ? err.message : String(err) },
    });
    return { handled: false };
  }
}
