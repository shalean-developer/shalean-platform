"use client";

import { useMemo, useState } from "react";
import { useAdminData } from "@/hooks/useAdminData";

type Row={
  keyword_id:string;keyword:string;target_path:string|null;service_name:string|null;intent:string|null;priority:string;
  feature_type:string|null;owner_type:"shalean"|"competitor"|"other"|"unowned";owner_domain:string|null;url:string|null;title:string|null;position:number|null;observed_at:string|null;
  status:"win"|"loss"|"opportunity"|"no_data";
};
type Payload={summary:{trackedKeywords:number;featureObservations:number;wins:number;competitorOwned:number;opportunities:number;noData:number};rows:Row[];featureTypes:string[]};

const LABELS:Record<string,string>={featured_snippet:"Featured snippet",local_pack:"Local pack",people_also_ask:"People Also Ask",images:"Images",video:"Video",ai_overview:"AI Overview",knowledge_panel:"Knowledge panel",other:"Other"};

export function SearchAppearanceDashboard(){
  const {data,loading,error}=useAdminData<Payload>("/api/admin/seo-insights/search-appearance");
  const [feature,setFeature]=useState("all");
  const [status,setStatus]=useState("all");
  const rows=useMemo(()=>{
    const source=data?.rows??[];
    return source.filter((row)=>(feature==="all"||row.feature_type===feature)&&(status==="all"||row.status===status));
  },[data,feature,status]);

  if(loading&&!data) return <div className="rounded-2xl border bg-white p-6">Loading search appearance…</div>;
  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold text-slate-950">Search Appearance & SERP Features</h1><p className="mt-1 text-sm text-slate-600">Track featured snippets, local packs, images, video, People Also Ask, AI Overviews and other search features using the same SERP snapshots as competitor intelligence.</p></div>
    {error&&<div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">{[["Keywords",data?.summary.trackedKeywords],["Observations",data?.summary.featureObservations],["Shalean wins",data?.summary.wins],["Competitor-owned",data?.summary.competitorOwned],["Opportunities",data?.summary.opportunities],["No data",data?.summary.noData]].map(([k,v])=><div key={String(k)} className="rounded-2xl border bg-white p-4"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k}</div><div className="mt-2 text-2xl font-bold text-slate-950">{v??0}</div></div>)}</div>
    <div className="flex flex-wrap gap-3 rounded-2xl border bg-white p-4"><select value={feature} onChange={e=>setFeature(e.target.value)} className="rounded-xl border px-3 py-2 text-sm"><option value="all">All features</option>{(data?.featureTypes??[]).map(type=><option key={type} value={type}>{LABELS[type]??type}</option>)}</select><select value={status} onChange={e=>setStatus(e.target.value)} className="rounded-xl border px-3 py-2 text-sm"><option value="all">All statuses</option><option value="win">Shalean wins</option><option value="loss">Competitor wins</option><option value="opportunity">Opportunities</option><option value="no_data">No data</option></select></div>
    <div className="overflow-x-auto rounded-2xl border bg-white"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="p-3">Keyword</th><th className="p-3">Feature</th><th className="p-3">Owner</th><th className="p-3">Position</th><th className="p-3">Target page</th><th className="p-3">Status</th><th className="p-3">Observed</th></tr></thead><tbody>{rows.map((row,index)=><tr key={`${row.keyword_id}:${row.feature_type??"none"}:${row.owner_domain??"none"}:${index}`} className="border-t align-top"><td className="p-3"><div className="font-semibold text-slate-950">{row.keyword}</div><div className="text-xs text-slate-500">{row.service_name||row.intent||row.priority}</div></td><td className="p-3">{row.feature_type?LABELS[row.feature_type]??row.feature_type:"No feature data"}</td><td className="p-3"><div className="capitalize font-medium">{row.owner_type}</div><div className="text-xs text-slate-500">{row.owner_domain||"—"}</div></td><td className="p-3">{row.position==null?"—":`#${row.position}`}</td><td className="p-3">{row.target_path||"—"}</td><td className="p-3 capitalize font-semibold">{row.status.replace("_"," ")}</td><td className="p-3 text-xs text-slate-500">{row.observed_at?new Date(row.observed_at).toLocaleString():"—"}</td></tr>)}</tbody></table>{!rows.length&&<div className="p-8 text-center text-sm text-slate-500">No SERP-feature observations match these filters.</div>}</div>
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Feature data is collected during the existing competitor SERP sync. If no SERP provider is configured, this workspace remains available but will show no fresh observations.</div>
  </div>;
}
