import { NextResponse } from "next/server";
import { verifyMetaWebhookSignature } from "@/lib/dispatch/metaWhatsAppSend";
import { acceptDispatchOffer, rejectDispatchOffer } from "@/lib/dispatch/dispatchOffers";
import { ensureBookingAssignment } from "@/lib/dispatch/ensureBookingAssignment";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { recordWhatsAppDeliveryStatuses } from "@/lib/whatsapp/deliveryWebhook";
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

function extractFromAndBody(payload: unknown): { from: string; body: string } {
  const p = (payload ?? {}) as Record<string, unknown>;
  const fromTop = String(p.from ?? "");
  const bodyTop = String(p.body ?? p.message ?? "");
  if (fromTop || bodyTop) return { from: fromTop, body: bodyTop };

  const entry = Array.isArray((p as { entry?: unknown[] }).entry) ? (p as { entry: unknown[] }).entry[0] : undefined;
  const changes = entry && typeof entry === "object" ? (entry as { changes?: unknown[] }).changes : undefined;
  const change0 = Array.isArray(changes) ? changes[0] : undefined;
  const value = change0 && typeof change0 === "object" ? (change0 as { value?: Record<string, unknown> }).value : undefined;
  const msg0 = Array.isArray(value?.messages) ? (value?.messages?.[0] as Record<string, unknown> | undefined) : undefined;
  const from = String(msg0?.from ?? "");
  const body = String(((msg0?.text as { body?: string } | undefined)?.body ?? ""));
  return { from, body };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge ?? "ok", { status: 200 });
  }
  return new Response("forbidden", { status: 403 });
}

export async function POST(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  if (process.env.NODE_ENV === "production" && !process.env.WHATSAPP_APP_SECRET?.trim()) {
    return NextResponse.json(
      { error: "WHATSAPP_APP_SECRET is required in production for webhook verification." },
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  const appSecret = process.env.WHATSAPP_APP_SECRET?.trim();
  if (appSecret) {
    const sig = request.headers.get("x-hub-signature-256");
    if (!verifyMetaWebhookSignature(rawBody, sig, appSecret)) {
      return NextResponse.json({ error: "Invalid signature." }, { status: 403 });
    }
  }

  let payload: unknown;
  try {
    payload = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  await recordWhatsAppDeliveryStatuses(admin, payload);

  const { from, body } = extractFromAndBody(payload);
  const senderPhone = normalizePhone(from);
  const reply = body.trim().toLowerCase();

  if (!senderPhone || !reply) {
    return NextResponse.json({ ok: true, ignored: "missing phone or body" });
  }

  const variants = uniquePhoneMatchValues(senderPhone);
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
      context: { senderPhone, variants_tried: variants.slice(0, 8) },
    });
    return NextResponse.json({ ok: true, ignored: "unknown sender" });
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
    return NextResponse.json({ ok: true, ignored: "no pending offer" });
  }

  if (reply === "1" || reply === "accept") {
    const result = await acceptDispatchOffer({ supabase: admin, offerId, cleanerId });
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, action: "accepted", offerId });
  }

  if (reply === "2" || reply === "decline" || reply === "reject") {
    const result = await rejectDispatchOffer({ supabase: admin, offerId, cleanerId });
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }
    if (bookingId) {
      await ensureBookingAssignment(admin, bookingId, {
        source: "whatsapp_offer_decline",
        retryEscalation: 1,
      });
    }
    return NextResponse.json({ ok: true, action: "declined", offerId });
  }

  return NextResponse.json({ ok: true, ignored: "unsupported reply" });
}
