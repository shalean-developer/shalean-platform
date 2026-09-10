"use client";

import { useCallback, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  XCircle,
  AlertCircle,
  Info,
} from "lucide-react";
import { adminFetch, useAdminData } from "@/hooks/useAdminData";
import type { LaunchCheckResult, LaunchCheckRunResponse, OfficeLaunchCheckStatus } from "@/lib/launch/types";
import { cn } from "@/lib/utils";
import {
  OfficeZohoPageHeader,
  OfficeZohoSecondaryButton,
} from "@/components/admin/office/OfficeZohoChrome";

const SOURCE_LABELS: Record<OfficeLaunchCheckStatus["config"]["sources"]["customerUserId"], string> = {
  env: "Env",
  discovered: "Auto",
  session: "Session",
  missing: "Missing",
};

function ConfigChip({
  label,
  value,
  source,
}: {
  label: string;
  value: string | null;
  source: OfficeLaunchCheckStatus["config"]["sources"]["customerUserId"];
}) {
  const ok = Boolean(value);
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2",
        ok ? "border-slate-200 bg-white" : "border-amber-200 bg-amber-50/60",
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 truncate font-mono text-xs text-slate-800">{value ?? "Not configured"}</p>
      <p className="mt-1 text-[10px] font-medium text-slate-500">{SOURCE_LABELS[source]}</p>
    </div>
  );
}

function CheckRow({ item }: { item: LaunchCheckResult }) {
  const [open, setOpen] = useState(false);
  const hasDetails = Boolean(item.error || item.details);
  const isWarning = item.passed && Boolean(item.error);

  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3",
        item.passed
          ? isWarning
            ? "border-amber-200 bg-amber-50/50"
            : "border-emerald-200 bg-emerald-50/50"
          : "border-red-200 bg-red-50/60",
      )}
    >
      <div className="flex items-start gap-3">
        {item.passed ? (
          isWarning ? (
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
          ) : (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
          )
        ) : (
          <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p
                className={cn(
                  "font-semibold",
                  item.passed
                    ? isWarning
                      ? "text-amber-900"
                      : "text-emerald-900"
                    : "text-red-900",
                )}
              >
                {item.label}
              </p>
              <p className="text-xs text-slate-500">{item.id}</p>
            </div>
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide",
                item.passed
                  ? isWarning
                    ? "bg-amber-100 text-amber-800"
                    : "bg-emerald-100 text-emerald-800"
                  : "bg-red-100 text-red-800",
              )}
            >
              {item.passed ? (isWarning ? "Info" : "Pass") : "Fail"}
            </span>
          </div>
          {item.error ? (
            <p className={cn("mt-2 text-sm", isWarning ? "text-amber-800" : "text-red-700")}>{item.error}</p>
          ) : null}
          {hasDetails ? (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900"
            >
              {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              {open ? "Hide details" : "Show details"}
            </button>
          ) : null}
          {open && item.details ? (
            <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-slate-900/5 p-3 text-xs text-slate-700">
              {JSON.stringify(item.details, null, 2)}
            </pre>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function OfficeLaunchCheckPage() {
  const { data: status, loading, error, refetch } = useAdminData<OfficeLaunchCheckStatus>("/api/admin/launch-check");
  const [runState, setRunState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [runData, setRunData] = useState<LaunchCheckRunResponse | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const runChecks = useCallback(async () => {
    setRunState("loading");
    setRunError(null);
    const res = await adminFetch<LaunchCheckRunResponse>("/api/admin/launch-check", { method: "POST" });
    if (!res.ok || !res.data || res.data.ok !== true) {
      setRunState("error");
      setRunData(null);
      setRunError(res.error ?? "Launch check failed.");
      return;
    }
    setRunData(res.data);
    setRunState("ready");
    void refetch();
  }, [refetch]);

  const summary = runData?.summary;
  const blockingFailed = runData?.results?.filter((r) => !r.passed).length ?? 0;

  return (
    <div className="space-y-5">
      <OfficeZohoPageHeader
        title="Launch readiness"
        subtitle="End-to-end checks for booking persistence, dashboards, payment status, references, and role routing. Creates a tagged test booking, verifies all surfaces, then cleans up."
        actions={
          <OfficeZohoSecondaryButton
            disabled={loading || runState === "loading" || status?.configReady === false}
            onClick={() => void runChecks()}
          >
            <RefreshCw className={cn("h-4 w-4", runState === "loading" && "animate-spin")} />
            Run checklist
          </OfficeZohoSecondaryButton>
        }
      />

      {error ? (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : null}

      {status ? (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900">Test identities</h2>
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                status.configReady ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800",
              )}
            >
              {status.configReady ? "Ready to run" : "Setup incomplete"}
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <ConfigChip label="Customer" value={status.config.customerUserId} source={status.config.sources.customerUserId} />
            <ConfigChip label="Cleaner" value={status.config.cleanerId} source={status.config.sources.cleanerId} />
            <ConfigChip label="Cleaner auth" value={status.config.cleanerUserId} source={status.config.sources.cleanerUserId} />
            <ConfigChip label="Admin" value={status.config.adminUserId} source={status.config.sources.adminUserId} />
          </div>
          {status.setupHints.length > 0 ? (
            <ul className="space-y-1 text-sm text-slate-600">
              {status.setupHints.map((hint) => (
                <li key={hint} className="flex items-start gap-2">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                  {hint}
                </li>
              ))}
            </ul>
          ) : null}
          {status.placeholderCount > 0 ? (
            <p className="text-xs text-slate-500">
              {status.placeholderCount} office page(s) still on placeholder data — listed in the placeholder audit check.
            </p>
          ) : null}
        </div>
      ) : loading ? (
        <div className="h-28 animate-pulse rounded-2xl bg-slate-100" />
      ) : null}

      {summary ? (
        <div
          className={cn(
            "rounded-xl border px-4 py-3 text-sm font-medium",
            blockingFailed === 0
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-800",
          )}
        >
          {summary.passed} / {summary.total} checks passed
          {blockingFailed > 0 ? ` · ${blockingFailed} blocking failure(s)` : ""}
          {runData?.generatedAt ? (
            <span className="ml-2 font-normal text-slate-600">
              · {new Date(runData.generatedAt).toLocaleString()}
            </span>
          ) : null}
        </div>
      ) : null}

      {runState === "loading" ? (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      ) : null}

      {runState === "error" && runError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{runError}</div>
      ) : null}

      {runState === "ready" && runData?.results?.length ? (
        <div className="space-y-3">
          {runData.results.map((item) => (
            <CheckRow key={item.id} item={item} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
