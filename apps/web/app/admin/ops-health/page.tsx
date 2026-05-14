"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { OpsHealthDashboard, type OpsHealthPayload } from "@/components/admin/OpsHealthDashboard";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

type LoadState = "loading" | "ready" | "error";

export default function AdminOpsHealthPage() {
  const [state, setState] = useState<LoadState>("loading");
  const [data, setData] = useState<OpsHealthPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showAcknowledged, setShowAcknowledged] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    const sb = getSupabaseBrowser();
    const token = (await sb?.auth.getSession())?.data.session?.access_token;
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
    void load();
  }, [load]);

  return (
    <main className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Ops Health</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
            Read-only production health scan across payment, lifecycle, dispatch, payout, recurring, duration, workload, and cron signals.
          </p>
        </div>
        <button
          type="button"
          disabled={refreshing}
          onClick={() => void load()}
          className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          <RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden />
          Refresh
        </button>
      </div>

      {state === "loading" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />
          ))}
        </div>
      ) : state === "error" ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-100">
          {error ?? "Could not load ops health."}
        </div>
      ) : data ? (
        <OpsHealthDashboard
          data={data}
          showAcknowledged={showAcknowledged}
          onToggleAcknowledged={() => setShowAcknowledged((v) => !v)}
          onAcknowledge={(finding) => {
            void (async () => {
              const sb = getSupabaseBrowser();
              const token = (await sb?.auth.getSession())?.data.session?.access_token;
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
              const sb = getSupabaseBrowser();
              const token = (await sb?.auth.getSession())?.data.session?.access_token;
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
    </main>
  );
}
