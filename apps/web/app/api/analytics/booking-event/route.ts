import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const STEPS = new Set(["entry", "quote", "extras", "datetime", "details", "payment"]);
const EVENT_TYPES = new Set(["view", "next", "back", "error", "exit"]);

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

  const step = typeof body.step === "string" ? body.step.trim().toLowerCase() : "";
  if (!STEPS.has(step)) {
    return NextResponse.json({ error: "Invalid step." }, { status: 400 });
  }

  const event_type = typeof body.event_type === "string" ? body.event_type.trim().toLowerCase() : "";
  if (!EVENT_TYPES.has(event_type)) {
    return NextResponse.json({ error: "Invalid event_type." }, { status: 400 });
  }

  const metadata = clampMetadata(body.metadata);

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { error } = await admin.from("booking_events").insert({
    session_id,
    step,
    event_type,
    metadata,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
