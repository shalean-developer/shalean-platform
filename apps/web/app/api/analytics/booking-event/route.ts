import { NextResponse } from "next/server";
import { BOOKING_EVENTS_ROW_TYPES_SET, BOOKING_EVENTS_STEPS_SET } from "@/lib/analytics/bookingEventsRegistry";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function clampMetadata(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  let n = 0;
  for (const [k, v] of Object.entries(o)) {
    if (n >= 40) break;
    if (typeof k !== "string" || k.length > 64) continue;
    if (v === null || typeof v === "boolean" || typeof v === "number") {
      out[k] = v;
      n++;
      continue;
    }
    if (typeof v === "string" && v.length <= 2000) {
      out[k] = v;
      n++;
    }
  }
  return out;
}

export async function POST(request: Request) {
  let body: {
    session_id?: unknown;
    analytics_session_id?: unknown;
    step?: unknown;
    event_type?: unknown;
    metadata?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const session_id = typeof body.session_id === "string" ? body.session_id.trim().slice(0, 200) : "";
  if (!session_id) {
    return NextResponse.json({ error: "session_id required." }, { status: 400 });
  }

  const analytics_session_id_raw =
    typeof body.analytics_session_id === "string" ? body.analytics_session_id.trim().slice(0, 200) : "";
  const analytics_session_id = analytics_session_id_raw || session_id;

  const step = typeof body.step === "string" ? body.step.trim().toLowerCase() : "";
  if (!BOOKING_EVENTS_STEPS_SET.has(step)) {
    return NextResponse.json({ error: "Invalid step." }, { status: 400 });
  }

  const event_type = typeof body.event_type === "string" ? body.event_type.trim().toLowerCase() : "";
  if (!BOOKING_EVENTS_ROW_TYPES_SET.has(event_type)) {
    return NextResponse.json({ error: "Invalid event_type." }, { status: 400 });
  }

  const metadata = clampMetadata(body.metadata);

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const insertRow: Record<string, unknown> = {
    session_id,
    step,
    event_type,
    metadata,
    analytics_session_id,
  };

  const { error } = await admin.from("booking_events").insert(insertRow);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
