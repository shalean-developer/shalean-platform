"use client";

import { RefreshCw } from "lucide-react";
import { OpsHealthDashboard, type OpsHealthPayload } from "@/components/admin/OpsHealthDashboard";
import { getSupabaseAccessToken } from "@/lib/supabase/browser";

type Props = {
  data: OpsHealthPayload | null;
  loading?: boolean;
  error?: string | null;
  showAcknowledged?: boolean;
  onToggleAcknowledged?: () => void;
  onRefresh?: () => void | Promise<void>;
  onViewService?: (serviceId: string) => void;
};

/** Production health findings panel — data is supplied by the parent page (single scan). */
export function OpsHealthFullPanel({
  data,
  loading = false,
  error = null,
  showAcknowledged = false,
  onToggleAcknowledged,
  onRefresh,
  onViewService,
}: Props) {
  const handleAckAction = (finding: OpsHealthPayload["summaries"][number], status: "acknowledged" | "resolved") => {
    void (async () => {
      const token = await getSupabaseAccessToken();
      if (!token) return;
      const promptLabel = status === "acknowledged" ? "Optional acknowledgement note" : "Optional resolution note";
      const note = window.prompt(promptLabel, "")?.trim();
      await fetch("/api/admin/ops-health", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          code: finding.code,
          sampleIds: finding.sampleIds,
          status,
          note: note || undefined,
        }),
      });
      if (onRefresh) await onRefresh();
    })();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <h2 className="text-sm font-bold text-slate-800">Production health findings</h2>
          <p className="text-xs text-slate-500">
            Unified scan across service probes, delivery metrics, and production drift signals.
          </p>
        </div>
        {onRefresh ? (
          <button
            type="button"
            disabled={loading}
            onClick={() => void onRefresh()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden />
            Refresh scan
          </button>
        ) : null}
      </div>

      {loading && !data ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</div>
      ) : data ? (
        <OpsHealthDashboard
          data={data}
          showAcknowledged={showAcknowledged}
          onToggleAcknowledged={onToggleAcknowledged}
          onViewService={onViewService}
          onAcknowledge={(finding) => handleAckAction(finding, "acknowledged")}
          onResolveAcknowledgement={(finding) => handleAckAction(finding, "resolved")}
        />
      ) : null}
    </div>
  );
}
