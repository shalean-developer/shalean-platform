import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { southAfricaPhoneLookupVariants } from "@/lib/utils/phone";
import {
  isDispatchOfferAcceptReply,
  isDispatchOfferDeclineReply,
  normalizeCleanerReplyText,
} from "@/lib/booking/cleanerReplyIntent";
import { tryHandleCleanerAssignedBookingWhatsAppReply } from "@/lib/whatsapp/handleCleanerAssignedBookingReply";
import { resolveDispatchOfferForCleanerReply } from "@/lib/dispatch/resolveDispatchOfferForCleanerReply";
import { acceptBookingDispatchOffer, rejectDispatchOffer } from "@/lib/dispatch/dispatchOffers";
import { notifyCleanerJobAlreadyTaken } from "@/lib/dispatch/offerNotifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Obj = Record<string, unknown>;

function asObj(value: unknown): Obj | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Obj : null;
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function nested(obj: Obj, key: string): Obj {
  return asObj(obj[key]) ?? {};
}

function normalizePhone(value: string): string {
  return value.replace(/\D/g, "");
}

function eventId(payload: Obj): string {
  const data = nested(payload, "data");
  const message = nested(payload, "message");
  return firstString(
    payload.event_id, payload.eventId,
    payload.webhook_id, payload.webhookId,
    data.event_id, data.eventId,
    message.event_id, message.eventId,
    payload.id,
  );
}

function messageId(payload: Obj): string {
  const data = nested(payload, "data");
  const message = nested(payload, "message");
  return firstString(
    payload.message_id, payload.messageId,
    data.message_id, data.messageId,
    message.message_id, message.messageId,
    message.id,
  );
}

function eventType(payload: Obj): string {
  const data = nested(payload, "data");
  return firstString(payload.event, payload.event_type, payload.eventType, payload.type, data.event, data.type).toLowerCase();
}

function statusValue(payload: Obj): string {
  const data = nested(payload, "data");
  const message = nested(payload, "message");
  return firstString(payload.status, data.status, message.status).toLowerCase();
}

function senderPhone(payload: Obj): string {
  const data = nested(payload, "data");
  const message = nested(payload, "message");
  const sender = nested(payload, "sender");
  const contact = nested(payload, "contact");
  return normalizePhone(firstString(
    payload.from, payload.phone, payload.sender_phone, payload.senderPhone,
    data.from, data.phone, data.sender_phone, data.senderPhone,
    message.from, message.phone,
    sender.phone, sender.wa_id, contact.phone, contact.wa_id,
  ));
}

function inboundBody(payload: Obj): string {
  const data = nested(payload, "data");
  const message = nested(payload, "message");
  const button = nested(payload, "button");
  const reply = nested(payload, "reply");
  const interactive = nested(payload, "interactive");
  return firstString(
    payload.body, payload.text, payload.message_text, payload.messageText,
    data.body, data.text, data.message,
    message.body, message.text,
    button.payload, button.id, button.text,
    reply.payload, reply.id, reply.text,
    interactive.button_reply, interactive.list_reply,
  );
}

function contextMessageId(payload: Obj): string {
  const data = nested(payload, "data");
  const message = nested(payload, "message");
  const context = nested(payload, "context");
  return firstString(
    payload.context_message_id, payload.contextMessageId,
    data.context_message_id, data.contextMessageId,
    message.context_message_id, message.contextMessageId,
    context.message_id, context.messageId, context.id,
  );
}

function isStatusEvent(type: string, status: string): boolean {
  return Boolean(status) || /status|delivery|delivered|read|failed|sent/.test(type);
}

function mapDeliveryStatus(type: string, status: string): "sent" | "delivered" | "read" | "failed" | null {
  const value = `${type} ${status}`.toLowerCase();
  if (value.includes("read")) return "read";
  if (value.includes("deliver")) return "delivered";
  if (value.includes("fail") || value.includes("error")) return "failed";
  if (value.includes("sent")) return "sent";
  return null;
}

function verifyRequest(request: Request): boolean {
  const expected = process.env.FLAXXA_WEBHOOK_SECRET?.trim();
  if (!expected) return process.env.NODE_ENV !== "production";
  const headerName = process.env.FLAXXA_WEBHOOK_SECRET_HEADER?.trim() || "x-webhook-secret";
  const header = request.headers.get(headerName);
  const query = new URL(request.url).searchParams.get("token");
  return header === expected || query === expected;
}

async function findCleanerId(admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>, phone: string): Promise<string> {
  const variants = Array.from(new Set([...southAfricaPhoneLookupVariants(phone), phone].filter(Boolean)));
  for (const column of ["phone_number", "phone"] as const) {
    const { data } = await admin.from("cleaners").select("id").in(column, variants).limit(1).maybeSingle();
    const id = String((data as { id?: unknown } | null)?.id ?? "");
    if (id) return id;
  }
  return "";
}

async function recordConsent(admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>, phone: string, reply: string, payload: Obj) {
  const normalized = reply.trim().toUpperCase();
  if (normalized !== "YES" && normalized !== "STOP") return false;
  const now = new Date().toISOString();
  const granted = normalized === "YES";
  await admin.from("whatsapp_marketing_consent").upsert({
    phone,
    status: granted ? "granted" : "opted_out",
    source: "flaxxa",
    granted_at: granted ? now : null,
    opted_out_at: granted ? null : now,
    evidence: payload,
    updated_at: now,
  }, { onConflict: "phone" });
  return true;
}

async function processCleanerReply(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  cleanerId: string,
  phone: string,
  body: string,
  providerMessageId: string,
  contextId: string,
) {
  const assigned = await tryHandleCleanerAssignedBookingWhatsAppReply(admin, cleanerId, body, {
    contextMessageId: contextId || undefined,
    inboundMessageId: providerMessageId || undefined,
    cleanerPhoneDigits: phone,
  });
  if (assigned.handled) return;

  const reply = normalizeCleanerReplyText(body);
  const wantsAccept = isDispatchOfferAcceptReply(reply);
  const wantsDecline = isDispatchOfferDeclineReply(reply);
  if (!wantsAccept && !wantsDecline) return;

  if (!contextId) {
    await logSystemEvent({
      level: "warn",
      source: "flaxxa_cleaner_reply_missing_context",
      message: "Ignored ambiguous cleaner accept/decline without a provider reply-context id",
      context: { cleanerId, phone_tail: phone.slice(-4), reply },
    });
    return;
  }

  const resolved = await resolveDispatchOfferForCleanerReply({ supabase: admin, cleanerId, contextMessageId: contextId });
  if (!resolved?.offerId) return;

  if (wantsDecline) {
    await rejectDispatchOffer({ supabase: admin, offerId: resolved.offerId, cleanerId });
    return;
  }
  const accepted = await acceptBookingDispatchOffer({ supabase: admin, offerId: resolved.offerId, cleanerId });
  if (!accepted.ok && (accepted.failure === "booking_taken" || accepted.failure === "assigned_other")) {
    await notifyCleanerJobAlreadyTaken({ cleanerId, bookingId: resolved.bookingId || undefined });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, provider: "flaxxa", endpoint: "whatsapp-webhook" });
}

export async function POST(request: Request) {
  if (!verifyRequest(request)) return new Response("forbidden", { status: 403 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  let payload: Obj;
  try {
    const parsed = await request.json();
    payload = asObj(parsed) ?? {};
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  const type = eventType(payload);
  const status = statusValue(payload);
  const providerMessageId = messageId(payload);
  const providerEventId = eventId(payload) || [type, providerMessageId, status].filter(Boolean).join(":") || null;
  const phone = senderPhone(payload);
  const body = inboundBody(payload);
  const direction = isStatusEvent(type, status) ? "status" : "inbound";

  if (providerEventId) {
    const { error } = await admin.from("whatsapp_provider_events").insert({
      provider: "flaxxa",
      provider_event_id: providerEventId,
      provider_message_id: providerMessageId || null,
      direction,
      phone: phone || null,
      event_type: type || null,
      payload,
    });
    if (error && String((error as { code?: unknown }).code ?? "") === "23505") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    if (error) {
      await logSystemEvent({ level: "warn", source: "flaxxa_webhook_event_log", message: error.message });
    }
  }

  if (direction === "status") {
    const mapped = mapDeliveryStatus(type, status);
    if (mapped && providerMessageId) {
      const now = new Date().toISOString();
      const patch: Obj = { delivery_status: mapped, updated_at: now };
      if (mapped === "delivered") patch.delivered_at = now;
      if (mapped === "read") patch.read_at = now;
      if (mapped === "failed") patch.failed_at = now;
      await admin.from("whatsapp_queue")
        .update(patch)
        .eq("provider", "flaxxa")
        .eq("provider_message_id", providerMessageId);
    }
  } else if (phone && body) {
    const cleanerId = await findCleanerId(admin, phone);
    if (cleanerId) {
      await processCleanerReply(admin, cleanerId, phone, body, providerMessageId, contextMessageId(payload));
    } else {
      await recordConsent(admin, phone, body, payload);
    }
  }

  if (providerEventId) {
    await admin.from("whatsapp_provider_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("provider", "flaxxa")
      .eq("provider_event_id", providerEventId);
  }
  return NextResponse.json({ received: true });
}
