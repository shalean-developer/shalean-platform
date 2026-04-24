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
  const booking_id = url.searchParams.get("booking_id")?.trim() || null;
  const status = url.searchParams.get("status")?.trim() || null;
  const channel = url.searchParams.get("channel")?.trim() || null;
  const template_key = url.searchParams.get("template_key")?.trim() || null;
  const role = url.searchParams.get("role")?.trim() || null;
  const event_type = url.searchParams.get("event_type")?.trim() || null;

  const limitRaw = parseInt(url.searchParams.get("limit") ?? "80", 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, limitRaw)) : 80;
  const offsetRaw = parseInt(url.searchParams.get("offset") ?? "0", 10);
  const offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;
  const end = offset + limit - 1;

  let q = admin
    .from("notification_logs")
    .select(
      "id, booking_id, channel, template_key, recipient, status, error, provider, role, event_type, payload, created_at",
    )
    .order("created_at", { ascending: false })
    .range(offset, end);

  if (booking_id) q = q.eq("booking_id", booking_id);
  if (status === "sent" || status === "failed") q = q.eq("status", status);
  if (channel === "email" || channel === "whatsapp" || channel === "sms") q = q.eq("channel", channel);
  if (template_key) q = q.eq("template_key", template_key);
  if (role) q = q.eq("role", role);
  if (event_type) q = q.eq("event_type", event_type);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    logs: data ?? [],
    limit,
    offset,
    hasMore: (data?.length ?? 0) === limit,
  });
}
