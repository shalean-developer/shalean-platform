import { NextResponse } from "next/server";
import {
  computeOfficeNotificationAudienceCounts,
  computeOfficeNotificationChannelStats,
  computeOfficeNotificationLogPagination,
  computeOfficeNotificationTotals,
  mapOfficeNotificationRecentLog,
  type OfficeNotificationChannelStat,
  type OfficeNotificationLogRow,
} from "@/lib/admin/officeNotifications";
import { formatNotificationChannel } from "@/lib/admin/notificationLogDisplay";
import { requireAdminFromRequest } from "@/lib/admin/requireAdmin";
import { startOfTodayJohannesburgUtcIso, todayYmdJohannesburg } from "@/lib/booking/dateInJohannesburg";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TODAY_LOG_SELECT = "id, channel, status, template_key, recipient, role, created_at, booking_id, error";
const DEFAULT_LOG_LIMIT = 10;
const MAX_LOG_LIMIT = 50;
const ROLLUP_FALLBACK_TODAY_LIMIT = 20_000;
const ROLLUP_FALLBACK_CUSTOMER_LIMIT = 10_000;

type DashboardRollup = {
  all_customers: number | string | null;
  email_sent: number | string | null;
  email_failed: number | string | null;
  whatsapp_sent: number | string | null;
  whatsapp_failed: number | string | null;
  sms_sent: number | string | null;
  sms_failed: number | string | null;
};

type SupabaseErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

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

function safeCount(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function channelStat(channel: "email" | "whatsapp" | "sms", sent: number, failed: number): OfficeNotificationChannelStat {
  const total = sent + failed;
  return {
    channel,
    label: formatNotificationChannel(channel),
    sent,
    failed,
    successRate: total > 0 ? Math.round((sent / total) * 1000) / 10 : null,
  };
}

function channelStatsFromRollup(rollup: DashboardRollup): OfficeNotificationChannelStat[] {
  return [
    channelStat("email", safeCount(rollup.email_sent), safeCount(rollup.email_failed)),
    channelStat("whatsapp", safeCount(rollup.whatsapp_sent), safeCount(rollup.whatsapp_failed)),
    channelStat("sms", safeCount(rollup.sms_sent), safeCount(rollup.sms_failed)),
  ];
}

function isMissingRollupRpcError(error: SupabaseErrorLike | null | undefined): boolean {
  if (!error) return false;
  if (String(error.code ?? "").toUpperCase() === "PGRST202") return true;
  const text = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`.toLowerCase();
  return (
    text.includes("could not find the function") ||
    (text.includes("office_notifications_dashboard_rollup") && text.includes("schema cache"))
  );
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

  const [rollupRes, recentRes, logsCountRes, cleanersRes, todayBookingsRes, flagsRes] = await Promise.all([
    admin.rpc("office_notifications_dashboard_rollup", { p_since: sinceIso }),
    admin
      .from("notification_logs")
      .select(TODAY_LOG_SELECT)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1),
    admin.from("notification_logs").select("id", { count: "exact", head: true }),
    admin.from("cleaners").select("id", { count: "exact", head: true }),
    admin
      .from("bookings")
      .select("customer_email, cleaner_id, selected_cleaner_id, team_id, status")
      .eq("date", dateYmd)
      .limit(2000),
    admin.from("notification_runtime_flags").select("whatsapp_disabled_until").eq("id", 1).maybeSingle(),
  ]);

  if (recentRes.error) return NextResponse.json({ error: recentRes.error.message }, { status: 500 });
  if (logsCountRes.error) return NextResponse.json({ error: logsCountRes.error.message }, { status: 500 });
  if (cleanersRes.error) return NextResponse.json({ error: cleanersRes.error.message }, { status: 500 });
  if (todayBookingsRes.error) return NextResponse.json({ error: todayBookingsRes.error.message }, { status: 500 });

  const rollupRpcMissing = isMissingRollupRpcError(rollupRes.error);
  if (rollupRes.error && !rollupRpcMissing) {
    return NextResponse.json({ error: rollupRes.error.message }, { status: 500 });
  }

  // Additive migration rollout safety: use the legacy raw queries only when the new RPC is not in PostgREST yet.
  const rollup = !rollupRes.error ? ((rollupRes.data?.[0] ?? null) as DashboardRollup | null) : null;
  if (!rollup && !rollupRpcMissing) {
    return NextResponse.json({ error: "Office notifications rollup returned no data." }, { status: 500 });
  }

  let fallbackTodayRows: OfficeNotificationLogRow[] = [];
  let fallbackCustomerRows: Array<{ customer_email: string | null }> = [];

  if (rollupRpcMissing) {
    const [todayFallbackRes, customerFallbackRes] = await Promise.all([
      admin
        .from("notification_logs")
        .select("channel, status")
        .gte("created_at", sinceIso)
        .limit(ROLLUP_FALLBACK_TODAY_LIMIT),
      admin
        .from("bookings")
        .select("customer_email")
        .not("customer_email", "is", null)
        .limit(ROLLUP_FALLBACK_CUSTOMER_LIMIT),
    ]);
    if (todayFallbackRes.error) return NextResponse.json({ error: todayFallbackRes.error.message }, { status: 500 });
    if (customerFallbackRes.error) return NextResponse.json({ error: customerFallbackRes.error.message }, { status: 500 });
    fallbackTodayRows = (todayFallbackRes.data ?? []) as OfficeNotificationLogRow[];
    fallbackCustomerRows = customerFallbackRes.data ?? [];
  }

  const whatsappPausedUntil =
    typeof flagsRes.data?.whatsapp_disabled_until === "string" ? flagsRes.data.whatsapp_disabled_until : null;

  const baseAudiences = computeOfficeNotificationAudienceCounts({
    customerEmailRows: fallbackCustomerRows,
    cleanerCount: cleanersRes.count ?? 0,
    todayBookings: todayBookingsRes.data ?? [],
  });
  const audiences = {
    ...baseAudiences,
    allCustomers: rollup ? safeCount(rollup.all_customers) : baseAudiences.allCustomers,
  };

  const recentRows = (recentRes.data ?? []) as OfficeNotificationLogRow[];
  const logsPagination = computeOfficeNotificationLogPagination({
    limit,
    offset,
    total: logsCountRes.count ?? 0,
    rowCount: recentRows.length,
  });
  const channels = rollup ? channelStatsFromRollup(rollup) : computeOfficeNotificationChannelStats(fallbackTodayRows);

  return NextResponse.json({
    fetchedAt: new Date().toISOString(),
    dateYmd,
    channels,
    recentLogs: recentRows.map(mapOfficeNotificationRecentLog),
    totals: computeOfficeNotificationTotals(channels),
    audiences,
    whatsappPausedUntil,
    logsPagination,
  });
}
