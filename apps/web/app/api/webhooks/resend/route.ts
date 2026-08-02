import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { validateEmailRecipient } from "@/lib/email/recipientSafety";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ResendTag = { name?: string; value?: string };
type ResendTags = ResendTag[] | Record<string, string> | undefined;
type ResendWebhookEvent = {
  type: string;
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string[];
    subject?: string;
    bounce?: unknown;
    tags?: ResendTags;
    [key: string]: unknown;
  };
};

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function normalizeTags(input: ResendTags): Record<string, string> {
  const tags: Record<string, string> = {};
  if (Array.isArray(input)) {
    for (const tag of input) {
      if (tag?.name && tag.value) tags[tag.name] = tag.value;
    }
  } else if (input && typeof input === "object") {
    for (const [name, value] of Object.entries(input)) {
      if (typeof value === "string") tags[name] = value;
    }
  }
  return tags;
}

function uuidOrNull(value: string | undefined): string | null {
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const apiKey = process.env.RESEND_API_KEY;
  const admin = getAdmin();
  if (!secret || !apiKey || !admin) return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });

  const svixId = request.headers.get("svix-id")?.trim();
  const svixTimestamp = request.headers.get("svix-timestamp")?.trim();
  const svixSignature = request.headers.get("svix-signature")?.trim();
  if (!svixId || !svixTimestamp || !svixSignature) return NextResponse.json({ error: "Missing signature headers" }, { status: 400 });

  const payload = await request.text();
  let event: ResendWebhookEvent;
  try {
    const resend = new Resend(apiKey);
    event = resend.webhooks.verify({
      payload,
      headers: { id: svixId, timestamp: svixTimestamp, signature: svixSignature },
      webhookSecret: secret,
    }) as unknown as ResendWebhookEvent;
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const firstRecipient = event.data?.to?.[0] ?? "";
  const recipientResult = validateEmailRecipient(firstRecipient);
  const recipientEmail = recipientResult.allowed ? recipientResult.normalized : null;
  const tags = normalizeTags(event.data?.tags);

  const { error: eventError } = await admin.from("email_delivery_events").insert({
    svix_id: svixId,
    event_type: event.type,
    resend_email_id: event.data?.email_id ?? null,
    recipient_email: recipientEmail,
    subject: event.data?.subject ?? null,
    event_created_at: event.created_at ?? null,
    booking_id: uuidOrNull(tags.booking_id),
    customer_id: uuidOrNull(tags.customer_id),
    message_type: tags.message_type ?? null,
    campaign_id: tags.campaign_id ?? null,
    tags,
    payload: event,
  });

  if (eventError && eventError.code !== "23505") return NextResponse.json({ error: "Failed to record event" }, { status: 500 });
  if (eventError?.code === "23505") return NextResponse.json({ ok: true, duplicate: true });

  const suppressionReason = event.type === "email.bounced" ? "bounced" : event.type === "email.complained" ? "complained" : event.type === "email.suppressed" ? "suppressed" : null;
  if (suppressionReason && recipientEmail) {
    const { error: suppressionError } = await admin.from("email_suppressions").upsert({
      email: recipientEmail,
      reason: suppressionReason,
      resend_email_id: event.data?.email_id ?? null,
      source_event_type: event.type,
      details: event.data?.bounce ?? {},
      suppressed_at: event.created_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "email" });
    if (suppressionError) return NextResponse.json({ error: "Failed to update suppression" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
