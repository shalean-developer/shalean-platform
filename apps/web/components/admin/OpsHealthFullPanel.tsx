"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { OpsHealthDashboard, type OpsHealthPayload } from "@/components/admin/OpsHealthDashboard";
import { getSupabaseAccessToken } from "@/lib/supabase/browser";

type LoadState = "loading" | "ready" | "error";

type Props = {
  initialData?: OpsHealthPayload | null;
  onRefreshAll?: () => void | Promise<void>;
  onViewService?: (serviceId: string) => void;
};

/** Unified production health findings with acknowledge controls. */
export function OpsHealthFullPanel({ initialData = null, onRefreshAll, onViewService }: Props) {
  const [state, setState] = useState<LoadState>(initialData ? "ready" : "loading");
  const [data, setData] = useState<OpsHealthPayload | null>(initialData);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showAcknowledged, setShowAcknowledged] = useState(false);

  useEffect(() => {
    if (initialData) {
      setData(initialData);
      setState("ready");
    }
  }, [initialData]);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    const token = await getSupabaseAccessToken();
    if (!token) {
      setState("error");
      setError("Sign in as admin.");
      setRefreshing(false);
      return;
    }

    try {
      const qs = showAcknowledged ? "?includeAcknowledged=1" : "";
      const res = await fetch(`/api/admin/ops-health${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json().catch(() => ({}))) as Partial<OpsHealthPayload> & { error?: string };
      if (!res.ok || json.ok !== true) {
        setState("error");
        setData(null);
        setError(json.error ?? "Could not load ops health.");
        return;
      }
      setData(json as OpsHealthPayload);
      setState("ready");
    } catch (err) {
      setState("error");
      setData(null);
      setError(err instanceof Error ? err.message : "Could not load ops health.");
    } finally {
      setRefreshing(false);
    }
  }, [showAcknowledged]);

  useEffect(() => {
    if (!initialData) void load();
  }, [initialData, load]);

  const handleRefresh = () => {
    void (async () => {
      if (onRefreshAll) await onRefreshAll();
      await load();
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
        <button
          type="button"
          disabled={refreshing}
          onClick={handleRefresh}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden />
          Refresh scan
        </button>
      </div>

      {state === "loading" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : state === "error" ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error ?? "Could not load ops health."}</div>
      ) : data ? (
        <OpsHealthDashboard
          data={data}
          showAcknowledged={showAcknowledged}
          onToggleAcknowledged={() => setShowAcknowledged((v) => !v)}
          onViewService={onViewService}
          onAcknowledge={(finding) => {
            void (async () => {
              const token = await getSupabaseAccessToken();
              if (!token) return;
              const note = window.prompt("Optional acknowledgement note", "")?.trim();
              await fetch("/api/admin/ops-health", {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                  code: finding.code,
                  sampleIds: finding.sampleIds,
                  status: "acknowledged",
                  note: note || undefined,
                }),
              });
              await load();
            })();
          }}
          onResolveAcknowledgement={(finding) => {
            void (async () => {
              const token = await getSupabaseAccessToken();
              if (!token) return;
              const note = window.prompt("Optional resolution note", "")?.trim();
              await fetch("/api/admin/ops-health", {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                  code: finding.code,
                  sampleIds: finding.sampleIds,
                  status: "resolved",
                  note: note || undefined,
                }),
              });
              await load();
            })();
          }}
        />
      ) : null}
    </div>
  );
}
