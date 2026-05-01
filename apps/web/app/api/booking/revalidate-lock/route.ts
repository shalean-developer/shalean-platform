import { NextResponse } from "next/server";
import { runBookingLockValidation } from "@/lib/booking/runBookingLockValidation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Pre-payment server revalidation (same rules as POST /api/booking/validate).
 * Body: `{ bookingDraft?: {...}, locked?: {...} }` — merged into a single validate payload.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, valid: false, reason: "bad_json" }, { status: 400 });
  }

  const draft = isRecord(body.bookingDraft) ? body.bookingDraft : {};
  const locked = isRecord(body.locked) ? body.locked : null;
  const merged: Record<string, unknown> = { ...draft, ...(locked ? { locked } : {}) };

  const result = await runBookingLockValidation(merged);
  if (!result.valid) {
    return NextResponse.json(
      { ok: false, valid: false, reason: result.reason },
      { status: "httpStatus" in result ? result.httpStatus : 400 },
    );
  }
  return NextResponse.json({ ok: true, valid: true, reason: "reason" in result ? result.reason : undefined });
}
