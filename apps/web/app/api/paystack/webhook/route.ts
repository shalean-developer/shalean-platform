import crypto from "crypto";
import { NextResponse } from "next/server";
import { enqueueFailedJob } from "@/lib/booking/failedJobs";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import { parseBookingSnapshot } from "@/lib/booking/paystackChargeTypes";
import { normalizePaystackMetadata } from "@/lib/booking/paystackMetadata";
import { upsertBookingFromPaystack } from "@/lib/booking/upsertBookingFromPaystack";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  buildBookingEmailPayload,
  sendAdminNewBookingEmail,
  sendBookingConfirmationEmail,
} from "@/lib/email/sendBookingEmail";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    return NextResponse.json({ error: "Paystack not configured." }, { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature");

  const hash = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");

  if (!signature || hash !== signature) {
    await reportOperationalIssue("warn", "paystack/webhook", "Invalid or missing Paystack signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: { event?: string; data?: Record<string, unknown> };
  try {
    event = JSON.parse(rawBody) as { event?: string; data?: Record<string, unknown> };
  } catch {
    await reportOperationalIssue("warn", "paystack/webhook", "Invalid JSON body");
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  await logSystemEvent({
    level: "info",
    source: "paystack/webhook",
    message: "Webhook hit (signature verified)",
    context: { event: event.event ?? null },
  });

  console.log("[paystack/webhook] event:", event.event);

  if (event.event !== "charge.success" || !event.data) {
    return NextResponse.json({ received: true });
  }

  const data = event.data;
  const reference =
    typeof data.reference === "string"
      ? data.reference
      : typeof (data as { reference?: unknown }).reference === "string"
        ? String((data as { reference: string }).reference)
        : "";

  if (!reference) {
    await reportOperationalIssue("warn", "paystack/webhook", "charge.success missing reference");
    return NextResponse.json({ received: true });
  }

  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data: existing } = await supabase
      .from("bookings")
      .select("id")
      .eq("paystack_reference", reference)
      .maybeSingle();
    if (existing && typeof existing === "object" && "id" in existing) {
      return new Response("Already processed", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
  }

  const amount = typeof data.amount === "number" ? data.amount : 0;
  const currency = typeof data.currency === "string" ? data.currency : "ZAR";

  const customerBlock = data.customer as { email?: string } | undefined;
  const emailFromCustomer = typeof customerBlock?.email === "string" ? customerBlock.email.trim() : "";

  const metadata = normalizePaystackMetadata(data.metadata);
  const { snapshot } = parseBookingSnapshot(metadata, { amountCents: amount });

  const emailRaw =
    emailFromCustomer ||
    (typeof metadata.customer_email === "string" ? metadata.customer_email : "") ||
    "";
  const email = emailRaw ? normalizeEmail(emailRaw) : "";

  if (!email) {
    await reportOperationalIssue("warn", "paystack/webhook", "No customer email on charge.success", { reference });
  }

  const result = await upsertBookingFromPaystack({
    paystackReference: reference,
    amountCents: amount,
    currency,
    customerEmail: email,
    snapshot,
    paystackMetadata: metadata,
  });

  if (result.error) {
    await reportOperationalIssue("error", "paystack/webhook", `upsert failed: ${result.error}`, { reference });
    await enqueueFailedJob("booking_insert", {
      paystackReference: reference,
      amountCents: amount,
      currency,
      customerEmail: email,
      snapshot,
      paystackMetadata: metadata,
    });
  }

  if (!result.skipped && email) {
    const payload = buildBookingEmailPayload({
      paymentReference: reference,
      amountCents: amount,
      customerEmail: email,
      snapshot,
    });
    const cust = await sendBookingConfirmationEmail(payload);
    if (!cust.sent && cust.error) {
      await reportOperationalIssue("error", "paystack/webhook", `confirmation email not sent: ${cust.error}`, {
        reference,
      });
    }
    await sendAdminNewBookingEmail(payload);
  }

  return NextResponse.json({ received: true });
}
