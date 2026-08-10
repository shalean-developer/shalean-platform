"use client";

import { useAdminData } from "@/hooks/useAdminData";
import { cn } from "@/lib/utils";

type Run = {
  id: string;
  job: "gsc-sync" | "seo-optimization" | "sitemap-health" | "robots-health";
  status: "success" | "error";
  created_at: string;
  detail: string | null;
  metrics: Record<string, number | null>;
  errors: string[];
};

type Payload = {
  runs: Run[];
  run_count: number;
};

const LABELS = {
  "gsc-sync": "GSC sync",
  "seo-optimization": "SEO optimization",
  "sitemap-health": "Sitemap health",
  "robots-health": "Robots health",
} as const;

function metricLabel(key: string) {
  return key.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function SeoAutomationHistory() {
  const { data, loading, error } = useAdminData<Payload>("/api/admin/seo-insights/automation-history");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">SEO Automation History</h1>
        <p className="mt-1 text-sm text-slate-500">
          Recent Search Console sync, SEO optimizer, sitemap and robots health runs, including processing metrics and failures.
        </p>
      </div>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
      {loading ? <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading SEO automation history…</div> : null}

      {!loading && data ? (
        <div className="space-y-3">
          {data.runs.map((run) => (
            <article key={run.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-slate-900">{LABELS[run.job]}</h2>
                    <span className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-semibold",
                      run.status === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700",
                    )}>
                      {run.status === "success" ? "Success" : "Failed"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{new Date(run.created_at).toLocaleString("en-ZA")}</p>
                  {run.detail ? <p className="mt-2 text-sm text-slate-600">{run.detail}</p> : null}
                </div>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {Object.entries(run.metrics)
                  .filter(([, value]) => value != null)
                  .map(([key, value]) => (
                    <div key={key} className="rounded-xl bg-slate-50 px-3 py-2">
                      <p className="text-xs text-slate-500">{metricLabel(key)}</p>
                      <p className="mt-0.5 font-semibold tabular-nums text-slate-900">{Number(value).toLocaleString()}</p>
                    </div>
                  ))}
              </div>

              {run.errors.length > 0 ? (
                <div className="mt-4 rounded-xl border border-red-100 bg-red-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Errors</p>
                  {run.errors.map((item, index) => <p key={`${run.id}-${index}`} className="mt-1 text-sm text-red-700">{item}</p>)}
                </div>
              ) : null}
            </article>
          ))}

          {data.runs.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
              No SEO automation run records yet. The next GSC, optimizer, sitemap or robots health run will appear here.
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
