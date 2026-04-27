import { NextResponse } from "next/server";
import { verifyMetaWebhookSignature } from "@/lib/dispatch/metaWhatsAppSend";
import {
  acceptDispatchOffer,
  rejectDispatchOffer,
  type AcceptDispatchOfferResult,
} from "@/lib/dispatch/dispatchOffers";
import { resolveDispatchOfferForCleanerReply } from "@/lib/dispatch/resolveDispatchOfferForCleanerReply";
import { notifyCleanerJobAlreadyTaken } from "@/lib/dispatch/offerNotifications";
import { reassignBookingAfterDecline } from "@/lib/booking/reassignBookingAfterDecline";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { recordWhatsAppDeliveryStatuses } from "@/lib/whatsapp/deliveryWebhook";
import {
  isDispatchOfferAcceptReply,
  isDispatchOfferDeclineReply,
  normalizeCleanerReplyText,
} from "@/lib/booking/cleanerReplyIntent";
import { extractPrimaryInboundWhatsAppMessage } from "@/lib/whatsapp/inboundMetaPayload";
import { tryHandleCleanerAssignedBookingWhatsAppReply } from "@/lib/whatsapp/handleCleanerAssignedBookingReply";
import { southAfricaPhoneLookupVariants } from "@/lib/utils/phone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizePhone(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .replace(/[^\d+]/g, "");
}

/** All stored / inbound variants to match Meta `from` vs DB `+27…` / `0…` / digits. */
function uniquePhoneMatchValues(senderNormalized: string): string[] {
  const set = new Set<string>();
  for (const v of southAfricaPhoneLookupVariants(senderNormalized)) {
    if (v) set.add(v);
  }
  if (senderNormalized) set.add(senderNormalized);
  return [...set];
}

/** Meta WhatsApp Cloud API webhook verification (GET). Plain-text challenge only — not JSON. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim() ?? "";

  if (
    mode === "subscribe" &&
    expected.length > 0 &&
    token === expected &&
    challenge != null
  ) {
    return new Response(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return new Response("Forbidden", { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

/**
 * Meta WhatsApp Cloud webhook: delivery status updates (`whatsapp_logs`, `whatsapp_queue`) + inbound cleaner replies.
 * Production: requires `WHATSAPP_APP_SECRET` and valid signature. Non-production: missing secret → warn and skip verify (dev UX only).
 * **403** = bad signature; **400** = unreadable/invalid body. **200** for successful processing.
 */
export async function POST(request: Request) {
  let rawBody = "";
  try {
    rawBody = await request.text();
  } catch (err) {
    await logSystemEvent({
      level: "warn",
      source: "whatsapp_webhook",
      message: "Failed to read webhook body",
      context: { error: err instanceof Error ? err.message : String(err) },
    });
    return new Response("bad request", { status: 400 });
  }

  const appSecret = process.env.WHATSAPP_APP_SECRET?.trim();
  if (appSecret) {
    const sig = request.headers.get("x-hub-signature-256");
    if (!verifyMetaWebhookSignature(rawBody, sig, appSecret)) {
      return new Response("forbidden", { status: 403 });
    }
  } else if (process.env.NODE_ENV === "production") {
    throw new Error("WhatsApp webhook misconfigured: missing WHATSAPP_APP_SECRET");
  } else {
    await logSystemEvent({
      level: "warn",
      source: "whatsapp_webhook",
      message:
        "WHATSAPP_APP_SECRET not set (non-production) — processing webhook without signature verification; unsafe for real traffic",
    });
  }

  try {
    let payload: unknown = null;
    try {
      payload = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      await logSystemEvent({
        level: "warn",
        source: "whatsapp_webhook",
        message: "Invalid JSON webhook body",
      });
      return new Response("invalid json", { status: 400 });
    }

    const admin = getSupabaseAdmin();
    await recordWhatsAppDeliveryStatuses(admin, payload);

    if (!admin) {
      return NextResponse.json({ received: true });
    }

    const inbound = extractPrimaryInboundWhatsAppMessage(payload);
    const from = normalizePhone(inbound.from);

    const reply = normalizeCleanerReplyText(inbound.body);

    if (!from || !reply) {
      return NextResponse.json({ received: true });
    }

    const variants = uniquePhoneMatchValues(from);
    let cleanerId = "";
    for (const col of ["phone_number", "phone"] as const) {
      const { data: cleaner, error } = await admin
        .from("cleaners")
        .select("id, phone_number")
        .in(col, variants)
        .limit(1)
        .maybeSingle();
      if (error) {
        await logSystemEvent({
          level: "warn",
          source: "whatsapp_webhook_lookup_error",
          message: error.message,
          context: { column: col, variant_count: variants.length },
        });
        continue;
      }
      const id = String((cleaner as { id?: string } | null)?.id ?? "");
      if (id) {
        cleanerId = id;
        break;
      }
    }

    if (!cleanerId) {
      await logSystemEvent({
        level: "warn",
        source: "whatsapp_webhook_unknown_sender",
        message: "Inbound WhatsApp from unknown cleaner phone",
        context: { senderPhone: from, variants_tried: variants.slice(0, 8) },
      });
      return NextResponse.json({ received: true });
    }

    const assignedBookingReply = await tryHandleCleanerAssignedBookingWhatsAppReply(
      admin,
      cleanerId,
      inbound.body,
      {
        contextMessageId: inbound.contextMessageId,
        inboundMessageId: inbound.messageId,
        cleanerPhoneDigits: from,
      },
    );
    if (assignedBookingReply.handled) {
      return NextResponse.json({ received: true });
    }

    const wantsDecline = isDispatchOfferDeclineReply(reply);
    const wantsAccept = isDispatchOfferAcceptReply(reply);
    if (!wantsDecline && !wantsAccept) {
      return NextResponse.json({ received: true });
    }

    const resolved = await resolveDispatchOfferForCleanerReply({
      supabase: admin,
      cleanerId,
      contextMessageId: inbound.contextMessageId,
    });
    const offerId = resolved?.offerId ?? "";
    const bookingId = resolved?.bookingId ?? "";
    if (!offerId) {
      if (inbound.contextMessageId && (wantsAccept || wantsDecline)) {
        await logSystemEvent({
          level: "info",
          source: "whatsapp_dispatch_offer_unresolved",
          message: "No pending dispatch offer matched cleaner reply (expired, wrong thread, or ambiguous)",
          context: {
            cleanerId,
            contextMessageId: inbound.contextMessageId,
            reply,
            wantsAccept,
            wantsDecline,
          },
        });
      }
      return NextResponse.json({ received: true });
    }

    if (wantsDecline) {
      const result = await rejectDispatchOffer({ supabase: admin, offerId, cleanerId });
      if (!result.ok) {
        return NextResponse.json({ received: true });
      }
      if (bookingId) {
        await reassignBookingAfterDecline(admin, bookingId);
      }
      await logSystemEvent({
        level: "info",
        source: "cleaner_offer_declined",
        message: "Cleaner declined dispatch offer via WhatsApp",
        context: { bookingId, offerId, cleanerId, from, reply },
      });
      return NextResponse.json({ received: true });
    }

    const result: AcceptDispatchOfferResult = await acceptDispatchOffer({ supabase: admin, offerId, cleanerId });
    if (!result.ok) {
      if (result.failure === "booking_taken" || result.failure === "assigned_other") {
        await notifyCleanerJobAlreadyTaken({ cleanerId, bookingId: bookingId || undefined });
      }
      return NextResponse.json({ received: true });
    }
    await logSystemEvent({
      level: "info",
      source: "cleaner_offer_accepted",
      message: "Cleaner accepted dispatch offer via WhatsApp",
      context: { bookingId, offerId, cleanerId, from, reply },
    });
    return NextResponse.json({ received: true });
  } catch (err) {
    await logSystemEvent({
      level: "error",
      source: "whatsapp_webhook_post",
      message: "Unhandled webhook POST error",
      context: { error: err instanceof Error ? err.message : String(err) },
    });
    return NextResponse.json({ received: true });
  }
}
