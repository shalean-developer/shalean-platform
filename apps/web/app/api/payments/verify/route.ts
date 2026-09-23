import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Retired legacy payment verification endpoint.
 *
 * The canonical verification/finalization HTTP path is `/api/paystack/verify`,
 * with `/api/paystack/webhook` remaining the authoritative charge-success webhook.
 * Keep this 410 tombstone so older clients fail explicitly instead of opening a
 * second booking/payment finalization path.
 */
export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "Legacy payment verification is retired. Use /api/paystack/verify.",
      errorCode: "LEGACY_PAYMENTS_VERIFY_RETIRED",
      canonicalVerifyPath: "/api/paystack/verify",
    },
    { status: 410 },
  );
}
