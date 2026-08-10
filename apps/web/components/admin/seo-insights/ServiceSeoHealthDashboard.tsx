"use client";

import { useAdminData } from "@/hooks/useAdminData";
import { cn } from "@/lib/utils";

type Payload = {
  summary: { servicePages: number; tracked: number; critical: number; warning: number; healthy: number };
  rows: Array<{
    path: string;
    url: string;
    health: "critical" | "warning" | "healthy";
    metric: { clicks: number; impressions: number; ctr: number; avg_position: number | null; prev_clicks: number; prev_impressions: number } | null;
    issues: Array<{ code: string; severity: "high" | "medium" | "low"; message: string }>;
  }>;
};

export function ServiceSeoHealthDashboard() {
  const { data, loading, error } = useAdminData<Payload>("/api/admin/seo-insights/service-health");
  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold text-slate-900">Service-page SEO</h1><p className="mt-1 text-sm text-slate-500">GSC visibility and prioritized health recommendations for every indexable service page.</p></div>
    {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
    {loading ? <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading service-page SEO…</div> : null}
    {data ? <>
      <div className="grid gap-3 md:grid-cols-5">{[["Service pages",data.summary.servicePages],["GSC tracked",data.summary.tracked],["Critical",data.summary.critical],["Warnings",data.summary.warning],["Healthy",data.summary.healthy]].map(([label,value]) => <div key={String(label)} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"><p className="text-xs uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-slate-900">{value}</p></div>)}</div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 px-5 py-4"><h2 className="font-semibold text-slate-900">Service SEO action queue</h2></div><div className="divide-y divide-slate-100">
        {data.rows.map((row) => <div key={row.path} className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><a href={row.url} target="_blank" rel="noreferrer" className="font-semibold text-slate-900 hover:underline">{row.path}</a>{row.metric ? <p className="mt-1 text-xs text-slate-500">{row.metric.clicks} clicks · {row.metric.impressions} impressions · CTR {(row.metric.ctr*100).toFixed(1)}% · position {row.metric.avg_position?.toFixed(1) ?? "—"}</p> : <p className="mt-1 text-xs text-slate-500">No GSC metrics stored for this page.</p>}</div><span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold",row.health==="critical"?"bg-red-100 text-red-700":row.health==="warning"?"bg-amber-100 text-amber-700":"bg-emerald-100 text-emerald-700")}>{row.health}</span></div>{row.issues.length ? <ul className="mt-3 space-y-2">{row.issues.map((issue)=><li key={issue.code} className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700"><span className="font-medium">{issue.severity.toUpperCase()}:</span> {issue.message}</li>)}</ul>:<p className="mt-3 text-sm text-emerald-700">No actionable service-page SEO issues detected.</p>}</div>)}
      </div></div>
    </> : null}
  </div>;
}
