import { NextResponse } from "next/server";
import { processPaystackInitializeBody } from "@/lib/booking/paystackInitializeCore";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;
  const { relaxedLockValidation: _relaxed, ...safeBody } = raw;
  void _relaxed;

  const forwarded = request.headers.get("x-forwarded-for");
  const clientIp =
    (typeof forwarded === "string" && forwarded.split(",")[0]?.trim()) ||
    request.headers.get("x-real-ip")?.trim() ||
    null;
  const userAgent = request.headers.get("user-agent")?.trim() || null;

  const result = await processPaystackInitializeBody(safeBody, {
    checkoutTrustSignals: { clientIp, userAgent },
  });
  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        ...(result.errorCode != null ? { errorCode: result.errorCode } : {}),
      },
      { status: result.status },
    );
  }

  return NextResponse.json({
    authorizationUrl: result.authorizationUrl,
    reference: result.reference,
    ...(result.bookingId ? { bookingId: result.bookingId } : {}),
  });
}
