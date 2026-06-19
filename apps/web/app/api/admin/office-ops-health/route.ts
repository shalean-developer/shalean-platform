import { NextResponse } from "next/server";
import { buildOfficeOpsHealthSummary } from "@/lib/admin/officeOpsHealth";
import { requireAdminFromRequest } from "@/lib/admin/requireAdmin";
import {
  applyOpsHealthAcknowledgements,
  listOpsHealthAcknowledgements,
} from "@/lib/observability/opsHealthAcknowledgements";
import { runProductionHealthScan } from "@/lib/observability/productionHealthMetrics";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_SCAN_LIMIT = 250;
const HISTORY_DAYS_MS = 30 * 86_400_000;

function clampScanLimit(raw: string | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_SCAN_LIMIT;
  return Math.min(5000, Math.max(1, Math.round(n)));
}

export async function GET(request: Request) {
  const auth = await requireAdminFromRequest(request);
  if (!auth.ok) return auth.response;

  const admin = getSupabaseAdmin();
  const fetchedAt = new Date().toISOString();
  const url = new URL(request.url);
  const scanLimit = clampScanLimit(url.searchParams.get("scanLimit"));
  const sinceIso = new Date(Date.parse(fetchedAt) - HISTORY_DAYS_MS).toISOString();

  if (!admin) {
    return NextResponse.json(
      buildOfficeOpsHealthSummary({
        fetchedAt,
        productionHealth: null,
        productionHealthError: "Server configuration error.",
        dbLatencyMs: null,
        dbOk: false,
        systemErrorRows: [],
        cronErrorRows: [],
        notificationRows: [],
        whatsappPausedUntil: null,
        notificationsQueryOk: false,
      }),
    );
  }

  const dbStarted = performance.now();
  const dbProbe = admin.from("cleaners").select("id").limit(1);
  const [
    dbRes,
    productionHealthResult,
    acknowledgements,
    systemLogsRes,
    cronRunsRes,
    notificationLogsRes,
    flagsRes,
  ] = await Promise.all([
    dbProbe,
    runProductionHealthScan(admin, { scanLimit }).then(
      (summary) => ({ ok: true as const, summary }),
      (error) => ({ ok: false as const, error: error instanceof Error ? error.message : String(error) }),
    ),
    listOpsHealthAcknowledgements(admin),
    admin
      .from("system_logs")
      .select("created_at, level")
      .eq("level", "error")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(5000),
    admin
      .from("cron_runs")
      .select("created_at, status, message")
      .eq("status", "error")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(5000),
    admin
      .from("notification_logs")
      .select("created_at, status")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(10000),
    admin.from("notification_runtime_flags").select("whatsapp_disabled_until").eq("id", 1).maybeSingle(),
  ]);

  const dbLatencyMs = Math.round(performance.now() - dbStarted);
  const dbOk = !dbRes.error;

  const productionHealth =
    productionHealthResult.ok
      ? applyOpsHealthAcknowledgements(productionHealthResult.summary, acknowledgements).visibleSummary
      : null;

  const cronErrorRows = (cronRunsRes.data ?? []).filter((row) => {
    const message = String((row as { message?: string | null }).message ?? "").trim();
    return message !== "Unauthorized." && message !== "[auth] Unauthorized." && !message.startsWith("[auth] Unauthorized");
  }) as Array<{ created_at: string | null }>;

  const summary = buildOfficeOpsHealthSummary({
    fetchedAt,
    productionHealth,
    productionHealthError: productionHealthResult.ok ? undefined : productionHealthResult.error,
    dbLatencyMs: dbOk ? dbLatencyMs : null,
    dbOk,
    systemErrorRows: (systemLogsRes.data ?? []) as Array<{ created_at: string | null }>,
    cronErrorRows,
    notificationRows: (notificationLogsRes.data ?? []) as Array<{ created_at: string | null; status: string | null }>,
    whatsappPausedUntil:
      typeof flagsRes.data?.whatsapp_disabled_until === "string" ? flagsRes.data.whatsapp_disabled_until : null,
    notificationsQueryOk: !notificationLogsRes.error,
  });

  return NextResponse.json(summary);
}
