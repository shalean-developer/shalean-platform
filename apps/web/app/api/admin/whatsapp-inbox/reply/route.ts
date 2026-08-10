import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getWhatsAppProvider, getWhatsAppProviderName } from "@/lib/whatsapp/providers";
import { getWhatsAppTemplateReadiness } from "@/lib/whatsapp/templateReadiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WINDOW_MS = 24 * 60 * 60 * 1000;

function normalizePhone(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

function renderTemplateBody(templateBody: string, bodyParams: readonly string[]): string {
  return templateBody.replace(/\{\{(\d+)\}\}/g, (_match, index: string) => {
    const value = bodyParams[Number(index) - 1];
    return value ?? `{{${index}}}`;
  });
}

export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const body = await request.json().catch(() => null) as {
    phone?: string;
    mode?: "text" | "template";
    message?: string;
    templateName?: string;
    language?: string;
    bodyParams?: string[];
  } | null;

  const phone = normalizePhone(body?.phone);
  const mode = body?.mode === "template" ? "template" : "text";
  if (phone.length < 10 || phone.length > 15) return NextResponse.json({ error: "Invalid WhatsApp phone number." }, { status: 400 });

  const { data: latestInbound } = await admin
    .from("whatsapp_provider_events")
    .select("created_at")
    .eq("direction", "inbound")
    .eq("phone", phone)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const latestInboundAt = latestInbound?.created_at ? new Date(latestInbound.created_at).getTime() : 0;
  const conversationOpen = latestInboundAt > 0 && Date.now() - latestInboundAt < WINDOW_MS;

  const provider = getWhatsAppProvider();
  const providerName = getWhatsAppProviderName();
  let result: { ok: boolean; error?: string; messageId?: string | null };
  let payload: Record<string, unknown>;

  if (mode === "text") {
    const message = String(body?.message ?? "").trim();
    if (!message) return NextResponse.json({ error: "Reply message is required." }, { status: 400 });
    if (!conversationOpen) {
      return NextResponse.json({ error: "The 24-hour conversation window is closed. Use an approved Meta template.", code: "template_required" }, { status: 409 });
    }
    result = await provider.sendText({ phone, message, recipientRole: "customer" });
    payload = { kind: "text", body: message };
  } else {
    const templateName = String(body?.templateName ?? "").trim();
    const template = getWhatsAppTemplateReadiness().find((item) =>
      item.sendReady && item.audience === "customer" && (item.metaTemplateName === templateName || item.key === templateName),
    );
    if (!template) return NextResponse.json({ error: "Select an approved customer WhatsApp template." }, { status: 400 });
    const bodyParams = Array.isArray(body?.bodyParams) ? body!.bodyParams.map((value) => String(value).trim()) : [];
    if (bodyParams.length !== template.variables.length || bodyParams.some((value) => !value)) {
      return NextResponse.json({ error: `Template requires ${template.variables.length} completed body parameter(s).` }, { status: 400 });
    }
    result = await provider.sendTemplate({
      phone,
      templateName: template.metaTemplateName,
      language: body?.language || template.language,
      bodyParams,
      recipientRole: "customer",
    });
    payload = {
      kind: "template",
      body: renderTemplateBody(template.body, bodyParams),
      template_body: template.body,
      template_name: template.metaTemplateName,
      body_params: bodyParams,
    };
  }

  if (!result.ok) return NextResponse.json({ error: result.error ?? "WhatsApp send failed." }, { status: 502 });

  const createdAt = new Date().toISOString();
  const { data: inserted, error: insertError } = await admin.from("whatsapp_provider_events").insert({
    provider: providerName,
    provider_event_id: result.messageId ?? null,
    provider_message_id: result.messageId ?? null,
    direction: "outbound",
    phone,
    event_type: "admin_reply",
    payload: {
      ...payload,
      admin_user_id: auth.userId,
      admin_email: auth.email,
      conversation_window_open: conversationOpen,
    },
    processed_at: createdAt,
  }).select("id,created_at").single();

  if (insertError) {
    return NextResponse.json({
      error: "WhatsApp was sent, but Shalean could not save the outbound chat history.",
      code: "history_persist_failed",
      messageId: result.messageId ?? null,
    }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    messageId: result.messageId ?? null,
    conversationOpen,
    adminEmail: auth.email,
    createdAt: inserted?.created_at ?? createdAt,
    eventId: inserted?.id ?? null,
  });
}
