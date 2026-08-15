import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { enqueueProviderWhatsApp } from "@/lib/whatsapp/providerQueue";
import { getWhatsAppProviderName } from "@/lib/whatsapp/providers";
import { logSystemEvent } from "@/lib/logging/systemLog";
import type { WhatsAppQueuePayload } from "@/lib/whatsapp/types";
import type { WhatsAppRecipientRole } from "@/lib/whatsapp/providers/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TestBody = {
  phone?: unknown;
  mode?: unknown;
  message?: unknown;
  templateName?: unknown;
  language?: unknown;
  bodyParams?: unknown;
  recipientRole?: unknown;
};

function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }

export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  let body: TestBody;
  try { body = (await request.json()) as TestBody; }
  catch { return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }); }

  const phone = text(body.phone);
  const mode = text(body.mode) === "template" ? "template" : "text";
  const recipientRole: WhatsAppRecipientRole = text(body.recipientRole) === "cleaner" ? "cleaner" : "customer";
  if (!phone) return NextResponse.json({ error: "Phone number is required." }, { status: 400 });

  let payload: WhatsAppQueuePayload;
  if (mode === "template") {
    const templateName = text(body.templateName);
    if (!templateName) return NextResponse.json({ error: "Template name is required." }, { status: 400 });
    payload = { kind: "template", templateName, language: text(body.language) || "en", bodyParams: Array.isArray(body.bodyParams) ? body.bodyParams.map(String) : [] };
  } else {
    const message = text(body.message);
    if (!message) return NextResponse.json({ error: "Message is required." }, { status: 400 });
    payload = { kind: "text", text: message.slice(0, 1000) };
  }

  const provider = getWhatsAppProviderName();
  const idempotencyKey = `admin-test:${provider}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
  const queued = await enqueueProviderWhatsApp({
    admin,
    phone,
    type: mode,
    payload,
    recipientRole,
    context: { source: "admin_whatsapp_test", recipient_role: recipientRole },
    idempotencyKey,
    priority: 100,
    immediate: true,
  });

  if (!queued.id) return NextResponse.json({ error: queued.error || "Failed to queue WhatsApp test." }, { status: 400 });

  const { data: row } = await admin.from("whatsapp_queue")
    .select("id,status,provider,provider_message_id,meta_message_id,delivery_status,last_error,attempts,phone_e164,recipient_role,created_at,sent_at,next_attempt_at")
    .eq("id", queued.id).maybeSingle();

  const status = String((row as { status?: unknown } | null)?.status ?? "");
  const error = String((row as { last_error?: unknown } | null)?.last_error ?? "") || null;
  const sent = status === "sent";

  await logSystemEvent({
    level: sent ? "info" : "warn",
    source: "admin_whatsapp_test",
    message: sent ? "Admin WhatsApp test sent" : "Admin WhatsApp test queued for retry",
    context: { queue_id: queued.id, provider, mode, recipient_role: recipientRole, phone_tail: phone.replace(/\D/g, "").slice(-4), status, error },
  });

  if (!sent) {
    return NextResponse.json({
      ok: false,
      error: error || "WhatsApp test was not sent immediately and remains queued for retry.",
      queue: row ?? null,
    }, { status: 502 });
  }
  return NextResponse.json({ ok: true, provider, queue: row ?? null });
}