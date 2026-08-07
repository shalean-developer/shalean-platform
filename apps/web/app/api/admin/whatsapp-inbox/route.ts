import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { southAfricaPhoneLookupVariants } from "@/lib/utils/phone";
import { getWhatsAppTemplateReadiness } from "@/lib/whatsapp/templateReadiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WINDOW_MS = 24 * 60 * 60 * 1000;

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const url = new URL(request.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? "1000");
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(1000, Math.floor(limitRaw))) : 1000;

  const { data, error } = await admin
    .from("whatsapp_provider_events")
    .select("id,provider,provider_event_id,provider_message_id,direction,phone,event_type,payload,created_at,processed_at")
    .in("direction", ["inbound", "outbound"])
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const messages = (data ?? []).map((row) => {
    const payload = row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
      ? row.payload as Record<string, unknown>
      : {};
    const body =
      typeof payload.body === "string" ? payload.body
        : typeof payload.text === "string" ? payload.text
          : typeof payload.message === "string" ? payload.message
            : "";
    return {
      id: row.id,
      provider: row.provider,
      phone: row.phone,
      direction: row.direction === "outbound" ? "outbound" as const : "inbound" as const,
      body,
      templateName: typeof payload.template_name === "string" ? payload.template_name : null,
      messageId: row.provider_message_id ?? row.provider_event_id,
      contextMessageId: typeof payload.context_message_id === "string" ? payload.context_message_id : null,
      eventType: row.event_type,
      adminEmail: typeof payload.admin_email === "string" ? payload.admin_email : null,
      createdAt: row.created_at,
    };
  });

  const phones = [...new Set(messages.map((m) => String(m.phone ?? "").replace(/\D/g, "")).filter(Boolean))];
  const contacts: Record<string, { name: string | null; bookingId: string | null; bookingReference: string | null }> = {};
  for (const phone of phones.slice(0, 100)) {
    const variants = southAfricaPhoneLookupVariants(phone);
    const { data: booking } = await admin
      .from("bookings")
      .select("id,booking_reference,customer_name,customer_phone")
      .in("customer_phone", variants)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    contacts[phone] = booking
      ? {
          name: String((booking as { customer_name?: string | null }).customer_name ?? "").trim() || null,
          bookingId: String((booking as { id?: string | null }).id ?? "").trim() || null,
          bookingReference: String((booking as { booking_reference?: string | null }).booking_reference ?? "").trim() || null,
        }
      : { name: null, bookingId: null, bookingReference: null };
  }

  const latestInboundByPhone: Record<string, string> = {};
  for (const message of messages) {
    const phone = String(message.phone ?? "").replace(/\D/g, "");
    if (phone && message.direction === "inbound" && !latestInboundByPhone[phone]) latestInboundByPhone[phone] = message.createdAt;
  }

  const conversationState = Object.fromEntries(phones.map((phone) => {
    const at = latestInboundByPhone[phone];
    const open = Boolean(at && Date.now() - new Date(at).getTime() < WINDOW_MS);
    return [phone, { latestInboundAt: at ?? null, conversationOpen: open }];
  }));

  const approvedCustomerTemplates = getWhatsAppTemplateReadiness()
    .filter((item) => item.sendReady && item.audience === "customer")
    .map((item) => ({
      key: item.key,
      metaTemplateName: item.metaTemplateName,
      language: item.language,
      variables: item.variables,
      body: item.body,
      category: item.category,
    }));

  return NextResponse.json({ messages, contacts, conversationState, approvedCustomerTemplates });
}
