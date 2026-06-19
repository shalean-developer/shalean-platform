import { NextResponse } from "next/server";
import {
  buildOfficeNotificationsSummary,
  computeOfficeNotificationAudienceCounts,
  computeOfficeNotificationLogPagination,
  type OfficeNotificationLogRow,
} from "@/lib/admin/officeNotifications";
import { requireAdminFromRequest } from "@/lib/admin/requireAdmin";
import { startOfTodayJohannesburgUtcIso, todayYmdJohannesburg } from "@/lib/booking/dateInJohannesburg";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TODAY_LOG_SELECT = "id, channel, status, template_key, recipient, role, created_at, booking_id, error";
const DEFAULT_LOG_LIMIT = 10;
const MAX_LOG_LIMIT = 50;

function parseLogLimit(raw: string | null): number {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n)) return DEFAULT_LOG_LIMIT;
  return Math.min(MAX_LOG_LIMIT, Math.max(1, n));
}

function parseLogOffset(raw: string | null): number {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, n);
}

export async function GET(request: Request) {
  const auth = await requireAdminFromRequest(request);
  if (!auth.ok) return auth.response;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const url = new URL(request.url);
  const limit = parseLogLimit(url.searchParams.get("limit"));
  const offset = parseLogOffset(url.searchParams.get("offset"));
  const sinceIso = startOfTodayJohannesburgUtcIso();
  const dateYmd = todayYmdJohannesburg();

  const [todayRes, recentRes, logsCountRes, customerEmailsRes, cleanersRes, todayBookingsRes, flagsRes] =
    await Promise.all([
    admin
      .from("notification_logs")
      .select("channel, status")
      .gte("created_at", sinceIso)
      .limit(20000),
    admin
      .from("notification_logs")
      .select(TODAY_LOG_SELECT)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1),
    admin.from("notification_logs").select("id", { count: "exact", head: true }),
    admin.from("bookings").select("customer_email").not("customer_email", "is", null).limit(10000),
    admin.from("cleaners").select("id", { count: "exact", head: true }),
    admin
      .from("bookings")
      .select("customer_email, cleaner_id, selected_cleaner_id, team_id, status")
      .eq("date", dateYmd)
      .limit(2000),
    admin.from("notification_runtime_flags").select("whatsapp_disabled_until").eq("id", 1).maybeSingle(),
  ]);

  if (todayRes.error) return NextResponse.json({ error: todayRes.error.message }, { status: 500 });
  if (recentRes.error) return NextResponse.json({ error: recentRes.error.message }, { status: 500 });
  if (logsCountRes.error) return NextResponse.json({ error: logsCountRes.error.message }, { status: 500 });
  if (customerEmailsRes.error) return NextResponse.json({ error: customerEmailsRes.error.message }, { status: 500 });
  if (cleanersRes.error) return NextResponse.json({ error: cleanersRes.error.message }, { status: 500 });
  if (todayBookingsRes.error) return NextResponse.json({ error: todayBookingsRes.error.message }, { status: 500 });

  const whatsappPausedUntil =
    typeof flagsRes.data?.whatsapp_disabled_until === "string" ? flagsRes.data.whatsapp_disabled_until : null;

  const audiences = computeOfficeNotificationAudienceCounts({
    customerEmailRows: customerEmailsRes.data ?? [],
    cleanerCount: cleanersRes.count ?? 0,
    todayBookings: todayBookingsRes.data ?? [],
  });

  const recentRows = (recentRes.data ?? []) as OfficeNotificationLogRow[];
  const logsPagination = computeOfficeNotificationLogPagination({
    limit,
    offset,
    total: logsCountRes.count ?? 0,
    rowCount: recentRows.length,
  });

  const summary = buildOfficeNotificationsSummary({
    fetchedAt: new Date().toISOString(),
    dateYmd,
    todayRows: (todayRes.data ?? []) as OfficeNotificationLogRow[],
    recentRows,
    audiences,
    whatsappPausedUntil,
    logsPagination,
  });

  return NextResponse.json(summary);
}
