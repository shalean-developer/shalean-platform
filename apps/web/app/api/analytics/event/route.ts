import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const ALLOWED = new Set([
  "page_view",
  "start_booking",
  "view_price",
  "select_time",
  "complete_booking",
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

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { error } = await admin.from("user_events").insert({
    user_id: null,
    booking_id: null,
    event_type: eventType,
    payload: { ...payload, source: "growth_engine" },
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
