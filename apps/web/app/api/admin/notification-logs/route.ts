import { NextResponse } from "next/server";
import {
  applyOfficeNotificationLogFilters,
  buildOfficeNotificationLogsListResponse,
  parseOfficeNotificationLogsLimit,
  parseOfficeNotificationLogsOffset,
  type OfficeNotificationLogFilters,
  type OfficeNotificationLogRow,
} from "@/lib/admin/officeNotificationLogs";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOG_SELECT =
  "id, booking_id, channel, template_key, recipient, status, error, provider, role, event_type, payload, created_at";

function filtersFromUrl(url: URL): OfficeNotificationLogFilters {
  return {
    booking_id: url.searchParams.get("booking_id"),
    status: url.searchParams.get("status"),
    channel: url.searchParams.get("channel"),
    template_key: url.searchParams.get("template_key"),
    role: url.searchParams.get("role"),
    event_type: url.searchParams.get("event_type"),
    search: url.searchParams.get("search"),
  };
}

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const url = new URL(request.url);
  const filters = filtersFromUrl(url);
  const limit = parseOfficeNotificationLogsLimit(url.searchParams.get("limit"));
  const offset = parseOfficeNotificationLogsOffset(url.searchParams.get("offset"));

  const base = () => admin.from("notification_logs");
  const filtered = (select: string, options?: { count?: "exact"; head?: boolean }) => {
    let q = base().select(select, options);
    q = applyOfficeNotificationLogFilters(q, filters);
    return q;
  };

  const [logsRes, totalRes, sentRes, failedRes] = await Promise.all([
    applyOfficeNotificationLogFilters(
      base().select(LOG_SELECT).order("created_at", { ascending: false }),
      filters,
    ).range(offset, offset + limit - 1),
    filtered("id", { count: "exact", head: true }),
    applyOfficeNotificationLogFilters(base().select("id", { count: "exact", head: true }), {
      ...filters,
      status: "sent",
    }),
    applyOfficeNotificationLogFilters(base().select("id", { count: "exact", head: true }), {
      ...filters,
      status: "failed",
    }),
  ]);

  if (logsRes.error) return NextResponse.json({ error: logsRes.error.message }, { status: 500 });
  if (totalRes.error) return NextResponse.json({ error: totalRes.error.message }, { status: 500 });
  if (sentRes.error) return NextResponse.json({ error: sentRes.error.message }, { status: 500 });
  if (failedRes.error) return NextResponse.json({ error: failedRes.error.message }, { status: 500 });

  const payload = buildOfficeNotificationLogsListResponse({
    logs: (logsRes.data ?? []) as OfficeNotificationLogRow[],
    limit,
    offset,
    total: totalRes.count ?? 0,
    sent: sentRes.count ?? 0,
    failed: failedRes.count ?? 0,
  });

  return NextResponse.json(payload);
}
