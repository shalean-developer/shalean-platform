/**
 * Paystack **transfer** webhooks (cleaner payout rail) — not checkout finalization.
 * Checkout `charge.success` / `charge.failed` → `POST /api/paystack/webhook` only.
 * See `lib/booking/paystackRouteResponsibilityContract.ts`.
 */
import crypto from "crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { applyTransferFailed, applyTransferSuccess } from "@/lib/payout/paystackTransferStatus";

export const runtime = "nodejs";

function verifyPaystackSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.PAYSTACK_SECRET_KEY ?? "";
  if (!secret) {
    console.warn("[webhooks/paystack] PAYSTACK_SECRET_KEY not set — skipping signature verification");
    return process.env.NODE_ENV !== "production";
  }
  const hash = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
  return hash === signature;
}

type PaystackWebhookEvent = {
  event: string;
  data?: {
    reference?: string;
    transfer_code?: string;
    reason?: string;
    [key: string]: unknown;
  };
};

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature") ?? "";

  if (!verifyPaystackSignature(rawBody, signature)) {
    console.warn("[webhooks/paystack] Invalid signature — rejecting");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: PaystackWebhookEvent;
  try {
    event = JSON.parse(rawBody) as PaystackWebhookEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Service temporarily unavailable" }, { status: 503 });
  }

  const eventName = String(event.event ?? "").trim();

  if (eventName === "charge.success" || eventName === "charge.failed") {
    void logSystemEvent({
      level: "warn",
      source: "webhooks_paystack",
      message: "charge_event_ignored_use_canonical_webhook",
      context: {
        event: eventName,
        reference: String(event.data?.reference ?? "").trim() || null,
        hint: "Configure Paystack to POST charge events to /api/paystack/webhook",
      },
    });
    return NextResponse.json({
      ok: true,
      ignored: true,
      message: "Charge events are handled by /api/paystack/webhook",
    });
  }

  if (eventName === "transfer.success") {
    try {
      const result = await applyTransferSuccess(admin, event.data ?? {}, event);
      void logSystemEvent({
        level: "info",
        source: "webhooks_paystack",
        message: "transfer_success_processed",
        context: { transfer_code: event.data?.transfer_code ?? null, result },
      });
      return NextResponse.json({ ok: true, result });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      void logSystemEvent({
        level: "error",
        source: "webhooks_paystack",
        message: "transfer_success_failed",
        context: { transfer_code: event.data?.transfer_code ?? null, error: msg },
      });
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  if (eventName === "transfer.failed") {
    try {
      const result = await applyTransferFailed(admin, event.data ?? {}, event);
      void logSystemEvent({
        level: "warn",
        source: "webhooks_paystack",
        message: "transfer_failed_processed",
        context: { transfer_code: event.data?.transfer_code ?? null, result },
      });
      return NextResponse.json({ ok: true, result });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      void logSystemEvent({
        level: "error",
        source: "webhooks_paystack",
        message: "transfer_failed_handler_error",
        context: { transfer_code: event.data?.transfer_code ?? null, error: msg },
      });
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, message: `Event ${eventName || "unknown"} acknowledged` });
}
