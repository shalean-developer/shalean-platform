"use client";

import { AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type HealthStatus = "healthy" | "degraded" | "critical";
type Severity = "critical" | "high" | "medium" | "low" | "info";

export type OpsHealthSummary = {
  code: string;
  severity: Severity;
  count: number;
  message: string;
  sampleIds: string[];
  diagnostics?: Record<string, unknown>;
};

export type OpsHealthPayload = {
  ok: true;
  status: HealthStatus;
  degraded: boolean;
  error?: string;
  generatedAt: string;
  lastScan: {
    source: string;
    scanLimit: number;
    metricsRecorded: boolean;
    degraded: boolean;
  };
  counts: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
    totalFindings: number;
    acknowledgedHidden: number;
  };
  summaries: OpsHealthSummary[];
  acknowledgedSummaries: OpsHealthSummary[];
  acknowledgements: Array<{
    key: string;
    code: string;
    sampleIds: string[];
    status: "acknowledged" | "resolved";
    note?: string;
    operatorId?: string;
    operatorEmail?: string;
    createdAt: string;
  }>;
  sampleIds: Record<string, string[]>;
};

type Props = {
  data: OpsHealthPayload;
  showAcknowledged?: boolean;
  onToggleAcknowledged?: () => void;
  onAcknowledge?: (finding: OpsHealthSummary) => void;
  onResolveAcknowledgement?: (finding: OpsHealthSummary) => void;
};

const severityOrder: Severity[] = ["critical", "high", "medium", "low", "info"];

const statusCopy: Record<HealthStatus, { label: string; description: string }> = {
  healthy: {
    label: "Healthy",
    description: "No production health findings in the bounded scan.",
  },
  degraded: {
    label: "Degraded",
    description: "One or more scanners found issues or the scan ran in degraded mode.",
  },
  critical: {
    label: "Critical",
    description: "Critical drift exists and should be triaged before routine operational changes.",
  },
};

function statusClass(status: HealthStatus): string {
  if (status === "critical") return "border-rose-300 bg-rose-50 text-rose-950 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-100";
  if (status === "degraded") return "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100";
  return "border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100";
}

function severityClass(severity: Severity): string {
  if (severity === "critical") return "border-rose-300 bg-rose-50 text-rose-950 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-100";
  if (severity === "high") return "border-orange-300 bg-orange-50 text-orange-950 dark:border-orange-900/60 dark:bg-orange-950/30 dark:text-orange-100";
  if (severity === "medium") return "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100";
  if (severity === "low") return "border-blue-200 bg-blue-50 text-blue-950 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-100";
  return "border-zinc-200 bg-zinc-50 text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100";
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" });
}

function shortId(id: string): string {
  const s = id.trim();
  if (s.length <= 18) return s;
  return `${s.slice(0, 8)}...${s.slice(-6)}`;
}

function diagnosticLines(diagnostics?: Record<string, unknown>): string[] {
  if (!diagnostics) return [];
  const errors = Array.isArray(diagnostics.errors) ? diagnostics.errors : [];
  if (errors.length > 0) {
    return errors.slice(0, 4).map((entry) => {
      if (entry && typeof entry === "object") {
        const e = entry as { scanner?: unknown; message?: unknown; code?: unknown };
        const scanner = String(e.scanner ?? "scanner");
        const message = String(e.message ?? "unknown error");
        const code = e.code ? ` (${String(e.code)})` : "";
        return `${scanner}: ${message}${code}`;
      }
      return String(entry);
    });
  }
  return Object.entries(diagnostics)
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : String(value)}`);
}

export function OpsHealthDashboard({
  data,
  showAcknowledged = false,
  onToggleAcknowledged,
  onAcknowledge,
  onResolveAcknowledgement,
}: Props) {
  const status = statusCopy[data.status];
  const StatusIcon = data.status === "healthy" ? CheckCircle2 : data.status === "critical" ? ShieldAlert : AlertTriangle;
  const sorted = [...data.summaries].sort(
    (a, b) => severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity) || b.count - a.count,
  );

  return (
    <div className="space-y-6">
      <div className={cn("rounded-xl border px-4 py-3", statusClass(data.status))}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <StatusIcon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide">Ops health: {status.label}</p>
              <p className="mt-1 text-sm">{status.description}</p>
              {data.error ? <p className="mt-1 text-xs font-medium">Scanner note: {data.error}</p> : null}
            </div>
          </div>
          <div className="text-xs sm:text-right">
            <p>Last scan: {formatTimestamp(data.generatedAt)}</p>
            <p>
              Limit {data.lastScan.scanLimit.toLocaleString("en-ZA")}
              {data.lastScan.metricsRecorded ? " · metrics recorded" : ""}
              {data.lastScan.degraded ? " · degraded" : ""}
            </p>
            {data.counts.acknowledgedHidden > 0 ? (
              <p>{data.counts.acknowledgedHidden.toLocaleString("en-ZA")} acknowledged hidden</p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {severityOrder.map((severity) => (
          <Card key={severity} className={cn("border-2", severityClass(severity))}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm capitalize">{severity}</CardTitle>
              <CardDescription className="text-xs">Scanner findings</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tabular-nums">{data.counts[severity].toLocaleString("en-ZA")}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-base">Scanner Summaries</CardTitle>
              <CardDescription>
                Read-only production health scan. Samples are intentionally capped to IDs only.
              </CardDescription>
            </div>
            {onToggleAcknowledged ? (
              <button
                type="button"
                onClick={onToggleAcknowledged}
                className="inline-flex min-h-[36px] items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                {showAcknowledged ? "Hide acknowledged" : "Show acknowledged"}
              </button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          {sorted.length === 0 ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100">
              No scanner findings in this run.
            </p>
          ) : (
            <div className="space-y-3">
              {sorted.map((finding) => (
                <div
                  key={finding.code}
                  className={cn("rounded-lg border px-3 py-3 text-sm", severityClass(finding.severity))}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ring-black/10">
                          {finding.severity}
                        </span>
                        <code className="text-[11px]">{finding.code}</code>
                      </div>
                      <p className="mt-2 font-medium">{finding.message}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                      <p className="text-2xl font-semibold tabular-nums">{finding.count.toLocaleString("en-ZA")}</p>
                      {finding.diagnostics?.acknowledged === true ? (
                        <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ring-black/10">
                          acknowledged
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {finding.sampleIds.length > 0 ? (
                    <div className="mt-3">
                      <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Sample IDs</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {finding.sampleIds.map((id) => (
                          <code
                            key={id}
                            title={id}
                            className="rounded bg-white/70 px-1.5 py-0.5 text-[10px] ring-1 ring-black/10"
                          >
                            {shortId(id)}
                          </code>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {diagnosticLines(finding.diagnostics).length > 0 ? (
                    <div className="mt-3">
                      <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Diagnostics</p>
                      <ul className="mt-1 space-y-1">
                        {diagnosticLines(finding.diagnostics).map((line) => (
                          <li key={line} className="break-words text-xs">
                            {line}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {onAcknowledge || onResolveAcknowledgement ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {finding.diagnostics?.acknowledged === true && onResolveAcknowledgement ? (
                        <button
                          type="button"
                          onClick={() => onResolveAcknowledgement(finding)}
                          className="inline-flex min-h-[32px] items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-1 text-xs font-semibold text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                        >
                          Mark resolved
                        </button>
                      ) : onAcknowledge ? (
                        <button
                          type="button"
                          onClick={() => onAcknowledge(finding)}
                          className="inline-flex min-h-[32px] items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-1 text-xs font-semibold text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                        >
                          Acknowledge
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
