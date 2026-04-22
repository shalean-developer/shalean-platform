import { NextResponse } from "next/server";
import { parseBookingSnapshot } from "@/lib/booking/paystackChargeTypes";

type PaystackVerifyJson = {
  status?: boolean;
  data?: {
    status?: string;
    reference?: string;
    amount?: number;
    currency?: string;
    customer?: { email?: string };
    metadata?: Record<string, unknown>;
  };
  message?: string;
};

function metadataToStrings(meta: Record<string, unknown> | undefined): Record<string, string | undefined> {
  if (!meta) return {};
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (v === undefined || v === null) continue;
    out[k] = typeof v === "string" ? v : JSON.stringify(v);
  }
  return out;
}

/**
 * Verifies a Paystack transaction for display only.
 * Bookings are created by the Paystack webhook (source of truth), not this route.
 */
export async function POST(request: Request) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    return NextResponse.json({ error: "Paystack is not configured." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const reference =
    body && typeof body === "object" && typeof (body as { reference?: unknown }).reference === "string"
      ? (body as { reference: string }).reference.trim()
      : "";

  if (!reference) {
    return NextResponse.json({ error: "Missing reference." }, { status: 400 });
  }

  const verifyRes = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    { headers: { Authorization: `Bearer ${secret}` } },
  );

  const verifyJson = (await verifyRes.json()) as PaystackVerifyJson;
  if (!verifyJson.status || !verifyJson.data) {
    return NextResponse.json(
      { ok: false, error: verifyJson.message || "Verification failed." },
      { status: 400 },
    );
  }

  const tx = verifyJson.data;
  if (tx.status !== "success") {
    return NextResponse.json({ ok: false, error: "Payment was not successful.", status: tx.status }, { status: 402 });
  }

  const paystackRef = tx.reference ?? reference;
  const amountCents = typeof tx.amount === "number" ? tx.amount : 0;
  const currency = tx.currency ?? "ZAR";
  const email = tx.customer?.email ?? "";

  const { snapshot } = parseBookingSnapshot(metadataToStrings(tx.metadata as Record<string, unknown> | undefined));

  return NextResponse.json({
    ok: true,
    reference: paystackRef,
    amountCents,
    currency,
    customerEmail: email,
    bookingSnapshot: snapshot ?? null,
    note: "Booking persistence is handled by the Paystack webhook.",
  });
}
