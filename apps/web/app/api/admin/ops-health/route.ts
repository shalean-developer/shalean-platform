import { NextResponse } from "next/server";
import { collectOfficeOpsHealthSignals } from "@/lib/admin/collectOfficeOpsHealthSignals";
import { buildOfficeOpsHealthSummary } from "@/lib/admin/officeOpsHealth";
import { requireAdminSession } from "@/lib/admin/requireAdminSession";
import {
  applyOpsHealthAcknowledgements,
  recordOpsHealthAcknowledgement,
} from "@/lib/observability/opsHealthAcknowledgements";
import {
  buildProductionHealthSummary,
  recordProductionHealthSummaryMetrics,
} from "@/lib/observability/productionHealthMetrics";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_SCAN_LIMIT = 500;
const MAX_SCAN_LIMIT = 5_000;

export type AdminOpsHealthStatus = "healthy" | "degraded" | "critical" | "down";

export type AdminOpsHealthResponse = ReturnType<typeof buildOfficeOpsHealthSummary>["scanner"];

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

function fallbackScannerResponse(scanLimit: number, error?: string): AdminOpsHealthResponse {
  const summary = buildOfficeOpsHealthSummary({
    fetchedAt: new Date().toISOString(),
    productionHealth: buildProductionHealthSummary({ scanLimit }),
    productionHealthError: error,
    dbLatencyMs: null,
    dbOk: false,
    systemErrorRows: [],
    cronErrorRows: [],
    notificationRows: [],
    whatsappPausedUntil: null,
    notificationsQueryOk: false,
  });
  return summary.scanner;
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
    return NextResponse.json(fallbackScannerResponse(scanLimit, "Server configuration error."), { status: 200 });
  }

  try {
    const signals = await collectOfficeOpsHealthSignals(admin, scanLimit);
    const ackView = signals.rawProductionHealth
      ? applyOpsHealthAcknowledgements(signals.rawProductionHealth, signals.acknowledgements, { includeAcknowledged })
      : null;

    const officeSummary = buildOfficeOpsHealthSummary({
      fetchedAt: signals.fetchedAt,
      productionHealth: includeAcknowledged ? signals.rawProductionHealth : signals.productionHealth,
      productionHealthError: signals.productionHealthError,
      dbLatencyMs: signals.dbLatencyMs,
      dbOk: signals.dbOk,
      systemErrorRows: signals.systemErrorRows,
      cronErrorRows: signals.cronErrorRows,
      notificationRows: signals.notificationRows,
      whatsappPausedUntil: signals.whatsappPausedUntil,
      customerOutboundPausedUntil: signals.customerOutboundPausedUntil,
      notificationsQueryOk: signals.notificationsQueryOk,
    });

    if (metricsRequested && signals.rawProductionHealth) {
      await recordProductionHealthSummaryMetrics(signals.rawProductionHealth).catch(() => undefined);
    }

    const acknowledgedHidden = ackView?.acknowledgedFindings.reduce((sum, finding) => sum + finding.count, 0) ?? 0;

    return NextResponse.json({
      ...officeSummary.scanner,
      lastScan: {
        ...officeSummary.scanner.lastScan,
        metricsRecorded: metricsRequested,
      },
      counts: {
        ...officeSummary.scanner.counts,
        acknowledgedHidden,
      },
      acknowledgedSummaries: ackView?.acknowledgedFindings ?? [],
      acknowledgements: signals.acknowledgements,
    } satisfies AdminOpsHealthResponse);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const fallback = fallbackScannerResponse(scanLimit, error);
    if (metricsRequested) {
      await recordProductionHealthSummaryMetrics(buildProductionHealthSummary({ scanLimit })).catch(() => undefined);
    }
    return NextResponse.json(
      {
        ...fallback,
        lastScan: { ...fallback.lastScan, metricsRecorded: metricsRequested },
      },
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
