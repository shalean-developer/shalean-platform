import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin/requireAdminSession";
import {
  buildProductionHealthSummary,
  recordProductionHealthSummaryMetrics,
  runProductionHealthScan,
  type ProductionHealthFinding,
  type ProductionHealthSummary,
} from "@/lib/observability/productionHealthMetrics";
import {
  applyOpsHealthAcknowledgements,
  listOpsHealthAcknowledgements,
  recordOpsHealthAcknowledgement,
  type OpsHealthAcknowledgement,
} from "@/lib/observability/opsHealthAcknowledgements";
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
    acknowledgedHidden: number;
  };
  summaries: ProductionHealthFinding[];
  acknowledgedSummaries: ProductionHealthFinding[];
  acknowledgements: OpsHealthAcknowledgement[];
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

function shouldIncludeAcknowledged(url: URL): boolean {
  const param = url.searchParams.get("includeAcknowledged");
  return param === "1" || param === "true";
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
  acknowledgedSummaries?: ProductionHealthFinding[];
  acknowledgements?: OpsHealthAcknowledgement[];
  error?: string;
}): AdminOpsHealthResponse {
  const { summary, degraded, metricsRecorded, acknowledgedSummaries = [], acknowledgements = [], error } = params;
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
      acknowledgedHidden: acknowledgedSummaries.reduce((acc, finding) => acc + finding.count, 0),
    },
    summaries: summary.findings,
    acknowledgedSummaries,
    acknowledgements,
    sampleIds: Object.fromEntries(summary.findings.map((finding) => [finding.code, finding.sampleIds])),
  };
}

export async function GET(request: Request) {
  const auth = await requireAdminSession(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const scanLimit = clampScanLimit(url.searchParams.get("scanLimit"));
  const metricsRequested = shouldRecordMetrics(url);
  const includeAcknowledged = shouldIncludeAcknowledged(url);

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
    const rawSummary = await runProductionHealthScan(admin, {
      scanLimit,
      recordMetrics: metricsRequested,
    });
    const acknowledgements = await listOpsHealthAcknowledgements(admin);
    const { visibleSummary, acknowledgedFindings } = applyOpsHealthAcknowledgements(rawSummary, acknowledgements, {
      includeAcknowledged,
    });
    return NextResponse.json(
      responseFromSummary({
        summary: visibleSummary,
        degraded: false,
        metricsRecorded: metricsRequested,
        acknowledgedSummaries: acknowledgedFindings,
        acknowledgements,
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

export async function POST(request: Request) {
  const auth = await requireAdminSession(request);
  if (!auth.ok) return auth.response;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: "Server configuration error." }, { status: 503 });

  let body: {
    code?: unknown;
    sampleIds?: unknown;
    status?: unknown;
    note?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const status = body.status === "resolved" ? "resolved" : body.status === "acknowledged" ? "acknowledged" : null;
  if (!status) return NextResponse.json({ ok: false, error: "Invalid acknowledgement status." }, { status: 400 });

  const result = await recordOpsHealthAcknowledgement(admin, {
    code: typeof body.code === "string" ? body.code : "",
    sampleIds: Array.isArray(body.sampleIds) ? body.sampleIds.map(String) : [],
    status,
    note: typeof body.note === "string" ? body.note : undefined,
    operator: auth.user,
  });

  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 422 });
  return NextResponse.json({ ok: true, acknowledgement: result.acknowledgement });
}
