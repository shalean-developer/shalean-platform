import { NextResponse } from "next/server";
import { verifyMetaWebhookSignature } from "@/lib/dispatch/metaWhatsAppSend";
import { acceptDispatchOffer, rejectDispatchOffer } from "@/lib/dispatch/dispatchOffers";
import { reassignBookingAfterDecline } from "@/lib/booking/reassignBookingAfterDecline";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { recordWhatsAppDeliveryStatuses } from "@/lib/whatsapp/deliveryWebhook";
import {
  isAssignedBookingAcceptReply,
  isAssignedBookingDeclineReply,
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

function offerReplyIntent(actionLower: string): "ACCEPT" | "DECLINE" | null {
  if (actionLower.includes("accept")) return "ACCEPT";
  if (actionLower.includes("decline")) return "DECLINE";
  return null;
}

/**
 * Meta WhatsApp Cloud webhook: delivery status updates (`whatsapp_logs`, `whatsapp_queue`) + inbound cleaner replies.
 * Returns **200** for valid/signed payloads so Meta does not retry; **403** only for invalid signature when secret is configured.
 */
export async function POST(request: Request) {
  const appSecret = process.env.WHATSAPP_APP_SECRET?.trim();

  if (process.env.NODE_ENV === "production" && !appSecret) {
    await logSystemEvent({
      level: "error",
      source: "whatsapp_webhook",
      message: "WHATSAPP_APP_SECRET missing in production — webhook processing skipped",
    });
    return NextResponse.json({ received: true });
  }

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
    return NextResponse.json({ received: true });
  }

  if (appSecret) {
    const sig = request.headers.get("x-hub-signature-256");
    if (!verifyMetaWebhookSignature(rawBody, sig, appSecret)) {
      return new Response("forbidden", { status: 403 });
    }
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
      return NextResponse.json({ received: true });
    }

    const admin = getSupabaseAdmin();
    await recordWhatsAppDeliveryStatuses(admin, payload);

    if (!admin) {
      return NextResponse.json({ received: true });
    }

    const inbound = extractPrimaryInboundWhatsAppMessage(payload);
    const from = normalizePhone(inbound.from);
    const text = String(inbound.body ?? "").trim().toLowerCase();
    const action = text;

    console.log("[WhatsApp Incoming]", { from, action });

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

    const { data: offer } = await admin
      .from("dispatch_offers")
      .select("id, booking_id, cleaner_id, status")
      .eq("cleaner_id", cleanerId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const offerId = String((offer as { id?: string } | null)?.id ?? "");
    const bookingId = String((offer as { booking_id?: string } | null)?.booking_id ?? "");
    if (!offerId) {
      return NextResponse.json({ received: true });
    }

    const wantsDecline = offerReplyIntent(action) === "DECLINE" || isAssignedBookingDeclineReply(reply);
    const wantsAccept = offerReplyIntent(action) === "ACCEPT" || isAssignedBookingAcceptReply(reply);
    if (!wantsDecline && !wantsAccept) {
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
        context: { bookingId, offerId, cleanerId, from, action },
      });
      return NextResponse.json({ received: true });
    }

    const result = await acceptDispatchOffer({ supabase: admin, offerId, cleanerId });
    if (!result.ok) {
      return NextResponse.json({ received: true });
    }
    await logSystemEvent({
      level: "info",
      source: "cleaner_offer_accepted",
      message: "Cleaner accepted dispatch offer via WhatsApp",
      context: { bookingId, offerId, cleanerId, from, action },
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
