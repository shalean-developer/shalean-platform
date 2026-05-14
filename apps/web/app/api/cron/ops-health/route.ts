import { NextResponse } from "next/server";
import { withCronLock } from "@/lib/cron/cronLock";
import { CRON_LOCK_KEYS } from "@/lib/cron/cronLockKeys";
import { verifyCronSecret } from "@/lib/cron/verifyCronSecret";
import { logCronRun, logSystemEvent } from "@/lib/logging/systemLog";
import { listOpsHealthAcknowledgements } from "@/lib/observability/opsHealthAcknowledgements";
import {
  recordOpsHealthAlertCooldownMarker,
  selectOpsHealthAlertCandidatesSafe,
  type OpsHealthAlertCandidate,
} from "@/lib/observability/opsHealthAlerts";
import {
  buildProductionHealthSummary,
  runProductionHealthScan,
  type ProductionHealthSummary,
} from "@/lib/observability/productionHealthMetrics";
import { postDispatchControlAlert } from "@/lib/ops/dispatchControlWebhook";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_SCAN_LIMIT = 500;
const MAX_SCAN_LIMIT = 5_000;
const JOB_NAME = "ops-health";

type OpsHealthCronAlertSummary = {
  enabled: boolean;
  candidates: number;
  sent: number;
  suppressed: number;
  errors: string[];
};

function clampScanLimit(raw: string | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_SCAN_LIMIT;
  return Math.min(MAX_SCAN_LIMIT, Math.max(1, Math.round(n)));
}

function statusFromSummary(summary: ProductionHealthSummary): "healthy" | "degraded" | "critical" {
  if (summary.totals.critical > 0) return "critical";
  if (summary.degraded === true || summary.totals.high > 0 || summary.totals.medium > 0) return "degraded";
  return "healthy";
}

function responseFromSummary(summary: ProductionHealthSummary) {
  const status = statusFromSummary(summary);
  return {
    ok: true,
    status,
    degraded: status === "degraded",
    generatedAt: summary.generatedAt,
    scanLimit: summary.scanLimit,
    counts: {
      ...summary.totals,
      totalFindings: summary.findings.reduce((acc, finding) => acc + finding.count, 0),
    },
    summaries: summary.findings.map((finding) => ({
      code: finding.code,
      severity: finding.severity,
      count: finding.count,
      sampleIds: finding.sampleIds,
      diagnostics: finding.diagnostics,
    })),
  };
}

function alertsEnabled(): boolean {
  return process.env.OPS_HEALTH_ALERTS_ENABLED === "true";
}

function alertMessage(candidate: OpsHealthAlertCandidate): string {
  return `[Ops Health] ${candidate.severity.toUpperCase()} ${candidate.code}: ${candidate.message}`;
}

async function processAlertPolicy(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  summary: ProductionHealthSummary,
): Promise<OpsHealthCronAlertSummary> {
  if (!alertsEnabled()) {
    return { enabled: false, candidates: 0, sent: 0, suppressed: 0, errors: [] };
  }

  const errors: string[] = [];
  let sent = 0;
  let suppressed = 0;

  try {
    const acknowledgements = await listOpsHealthAcknowledgements(admin).catch(() => []);
    const selection = await selectOpsHealthAlertCandidatesSafe(admin, summary, { acknowledgements });
    suppressed += selection.suppressed.length;
    errors.push(...selection.errors);

    for (const candidate of selection.candidates) {
      try {
        await postDispatchControlAlert(
          {
            errorType: `ops_health_${candidate.code}`,
            message: alertMessage(candidate),
            dedupeKey: `ops_health:${candidate.cooldownKey}`,
            dedupeWindowMinutes: candidate.cooldownMinutes,
            extra: candidate.payload,
          },
          { supabase: admin },
        );
        const marker = await recordOpsHealthAlertCooldownMarker(admin, candidate);
        if (!marker.ok) errors.push(marker.error);
        sent += 1;
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }

    return {
      enabled: true,
      candidates: selection.candidates.length,
      sent,
      suppressed,
      errors: errors.slice(0, 10),
    };
  } catch (err) {
    return {
      enabled: true,
      candidates: 0,
      sent,
      suppressed,
      errors: [err instanceof Error ? err.message : String(err)].slice(0, 10),
    };
  }
}

async function logSummary(summary: ProductionHealthSummary): Promise<void> {
  const payload = responseFromSummary(summary);
  await logSystemEvent({
    level: payload.status === "critical" ? "error" : payload.status === "degraded" ? "warn" : "info",
    source: "cron/ops-health",
    message: "ops_health_scheduled_scan",
    context: {
      status: payload.status,
      scanLimit: summary.scanLimit,
      counts: payload.counts,
      findingCodes: summary.findings.slice(0, 20).map((finding) => finding.code),
      sampleIds: Object.fromEntries(summary.findings.slice(0, 20).map((finding) => [finding.code, finding.sampleIds])),
    },
  });
  await logCronRun({
    jobName: JOB_NAME,
    status: "success",
    message: JSON.stringify({
      status: payload.status,
      counts: payload.counts,
      findingCodes: summary.findings.slice(0, 20).map((finding) => finding.code),
    }),
  });
}

export async function POST(request: Request) {
  const auth = verifyCronSecret(request);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) {
    await logCronRun({
      jobName: JOB_NAME,
      status: "error",
      message: "[env] Supabase not configured.",
    });
    return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
  }

  const url = new URL(request.url);
  const scanLimit = clampScanLimit(url.searchParams.get("scanLimit"));

  try {
    const lockResult = await withCronLock(
      admin,
      { jobName: CRON_LOCK_KEYS.opsHealthMetrics, leaseSeconds: 300 },
      async () => {
        const summary = await runProductionHealthScan(admin, {
          scanLimit,
          recordMetrics: true,
        });
        await logSummary(summary);
        const alerts = await processAlertPolicy(admin, summary);
        return { ...responseFromSummary(summary), alerts };
      },
    );

    if (lockResult.skipped) {
      await logCronRun({
        jobName: JOB_NAME,
        status: "success",
        message: JSON.stringify({ skipped: true, reason: lockResult.reason }),
      });
      return NextResponse.json({ ok: true, skipped: true, reason: lockResult.reason });
    }

    return NextResponse.json({
      ...lockResult.ranIt,
      ...(lockResult.degraded ? { lockDegraded: true } : {}),
    });
  } catch (err) {
    const summary = buildProductionHealthSummary({
      scanLimit,
      scannerFailures: [{ scanner: "cron_ops_health", message: err instanceof Error ? err.message : String(err) }],
    });
    await logSummary(summary).catch(() => undefined);
    await logCronRun({
      jobName: JOB_NAME,
      status: "error",
      message: `[handler] ${err instanceof Error ? err.message : String(err)}`,
    });
    return NextResponse.json(responseFromSummary(summary));
  }
}

export async function GET(request: Request) {
  return POST(request);
}
