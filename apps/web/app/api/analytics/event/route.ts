import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** Must stay in sync with `public.user_events` check constraint and client `GrowthEventType`. */
const ALLOWED = new Set([
  "page_view",
  "start_booking",
  "view_price",
  "select_time",
  "complete_booking",
  "cleaners_loaded",
  "times_loaded",
  "price_calculated",
  "booking_started",
  "booking_completed",
  "booking_upsell_interaction",
  "homepage_continue_booking",
  "homepage_cta_click",
  "homepage_service_select",
  "pricing_loaded",
  "homepage_abandon",
  "homepage_scroll",
  "price_updated",
  "review_prompt_clicked",
  "payment_initiated",
  "payment_completed",
]);

export async function POST(request: Request) {
  let body: { event_type?: unknown; payload?: unknown };
  try {
    body = (await request.json()) as { event_type?: unknown; payload?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const eventType = typeof body.event_type === "string" ? body.event_type.trim() : "";
  if (!ALLOWED.has(eventType)) {
    return NextResponse.json({ error: "Invalid event_type." }, { status: 400 });
  }

  const payload =
    body.payload && typeof body.payload === "object" ? (body.payload as Record<string, unknown>) : {};

  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const bookingIdFromPayload =
    typeof payload.booking_id === "string" && UUID_RE.test(payload.booking_id.trim())
      ? payload.booking_id.trim()
      : null;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { error } = await admin.from("user_events").insert({
    user_id: null,
    booking_id: bookingIdFromPayload,
    event_type: eventType,
    payload: { ...payload, ingest_source: "growth_engine" },
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
