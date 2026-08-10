"use client";

import { useAdminData } from "@/hooks/useAdminData";
import { cn } from "@/lib/utils";

type Issue = { code: string; severity: "high" | "medium" | "low"; message: string };
type Row = {
  id: string;
  slug: string;
  title: string;
  primary_keyword: string | null;
  semantic_cluster: string | null;
  health: "critical" | "warning" | "healthy";
  issues: Issue[];
  gsc: { clicks: number; impressions: number; avg_position: number | null; prev_clicks: number; prev_impressions: number } | null;
};
type Payload = {
  summary: { published: number; critical: number; warning: number; healthy: number; cannibalisation: number; declining: number };
  rows: Row[];
};

export function BlogSeoHealthDashboard() {
  const { data, loading, error } = useAdminData<Payload>("/api/admin/seo-insights/blog-health");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Blog SEO Health</h1>
        <p className="mt-1 text-sm text-slate-500">Find missing metadata, duplicate search intent and blog pages losing organic performance.</p>
      </div>
      {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
      {loading ? <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading blog SEO health…</div> : null}
      {data ? <>
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {[
            ["Published", data.summary.published], ["Critical", data.summary.critical], ["Warnings", data.summary.warning],
            ["Healthy", data.summary.healthy], ["Cannibalisation", data.summary.cannibalisation], ["Declining", data.summary.declining],
          ].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"><p className="text-xs uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-slate-900">{value}</p></div>)}
        </div>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-semibold text-slate-900">Action queue</h2><p className="text-xs text-slate-500">Critical pages appear first. Open the blog editor to apply the recommendation.</p></div>
          <div className="divide-y divide-slate-100">
            {data.rows.map((row) => <div key={row.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><a href={`/office/blog/${row.id}`} className="font-semibold text-slate-900 hover:underline">{row.title}</a><p className="mt-1 text-xs text-slate-500">/blog/{row.slug} · Keyword: {row.primary_keyword || "not set"}</p></div>
                <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", row.health === "critical" ? "bg-red-100 text-red-700" : row.health === "warning" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700")}>{row.health}</span>
              </div>
              {row.gsc ? <p className="mt-3 text-xs text-slate-500">GSC: {row.gsc.clicks} clicks · {row.gsc.impressions} impressions · position {row.gsc.avg_position?.toFixed(1) ?? "—"}</p> : null}
              {row.issues.length ? <ul className="mt-3 space-y-2">{row.issues.map((issue) => <li key={issue.code} className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700"><span className="font-medium">{issue.severity.toUpperCase()}:</span> {issue.message}</li>)}</ul> : <p className="mt-3 text-sm text-emerald-700">No actionable SEO issues detected.</p>}
            </div>)}
            {data.rows.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">No published blog posts found.</div> : null}
          </div>
        </div>
      </> : null}
    </div>
  );
}
