import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { validateEmailRecipient } from "@/lib/email/recipientSafety";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ResendWebhookEvent = {
  type: string;
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string[];
    subject?: string;
    bounce?: unknown;
    [key: string]: unknown;
  };
};

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const apiKey = process.env.RESEND_API_KEY;
  const admin = getAdmin();
  if (!secret || !apiKey || !admin) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const svixId = request.headers.get("svix-id")?.trim();
  const svixTimestamp = request.headers.get("svix-timestamp")?.trim();
  const svixSignature = request.headers.get("svix-signature")?.trim();
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "Missing signature headers" }, { status: 400 });
  }

  const payload = await request.text();
  let event: ResendWebhookEvent;
  try {
    const resend = new Resend(apiKey);
    event = resend.webhooks.verify({
      payload,
      headers: {
        id: svixId,
        timestamp: svixTimestamp,
        signature: svixSignature,
      },
      webhookSecret: secret,
    }) as unknown as ResendWebhookEvent;
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const firstRecipient = event.data?.to?.[0] ?? "";
  const recipientResult = validateEmailRecipient(firstRecipient);
  const recipientEmail = recipientResult.allowed ? recipientResult.normalized : null;

  const { error: eventError } = await admin.from("email_delivery_events").insert({
    svix_id: svixId,
    event_type: event.type,
    resend_email_id: event.data?.email_id ?? null,
    recipient_email: recipientEmail,
    subject: event.data?.subject ?? null,
    event_created_at: event.created_at ?? null,
    payload: event,
  });

  if (eventError && eventError.code !== "23505") {
    return NextResponse.json({ error: "Failed to record event" }, { status: 500 });
  }

  if (eventError?.code === "23505") {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const suppressionReason =
    event.type === "email.bounced"
      ? "bounced"
      : event.type === "email.complained"
        ? "complained"
        : event.type === "email.suppressed"
          ? "suppressed"
          : null;

  if (suppressionReason && recipientEmail) {
    const { error: suppressionError } = await admin.from("email_suppressions").upsert(
      {
        email: recipientEmail,
        reason: suppressionReason,
        resend_email_id: event.data?.email_id ?? null,
        source_event_type: event.type,
        details: event.data?.bounce ?? {},
        suppressed_at: event.created_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "email" },
    );
    if (suppressionError) {
      return NextResponse.json({ error: "Failed to update suppression" }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
