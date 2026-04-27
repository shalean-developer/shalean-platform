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

  const result = await processPaystackInitializeBody(safeBody);
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
