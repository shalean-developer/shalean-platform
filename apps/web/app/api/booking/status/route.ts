import { NextResponse } from "next/server";
import { parseBookingSnapshot, type BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type VerifyJson = {
  status?: boolean;
  message?: string;
  data?: {
    status?: string;
    reference?: string;
    amount?: number;
    currency?: string;
    customer?: { email?: string };
    metadata?: Record<string, unknown>;
  };
};

/**
 * Payment + booking status for success page polling.
 * Verifies with Paystack; optional DB row (webhook creates it).
 */
export async function GET(request: Request) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    return NextResponse.json({ error: "Paystack not configured." }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const reference = searchParams.get("reference") ?? searchParams.get("trxref");
  if (!reference) {
    return NextResponse.json({ error: "Missing reference." }, { status: 400 });
  }

  const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });

  const json = (await res.json()) as VerifyJson;

  if (!json.status || !json.data) {
    return NextResponse.json({
      paymentStatus: "unknown" as const,
      verified: false,
      error: json.message ?? "Verification failed.",
      reference,
    });
  }

  const tx = json.data;
  const payStatus = tx.status ?? "unknown";
  const paymentStatus =
    payStatus === "success"
      ? ("success" as const)
      : payStatus === "failed"
        ? ("failed" as const)
        : ("pending" as const);

  const metaObj = tx.metadata;
  const metaStrings: Record<string, string | undefined> = {};
  if (metaObj && typeof metaObj === "object" && !Array.isArray(metaObj)) {
    for (const [k, v] of Object.entries(metaObj)) {
      if (v === undefined || v === null) continue;
      metaStrings[k] = typeof v === "string" ? v : JSON.stringify(v);
    }
  }

  const { snapshot: snapshotFromMeta } = parseBookingSnapshot(metaStrings);

  const customerEmail = tx.customer?.email?.trim() ?? "";

  let bookingInDatabase = false;
  let bookingId: string | null = null;
  let bookingSnapshot: unknown = snapshotFromMeta ?? null;
  let userId: string | null = null;
  let customerName: string | null = null;
  let customerEmailOut = customerEmail;

  const snapFromMeta = snapshotFromMeta as BookingSnapshotV1 | null;
  const guestNameFromMeta = snapFromMeta?.customer?.name?.trim() || null;

  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data: row } = await supabase
      .from("bookings")
      .select("id, booking_snapshot, user_id, customer_email, customer_name")
      .eq("paystack_reference", reference)
      .maybeSingle();

    if (row && typeof row === "object") {
      bookingInDatabase = true;
      if ("id" in row) bookingId = String((row as { id: string }).id);
      const snap = (row as { booking_snapshot?: unknown }).booking_snapshot;
      if (snap != null) bookingSnapshot = snap;
      const uid = (row as { user_id?: string | null }).user_id;
      userId = uid && String(uid).trim() ? String(uid) : null;
      const cn = (row as { customer_name?: string | null }).customer_name;
      customerName = typeof cn === "string" && cn.trim() ? cn.trim() : null;
      const ce = (row as { customer_email?: string | null }).customer_email;
      if (typeof ce === "string" && ce.trim()) {
        customerEmailOut = ce.trim();
      }
    }
  }

  if (!customerName && bookingSnapshot && typeof bookingSnapshot === "object") {
    const bs = bookingSnapshot as BookingSnapshotV1;
    customerName = bs.customer?.name?.trim() || guestNameFromMeta;
  } else if (!customerName) {
    customerName = guestNameFromMeta;
  }

  if (!customerEmailOut && bookingSnapshot && typeof bookingSnapshot === "object") {
    const em = (bookingSnapshot as BookingSnapshotV1).customer?.email?.trim();
    if (em) customerEmailOut = em;
  }

  if (!userId && bookingSnapshot && typeof bookingSnapshot === "object") {
    const uid = (bookingSnapshot as BookingSnapshotV1).customer?.user_id;
    if (uid && String(uid).trim()) userId = String(uid);
  }

  return NextResponse.json({
    verified: true,
    paymentStatus,
    reference: tx.reference ?? reference,
    amountCents: typeof tx.amount === "number" ? tx.amount : 0,
    currency: tx.currency ?? "ZAR",
    customerEmail: customerEmailOut,
    customerName,
    userId,
    bookingSnapshot,
    bookingInDatabase,
    bookingId,
  });
}
