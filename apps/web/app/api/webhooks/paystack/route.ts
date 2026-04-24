import crypto from "crypto";
import { NextResponse } from "next/server";
import { logSystemEvent } from "@/lib/logging/systemLog";
import {
  applyTransferFailed,
  applyTransferSuccess,
  type PaystackStatusPayload,
} from "@/lib/payout/paystackTransferStatus";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hasValidSignature(body: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;

  const expected = crypto.createHmac("sha512", secret).update(body).digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const signatureBuffer = Buffer.from(signature, "hex");

  return expectedBuffer.length === signatureBuffer.length && crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
}

export async function POST(request: Request) {
  const secret = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (!secret) return NextResponse.json({ error: "PAYSTACK_SECRET_KEY is not configured." }, { status: 503 });

  const body = await request.text();
  const signature = request.headers.get("x-paystack-signature");
  if (!hasValidSignature(body, signature, secret)) {
    return new Response("Invalid signature", { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  let event: PaystackStatusPayload;
  try {
    event = JSON.parse(body) as PaystackStatusPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  try {
    let result: Record<string, unknown> = { ignored: "unsupported event" };
    if (event.event === "transfer.success") {
      result = await applyTransferSuccess(supabase, event.data ?? {}, event);
    } else if (event.event === "transfer.failed") {
      result = await applyTransferFailed(supabase, event.data ?? {}, event);
    }

    return NextResponse.json({ ok: true, event: event.event, ...result });
  } catch (error) {
    await logSystemEvent({
      level: "error",
      source: "PAYSTACK_WEBHOOK_ERROR",
      message: error instanceof Error ? error.message : "Paystack webhook failed",
      context: { event: event.event },
    });
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}
