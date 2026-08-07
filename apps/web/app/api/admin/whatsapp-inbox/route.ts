import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const url = new URL(request.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, Math.floor(limitRaw))) : 50;

  const { data, error } = await admin
    .from("whatsapp_provider_events")
    .select("id,provider,provider_event_id,provider_message_id,direction,phone,event_type,payload,created_at,processed_at")
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const messages = (data ?? []).map((row) => {
    const payload = row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
      ? row.payload as Record<string, unknown>
      : {};
    return {
      id: row.id,
      provider: row.provider,
      phone: row.phone,
      body: typeof payload.body === "string" ? payload.body : "",
      messageId: row.provider_message_id ?? row.provider_event_id,
      contextMessageId: typeof payload.context_message_id === "string" ? payload.context_message_id : null,
      eventType: row.event_type,
      createdAt: row.created_at,
    };
  });

  return NextResponse.json({ messages });
}
