import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { enqueueProviderWhatsApp, flushWhatsAppJobViaProvider } from "@/lib/whatsapp/providerQueue";
import { getWhatsAppProviderName } from "@/lib/whatsapp/providers";
import { logSystemEvent } from "@/lib/logging/systemLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TestBody = {
  phone?: unknown;
  mode?: unknown;
  message?: unknown;
  templateName?: unknown;
  language?: unknown;
  bodyParams?: unknown;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  let body: TestBody;
  try {
    body = (await request.json()) as TestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const phone = text(body.phone);
  const mode = text(body.mode) === "template" ? "template" : "text";
  if (!phone) return NextResponse.json({ error: "Phone number is required." }, { status: 400 });

  const provider = getWhatsAppProviderName();
  const idempotencyKey = `admin-test:${provider}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;

  const payload = mode === "template"
    ? {
        kind: "template" as const,
        templateName: text(body.templateName),
        language: text(body.language) || "en",
        bodyParams: Array.isArray(body.bodyParams) ? body.bodyParams.map(String) : [],
      }
    : {
        kind: "text" as const,
        text: text(body.message),
      };

  if (mode === "text" && !payload.text) {
    return NextResponse.json({ error: "Message is required." }, { status: 400 });
  }
  if (mode === "template" && !payload.templateName) {
    return NextResponse.json({ error: "Template name is required." }, { status: 400 });
  }

  const queued = await enqueueProviderWhatsApp({
    admin,
    phone,
    type: mode,
    payload,
    recipientRole: "customer",
    context: { source: "admin_whatsapp_test", recipient_role: "customer" },
    idempotencyKey,
    priority: 100,
  });

  if (!queued.id) {
    return NextResponse.json({ error: queued.error || "Failed to queue WhatsApp test." }, { status: 400 });
  }

  const result = await flushWhatsAppJobViaProvider(admin, queued.id);
  const { data: row } = await admin
    .from("whatsapp_queue")
    .select("id,status,provider,provider_message_id,meta_message_id,delivery_status,last_error,attempts,phone_e164,created_at,sent_at")
    .eq("id", queued.id)
    .maybeSingle();

  await logSystemEvent({
    level: result.ok ? "info" : "warn",
    source: "admin_whatsapp_test",
    message: result.ok ? "Admin WhatsApp test sent" : "Admin WhatsApp test failed",
    context: {
      queue_id: queued.id,
      provider,
      mode,
      phone_tail: phone.replace(/\D/g, "").slice(-4),
      error: result.error ?? null,
    },
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error || "WhatsApp test failed.", queue: row ?? null },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, provider, queue: row ?? null });
}
