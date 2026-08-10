"use client";

import { useState } from "react";
import { adminFetch, useAdminData } from "@/hooks/useAdminData";
import { cn } from "@/lib/utils";

type Status = "open" | "in_progress" | "applied" | "verified" | "dismissed";
type Row = {
  id:string; slug:string|null; kind:string; severity:string; title:string; confidence:number;
  workflow_status:Status; owner_email:string|null; verification_note:string|null;
  started_at:string|null; applied_at:string|null; verified_at:string|null; dismissed_at:string|null; updated_at:string;
};
type Payload = { rows:Row[]; counts:Record<Status|"unassigned",number> };
const STATUS_LABEL: Record<Status,string> = { open:"Open", in_progress:"In Progress", applied:"Applied", verified:"Verified", dismissed:"Dismissed" };

export function SeoRecommendationWorkflowDashboard(){
  const { data, loading, error, refetch } = useAdminData<Payload>("/api/admin/seo-insights/recommendations");
  const [saving,setSaving]=useState<string|null>(null); const [message,setMessage]=useState<string|null>(null);
  async function transition(row:Row,status:Status){
    const owner = window.prompt("Owner email", row.owner_email ?? "") ?? row.owner_email ?? "";
    let note = "";
    if(status==="verified") note = window.prompt("What did you verify after implementation?") ?? "";
    if(status==="dismissed") note = window.prompt("Why is this recommendation being dismissed?") ?? "";
    if((status==="verified"||status==="dismissed")&&!note.trim()) return;
    setSaving(row.id); setMessage(null);
    const res=await adminFetch(`/api/admin/seo-insights/recommendations/${row.id}`,{method:"PATCH",body:JSON.stringify({status,owner_email:owner,note})});
    setSaving(null); if(!res.ok){setMessage(res.error??"Update failed");return;} setMessage(`${row.title}: ${STATUS_LABEL[status]}`); await refetch();
  }
  return <div className="space-y-6"><div><h1 className="text-2xl font-bold text-slate-900">SEO issue workflow</h1><p className="mt-1 text-sm text-slate-500">Assign, implement and verify persisted SEO recommendations with an accountable lifecycle.</p></div>
  {message?<div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">{message}</div>:null}{error?<div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>:null}{loading?<div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading SEO workflow…</div>:null}
  {data?<><div className="grid gap-3 md:grid-cols-6">{(["open","in_progress","applied","verified","dismissed","unassigned"] as const).map(k=><div key={k} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"><p className="text-xs uppercase tracking-wide text-slate-500">{k==="unassigned"?"Unassigned":STATUS_LABEL[k]}</p><p className="mt-2 text-2xl font-bold text-slate-900">{data.counts[k]}</p></div>)}</div>
  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 px-5 py-4"><h2 className="font-semibold text-slate-900">Recommendation queue</h2><p className="text-xs text-slate-500">Verified and dismissed items stay visible as audit evidence.</p></div><div className="divide-y divide-slate-100">{data.rows.map(row=><div key={row.id} className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold text-slate-900">{row.title}</p><p className="mt-1 text-xs text-slate-500">{row.slug??"site-wide"} · {row.kind} · owner {row.owner_email??"unassigned"}</p></div><span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold",row.workflow_status==="verified"?"bg-emerald-100 text-emerald-700":row.workflow_status==="dismissed"?"bg-slate-100 text-slate-600":row.workflow_status==="applied"?"bg-blue-100 text-blue-700":row.workflow_status==="in_progress"?"bg-amber-100 text-amber-700":"bg-red-100 text-red-700")}>{STATUS_LABEL[row.workflow_status]}</span></div>{row.verification_note?<p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{row.verification_note}</p>:null}<div className="mt-3 flex flex-wrap gap-2">{(["open","in_progress","applied","verified","dismissed"] as Status[]).map(status=><button key={status} disabled={saving===row.id||status===row.workflow_status} onClick={()=>void transition(row,status)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40">{STATUS_LABEL[status]}</button>)}</div></div>)}</div></div></>:null}</div>;
}
