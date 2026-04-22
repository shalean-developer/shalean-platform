import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const ALLOWED = new Set([
  "slot_selected",
  "extra_added",
  "recommendation_clicked",
  "times_loaded",
  "price_calculated",
]);

/**
 * Persists assistant UX events to `user_events` (service role) for future ML / funnel analysis.
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) {
    return NextResponse.json({ error: "Missing authorization." }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const pub = createClient(url, anon);
  const {
    data: { user },
    error: userErr,
  } = await pub.auth.getUser(token);
  if (userErr || !user?.id) {
    return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
  }

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
    body.payload !== undefined && body.payload !== null && typeof body.payload === "object"
      ? (body.payload as Record<string, unknown>)
      : {};

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const { error: insErr } = await admin.from("user_events").insert({
    user_id: user.id,
    event_type: eventType,
    booking_id: null,
    payload: { ...payload, source: "booking_assistant" },
  });

  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
