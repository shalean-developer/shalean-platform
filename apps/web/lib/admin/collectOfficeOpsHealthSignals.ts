import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OfficeOpsSystemErrorRow } from "@/lib/admin/officeOpsHealth";
import {
  filterBookingEngineCronErrors,
  filterBookingEngineCronSuccesses,
  isCronRunNoiseMessage,
  type OfficeOpsCronErrorRow,
  type OfficeOpsCronRunRow,
} from "@/lib/admin/officeOpsHealthFilters";
import {
  applyOpsHealthAcknowledgements,
  listOpsHealthAcknowledgements,
  type OpsHealthAcknowledgement,
} from "@/lib/observability/opsHealthAcknowledgements";
import { runProductionHealthScan, type ProductionHealthSummary } from "@/lib/observability/productionHealthMetrics";

export const OFFICE_OPS_HISTORY_DAYS_MS = 30 * 86_400_000;

export type { OfficeOpsSystemErrorRow };

export type OfficeOpsHealthSignals = {
  fetchedAt: string;
  scanLimit: number;
  productionHealth: ProductionHealthSummary | null;
  rawProductionHealth: ProductionHealthSummary | null;
  acknowledgements: OpsHealthAcknowledgement[];
  productionHealthError?: string;
  dbLatencyMs: number | null;
  dbOk: boolean;
  systemErrorRows: OfficeOpsSystemErrorRow[];
  cronErrorRows: OfficeOpsCronErrorRow[];
  cronSuccessRows: OfficeOpsCronRunRow[];
  paymentDriftRows: Array<{ created_at: string | null }>;
  notificationRows: Array<{ created_at: string | null; status: string | null; error?: string | null }>;
  whatsappPausedUntil: string | null;
  customerOutboundPausedUntil: string | null;
  notificationsQueryOk: boolean;
};

function filterCronErrorRows(
  rows: Array<{ created_at: string | null; job_name?: string | null; message?: string | null }>,
): OfficeOpsCronErrorRow[] {
  return rows.filter((row) => !isCronRunNoiseMessage(row.message)) as OfficeOpsCronErrorRow[];
}

export async function collectOfficeOpsHealthSignals(
  admin: SupabaseClient,
  scanLimit: number,
  fetchedAt = new Date().toISOString(),
): Promise<OfficeOpsHealthSignals> {
  const sinceIso = new Date(Date.parse(fetchedAt) - OFFICE_OPS_HISTORY_DAYS_MS).toISOString();
  const dbProbeStarted = performance.now();
  const dbRes = await admin.from("cleaners").select("id").limit(1);
  const dbLatencyMs = !dbRes.error ? Math.round(performance.now() - dbProbeStarted) : null;

  const [
    productionHealthResult,
    acknowledgements,
    systemLogsRes,
    cronRunsRes,
    paymentDriftRes,
    notificationLogsRes,
    flagsRes,
  ] = await Promise.all([
    runProductionHealthScan(admin, { scanLimit }).then(
      (summary) => ({ ok: true as const, summary }),
      (error) => ({ ok: false as const, error: error instanceof Error ? error.message : String(error) }),
    ),
    listOpsHealthAcknowledgements(admin),
    admin
      .from("system_logs")
      .select("created_at, level, source, message")
      .eq("level", "error")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(5000),
    admin
      .from("cron_runs")
      .select("created_at, status, message, job_name")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(10000),
    admin
      .from("failed_jobs")
      .select("created_at, type")
      .in("type", ["booking_finalize", "booking_insert", "payment_reconciliation"])
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(5000),
    admin
      .from("notification_logs")
      .select("created_at, status, error")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(10000),
    admin.from("notification_runtime_flags").select("whatsapp_disabled_until, customer_outbound_paused_until").eq("id", 1).maybeSingle(),
  ]);

  const productionHealth =
    productionHealthResult.ok
      ? applyOpsHealthAcknowledgements(productionHealthResult.summary, acknowledgements).visibleSummary
      : null;

  const cronRunRows = (cronRunsRes.data ?? []) as OfficeOpsCronRunRow[];
  const cronErrorRows = filterCronErrorRows(
    cronRunRows.filter((row) => String(row.status ?? "").trim().toLowerCase() === "error"),
  );

  return {
    fetchedAt,
    scanLimit,
    productionHealth,
    rawProductionHealth: productionHealthResult.ok ? productionHealthResult.summary : null,
    acknowledgements,
    productionHealthError: productionHealthResult.ok ? undefined : productionHealthResult.error,
    dbLatencyMs,
    dbOk: !dbRes.error,
    systemErrorRows: (systemLogsRes.data ?? []) as OfficeOpsSystemErrorRow[],
    cronErrorRows,
    cronSuccessRows: filterBookingEngineCronSuccesses(cronRunRows),
    paymentDriftRows: (paymentDriftRes.data ?? []) as Array<{ created_at: string | null }>,
    notificationRows: (notificationLogsRes.data ?? []) as Array<{
      created_at: string | null;
      status: string | null;
      error?: string | null;
    }>,
    whatsappPausedUntil:
      typeof flagsRes.data?.whatsapp_disabled_until === "string" ? flagsRes.data.whatsapp_disabled_until : null,
    customerOutboundPausedUntil:
      typeof flagsRes.data?.customer_outbound_paused_until === "string"
        ? flagsRes.data.customer_outbound_paused_until
        : null,
    notificationsQueryOk: !notificationLogsRes.error,
  };
}
