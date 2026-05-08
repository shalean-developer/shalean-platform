import { NextResponse } from "next/server";
import { validateEventSpecificPayload } from "@/lib/analytics/eventPayloadSchemas";
import { analyticsEventIngestSchema } from "@/lib/analytics/growthPayloadSchema";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = analyticsEventIngestSchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ") || "Invalid body";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const eventType = parsed.data.event_type;
  const payload =
    parsed.data.payload && typeof parsed.data.payload === "object"
      ? (parsed.data.payload as Record<string, unknown>)
      : {};

  const strict = validateEventSpecificPayload(eventType, payload);
  if (!strict.ok) {
    return NextResponse.json({ error: strict.message }, { status: 400 });
  }

  const sessionHint =
    typeof payload.analytics_session_id === "string" && payload.analytics_session_id.trim()
      ? payload.analytics_session_id.trim()
      : typeof payload.session_id === "string" && payload.session_id.trim()
        ? payload.session_id.trim()
        : null;

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
    payload: {
      ...payload,
      ingest_source: "growth_engine",
      ...(sessionHint ? { analytics_session_id: sessionHint } : {}),
    },
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
