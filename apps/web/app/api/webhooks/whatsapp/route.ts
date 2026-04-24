import { NextResponse } from "next/server";
import { acceptDispatchOffer, rejectDispatchOffer } from "@/lib/dispatch/dispatchOffers";
import { ensureBookingAssignment } from "@/lib/dispatch/ensureBookingAssignment";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizePhone(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .replace(/[^\d+]/g, "");
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

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const expectedSecret = process.env.WHATSAPP_WEBHOOK_SECRET?.trim();
  if (expectedSecret) {
    const got = request.headers.get("x-webhook-secret")?.trim() ?? "";
    if (got !== expectedSecret) {
      return NextResponse.json({ error: "Unauthorized webhook." }, { status: 401 });
    }
  }

  const { from, body } = extractFromAndBody(payload);
  const senderPhone = normalizePhone(from);
  const reply = body.trim().toLowerCase();

  if (!senderPhone || !reply) {
    return NextResponse.json({ ok: true, ignored: "missing phone or body" });
  }

  const { data: cleaner } = await admin
    .from("cleaners")
    .select("id, phone_number")
    .eq("phone_number", senderPhone)
    .maybeSingle();
  const cleanerId = String((cleaner as { id?: string } | null)?.id ?? "");
  if (!cleanerId) {
    await logSystemEvent({
      level: "warn",
      source: "whatsapp_webhook_unknown_sender",
      message: "Inbound WhatsApp from unknown cleaner phone",
      context: { senderPhone },
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
    // `ux_variant` is read from `dispatch_offers` in `acceptDispatchOffer` (cross-channel parity).
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
