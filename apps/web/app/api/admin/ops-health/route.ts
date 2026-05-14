import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin/requireAdminSession";
import {
  buildProductionHealthSummary,
  recordProductionHealthSummaryMetrics,
  runProductionHealthScan,
  type ProductionHealthFinding,
  type ProductionHealthSummary,
} from "@/lib/observability/productionHealthMetrics";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_SCAN_LIMIT = 500;
const MAX_SCAN_LIMIT = 5_000;

export type AdminOpsHealthStatus = "healthy" | "degraded" | "critical";

export type AdminOpsHealthResponse = {
  ok: true;
  status: AdminOpsHealthStatus;
  degraded: boolean;
  error?: string;
  generatedAt: string;
  lastScan: {
    source: "production_health";
    scanLimit: number;
    metricsRecorded: boolean;
    degraded: boolean;
  };
  counts: ProductionHealthSummary["totals"] & {
    totalFindings: number;
  };
  summaries: ProductionHealthFinding[];
  sampleIds: Record<string, string[]>;
};

function clampScanLimit(raw: string | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_SCAN_LIMIT;
  return Math.min(MAX_SCAN_LIMIT, Math.max(1, Math.round(n)));
}

function shouldRecordMetrics(url: URL): boolean {
  const param = url.searchParams.get("recordMetrics");
  if (param === "1" || param === "true") return true;
  if (param === "0" || param === "false") return false;
  return process.env.OPS_HEALTH_RECORD_METRICS === "true";
}

function statusFromSummary(summary: ProductionHealthSummary, degraded: boolean): AdminOpsHealthStatus {
  if (summary.totals.critical > 0) return "critical";
  if (degraded || summary.totals.high > 0 || summary.totals.medium > 0) return "degraded";
  return "healthy";
}

function responseFromSummary(params: {
  summary: ProductionHealthSummary;
  degraded: boolean;
  metricsRecorded: boolean;
  error?: string;
}): AdminOpsHealthResponse {
  const { summary, degraded, metricsRecorded, error } = params;
  const isDegraded = degraded || summary.degraded === true;
  return {
    ok: true,
    status: statusFromSummary(summary, isDegraded),
    degraded: isDegraded,
    ...(error ? { error } : {}),
    generatedAt: summary.generatedAt,
    lastScan: {
      source: "production_health",
      scanLimit: summary.scanLimit,
      metricsRecorded,
      degraded: isDegraded,
    },
    counts: {
      ...summary.totals,
      totalFindings: summary.findings.reduce((acc, finding) => acc + finding.count, 0),
    },
    summaries: summary.findings,
    sampleIds: Object.fromEntries(summary.findings.map((finding) => [finding.code, finding.sampleIds])),
  };
}

export async function GET(request: Request) {
  const auth = await requireAdminSession(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const scanLimit = clampScanLimit(url.searchParams.get("scanLimit"));
  const metricsRequested = shouldRecordMetrics(url);

  const admin = getSupabaseAdmin();
  if (!admin) {
    const summary = buildProductionHealthSummary({ scanLimit });
    return NextResponse.json(
      responseFromSummary({
        summary,
        degraded: true,
        metricsRecorded: false,
        error: "Server configuration error.",
      }),
      { status: 200 },
    );
  }

  try {
    const summary = await runProductionHealthScan(admin, {
      scanLimit,
      recordMetrics: metricsRequested,
    });
    return NextResponse.json(
      responseFromSummary({
        summary,
        degraded: false,
        metricsRecorded: metricsRequested,
      }),
    );
  } catch (err) {
    const summary = buildProductionHealthSummary({ scanLimit });
    if (metricsRequested) {
      await recordProductionHealthSummaryMetrics(summary).catch(() => undefined);
    }
    return NextResponse.json(
      responseFromSummary({
        summary,
        degraded: true,
        metricsRecorded: metricsRequested,
        error: err instanceof Error ? err.message : String(err),
      }),
      { status: 200 },
    );
  }
}
