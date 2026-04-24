import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { retryNotificationFromLog } from "@/lib/notifications/notificationRetry";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: { logId?: string };
  try {
    body = (await request.json()) as { logId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const logId = typeof body.logId === "string" ? body.logId.trim() : "";
  if (!logId) return NextResponse.json({ error: "Missing logId." }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data: row, error } = await admin
    .from("notification_logs")
    .select("id, booking_id, channel, template_key, recipient, status, provider, role, event_type, payload")
    .eq("id", logId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Log not found." }, { status: 404 });

  const result = await retryNotificationFromLog(
    row as {
      id: string;
      booking_id: string | null;
      channel: string;
      template_key: string;
      recipient: string;
      status: string;
      provider: string;
      role: string | null;
      event_type: string | null;
      payload: Record<string, unknown> | null;
    },
  );

  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: result.httpStatus });
  }
  return NextResponse.json({ success: true });
}
