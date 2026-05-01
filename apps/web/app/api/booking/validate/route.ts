import { NextResponse } from "next/server";
import { runBookingLockValidation } from "@/lib/booking/runBookingLockValidation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Pre-pay: same cleaner has no overlapping `pending` / `confirmed` booking on that date.
 * Does not re-run roster / availability — avoids false negatives from format or engine drift.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ valid: false, reason: "bad_json" }, { status: 400 });
  }

  const result = await runBookingLockValidation(body);
  if (result.valid) {
    return NextResponse.json({ valid: true, reason: "reason" in result ? result.reason : undefined });
  }
  const status = "httpStatus" in result ? result.httpStatus : 400;
  return NextResponse.json({ valid: false, reason: result.reason }, { status });
}
