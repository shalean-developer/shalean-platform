"use client";

import { useAdminData } from "@/hooks/useAdminData";

type Payload = { startDate: string; endDate: string; rows: Array<{ page_url:string; query:string; clicks:number; impressions:number; ctr:number; avg_position:number|null }> };
export function ServiceQueryVisibility() {
  const { data, loading, error } = useAdminData<Payload>("/api/admin/seo-insights/service-queries");
  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">Loading service queries…</div>;
  if (error) return <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">Service query data unavailable: {error}</div>;
  if (!data) return null;
  return <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 px-5 py-4"><h2 className="font-semibold text-slate-900">Search queries</h2><p className="text-xs text-slate-500">{data.startDate} to {data.endDate} · highest-impression service queries first</p></div><div className="max-h-[520px] overflow-auto"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Page</th><th className="px-4 py-3">Query</th><th className="px-4 py-3 text-right">Clicks</th><th className="px-4 py-3 text-right">Impr.</th><th className="px-4 py-3 text-right">CTR</th><th className="px-4 py-3 text-right">Pos.</th></tr></thead><tbody className="divide-y divide-slate-100">{data.rows.map((row,i)=><tr key={`${row.page_url}-${row.query}-${i}`}><td className="max-w-[260px] truncate px-4 py-3 text-slate-600">{new URL(row.page_url).pathname}</td><td className="px-4 py-3 font-medium text-slate-900">{row.query}</td><td className="px-4 py-3 text-right">{row.clicks}</td><td className="px-4 py-3 text-right">{row.impressions}</td><td className="px-4 py-3 text-right">{(row.ctr*100).toFixed(1)}%</td><td className="px-4 py-3 text-right">{row.avg_position?.toFixed(1) ?? "—"}</td></tr>)}</tbody></table>{data.rows.length===0?<p className="p-6 text-sm text-slate-500">No service query rows returned for this period.</p>:null}</div></div>;
}
