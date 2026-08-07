import { NextResponse } from "next/server";
import { verifyMetaWebhookSignature } from "@/lib/dispatch/metaWhatsAppSend";
import {
  acceptBookingDispatchOffer,
  rejectDispatchOffer,
  type AcceptDispatchOfferResult,
} from "@/lib/dispatch/dispatchOffers";
import { resolveDispatchOfferForCleanerReply } from "@/lib/dispatch/resolveDispatchOfferForCleanerReply";
import { notifyCleanerJobAlreadyTaken } from "@/lib/dispatch/offerNotifications";
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
  return String(value ?? "").trim().replace(/[^\d+]/g, "");
}

function uniquePhoneMatchValues(senderNormalized: string): string[] {
  const set = new Set<string>();
  for (const v of southAfricaPhoneLookupVariants(senderNormalized)) if (v) set.add(v);
  if (senderNormalized) set.add(senderNormalized);
  return [...set];
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim() ?? "";
  if (mode === "subscribe" && expected.length > 0 && token === expected && challenge != null) {
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  return new Response("Forbidden", { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

export async function POST(request: Request) {
  let rawBody = "";
  try { rawBody = await request.text(); }
  catch (err) {
    await logSystemEvent({ level: "warn", source: "whatsapp_webhook", message: "Failed to read webhook body", context: { error: err instanceof Error ? err.message : String(err) } });
    return new Response("bad request", { status: 400 });
  }

  const appSecret = process.env.WHATSAPP_APP_SECRET?.trim();
  if (appSecret) {
    const sig = request.headers.get("x-hub-signature-256");
    if (!verifyMetaWebhookSignature(rawBody, sig, appSecret)) return new Response("forbidden", { status: 403 });
  } else if (process.env.NODE_ENV === "production") {
    throw new Error("WhatsApp webhook misconfigured: missing WHATSAPP_APP_SECRET");
  }

  try {
    let payload: unknown = null;
    try { payload = rawBody ? JSON.parse(rawBody) : null; }
    catch { return new Response("invalid json", { status: 400 }); }

    const admin = getSupabaseAdmin();
    await recordWhatsAppDeliveryStatuses(admin, payload);
    if (!admin) return NextResponse.json({ received: true });

    const inbound = extractPrimaryInboundWhatsAppMessage(payload);
    const from = normalizePhone(inbound.from);

    // Persist every real inbound message before business-specific cleaner reply handling.
    // The provider_event_id unique index makes Meta webhook retries idempotent.
    if (from && inbound.messageId) {
      await admin.from("whatsapp_provider_events").upsert({
        provider: "meta",
        provider_event_id: inbound.messageId,
        provider_message_id: inbound.messageId,
        direction: "inbound",
        phone: from,
        event_type: "message",
        payload: {
          message_id: inbound.messageId,
          from,
          body: inbound.body ?? "",
          context_message_id: inbound.contextMessageId ?? null,
        },
        processed_at: new Date().toISOString(),
      }, { onConflict: "provider,provider_event_id", ignoreDuplicates: true });
    }

    const reply = normalizeCleanerReplyText(inbound.body);
    if (!from || !reply) return NextResponse.json({ received: true });

    const variants = uniquePhoneMatchValues(from);
    let cleanerId = "";
    for (const col of ["phone_number", "phone"] as const) {
      const { data: cleaner } = await admin.from("cleaners").select("id, phone_number").in(col, variants).limit(1).maybeSingle();
      const id = String((cleaner as { id?: string } | null)?.id ?? "");
      if (id) { cleanerId = id; break; }
    }

    // Customer/unknown inbound messages are intentionally retained in the inbox even when
    // they are not cleaner commands.
    if (!cleanerId) return NextResponse.json({ received: true });

    const assignedBookingReply = await tryHandleCleanerAssignedBookingWhatsAppReply(admin, cleanerId, inbound.body, {
      contextMessageId: inbound.contextMessageId,
      inboundMessageId: inbound.messageId,
      cleanerPhoneDigits: from,
    });
    if (assignedBookingReply.handled) return NextResponse.json({ received: true });

    const wantsDecline = isDispatchOfferDeclineReply(reply);
    const wantsAccept = isDispatchOfferAcceptReply(reply);
    if (!wantsDecline && !wantsAccept) return NextResponse.json({ received: true });

    const resolved = await resolveDispatchOfferForCleanerReply({ supabase: admin, cleanerId, contextMessageId: inbound.contextMessageId });
    const offerId = resolved?.offerId ?? "";
    const bookingId = resolved?.bookingId ?? "";
    if (!offerId) return NextResponse.json({ received: true });

    if (wantsDecline) {
      const result = await rejectDispatchOffer({ supabase: admin, offerId, cleanerId });
      if (!result.ok) return NextResponse.json({ received: true });
      await logSystemEvent({ level: "info", source: "cleaner_offer_declined", message: "Cleaner declined dispatch offer via WhatsApp", context: { bookingId, offerId, cleanerId, from, reply } });
      return NextResponse.json({ received: true });
    }

    const result: AcceptDispatchOfferResult = await acceptBookingDispatchOffer({ supabase: admin, offerId, cleanerId });
    if (!result.ok) {
      if (result.failure === "booking_taken" || result.failure === "assigned_other") await notifyCleanerJobAlreadyTaken({ cleanerId, bookingId: bookingId || undefined });
      return NextResponse.json({ received: true });
    }
    await logSystemEvent({ level: "info", source: "cleaner_offer_accepted", message: "Cleaner accepted dispatch offer via WhatsApp", context: { bookingId, offerId, cleanerId, from, reply } });
    return NextResponse.json({ received: true });
  } catch (err) {
    await logSystemEvent({ level: "error", source: "whatsapp_webhook_post", message: "Unhandled webhook POST error", context: { error: err instanceof Error ? err.message : String(err) } });
    return NextResponse.json({ received: true });
  }
}
