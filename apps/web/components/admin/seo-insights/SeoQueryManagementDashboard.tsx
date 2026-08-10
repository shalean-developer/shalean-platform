"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAdminData } from "@/hooks/useAdminData";

type QueryRow = { query:string; slug:string; landing_page:string; clicks:number; impressions:number; ctr:number|null; avg_position:number|null; prev_clicks?:number; prev_impressions?:number; prev_avg_position?:number|null };
type Payload = { gsc_query_snapshot?:QueryRow[]; gsc_query_count?:number; gsc_queries_synced_at?:string|null };

function oneDecimal(value:number|null|undefined){ return value == null || !Number.isFinite(value) ? "—" : value.toFixed(1); }
function pct(value:number|null|undefined){ return value == null || !Number.isFinite(value) ? "—" : `${(value*100).toFixed(1)}%`; }

export function SeoQueryManagementDashboard(){
  const {data,loading,error}=useAdminData<Payload>("/api/admin/seo-insights");
  const rows=useMemo(()=>[...(data?.gsc_query_snapshot??[])].sort((a,b)=>b.impressions-a.impressions),[data]);
  return <div className="space-y-5">
    <div><h1 className="text-2xl font-bold text-slate-900">Search queries</h1><p className="mt-1 text-sm text-slate-500">Whole-site Search Console query visibility. Average position is normalized to one decimal place.</p></div>
    {error?<div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>:null}
    {loading?<div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">Loading Search Console queries…</div>:null}
    {!loading&&data?<div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4"><div><h2 className="font-semibold text-slate-900">Query performance</h2><p className="text-xs text-slate-500">{data.gsc_query_count??rows.length} stored queries{data.gsc_queries_synced_at?` · synced ${new Date(data.gsc_queries_synced_at).toLocaleString("en-ZA")}`:""}</p></div><Link href="/office/seo-insights/page-groups" className="text-xs font-semibold text-slate-700 hover:underline">Compare page groups →</Link></div><div className="max-h-[680px] overflow-auto"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Query</th><th className="px-4 py-3">Landing page</th><th className="px-4 py-3 text-right">Clicks</th><th className="px-4 py-3 text-right">Impressions</th><th className="px-4 py-3 text-right">CTR</th><th className="px-4 py-3 text-right">Position</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map((row,i)=><tr key={`${row.query}-${row.landing_page}-${i}`}><td className="px-4 py-3 font-medium text-slate-900">{row.query}</td><td className="max-w-[280px] truncate px-4 py-3 text-slate-500">{row.landing_page}</td><td className="px-4 py-3 text-right tabular-nums">{row.clicks}</td><td className="px-4 py-3 text-right tabular-nums">{row.impressions}</td><td className="px-4 py-3 text-right tabular-nums">{pct(row.ctr)}</td><td className="px-4 py-3 text-right tabular-nums">{oneDecimal(row.avg_position)}</td></tr>)}</tbody></table>{rows.length===0?<div className="p-8 text-center text-sm text-slate-500">No Search Console query rows are available yet.</div>:null}</div></div>:null}
  </div>;
}
