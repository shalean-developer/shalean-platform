"use client";

import { useMemo, useState } from "react";
import { adminFetch, useAdminData } from "@/hooks/useAdminData";

type QueueRow={post:{id:string;slug:string;title:string;primary_keyword:string|null};gsc:{clicks:number;impressions:number;avg_position:number|null}|null;reasons:string[];refresh:any;comparison:{clicks_delta:number;impressions_delta:number;position_delta:number|null}|null};
type Payload={summary:{queue:number;unassigned:number;overdue:number;completed:number};queue:QueueRow[];history:any[]};

export function ContentRefreshDashboard(){
  const {data,loading,error,refresh}=useAdminData<Payload>("/api/admin/seo-insights/content-refresh");
  const [saving,setSaving]=useState<string|null>(null);
  const [status,setStatus]=useState("all");
  const rows=useMemo(()=>status==="all"?(data?.queue??[]):(data?.queue??[]).filter(r=>(r.refresh?.status??"unqueued")===status),[data,status]);

  async function queue(row:QueueRow){ setSaving(row.post.id); try{ await adminFetch("/api/admin/seo-insights/content-refresh",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({blog_post_id:row.post.id,reason_codes:row.reasons,due_date:new Date(Date.now()+14*86400000).toISOString().slice(0,10)})}); await refresh(); } finally{ setSaving(null); } }
  async function patch(id:string,payload:any){ setSaving(id); try{ await adminFetch("/api/admin/seo-insights/content-refresh",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,...payload})}); await refresh(); } finally{ setSaving(null); } }

  if(loading&&!data) return <div className="rounded-2xl border bg-white p-6">Loading content refresh calendar…</div>;
  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold text-slate-950">Content Refresh Calendar</h1><p className="mt-1 text-sm text-slate-600">Turn declining blog content into an assigned refresh queue, track due dates and history, then verify results against later GSC performance.</p></div>
    {error&&<div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[["Refresh queue",data?.summary.queue],["Unassigned",data?.summary.unassigned],["Overdue",data?.summary.overdue],["Completed",data?.summary.completed]].map(([k,v])=><div key={String(k)} className="rounded-2xl border bg-white p-4"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k}</div><div className="mt-2 text-2xl font-bold">{v??0}</div></div>)}</div>
    <div className="rounded-2xl border bg-white p-4"><select value={status} onChange={e=>setStatus(e.target.value)} className="rounded-xl border px-3 py-2 text-sm"><option value="all">All refreshes</option><option value="unqueued">Detected / not queued</option><option value="queued">Queued</option><option value="in_progress">In progress</option><option value="completed">Completed</option></select></div>
    <div className="space-y-3">{rows.map(row=><div key={row.post.id} className="rounded-2xl border bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><a href={`/office/blog/${row.post.id}`} className="font-semibold text-slate-950 hover:underline">{row.post.title}</a><div className="mt-1 text-xs text-slate-500">/blog/{row.post.slug} · {row.post.primary_keyword||"no primary keyword"}</div></div><div className="text-xs font-semibold uppercase text-slate-500">{row.refresh?.status??"detected"}</div></div>
      <div className="mt-3 flex flex-wrap gap-2">{row.reasons.map(r=><span key={r} className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">{r.replaceAll("_"," ")}</span>)}</div>
      {row.gsc&&<div className="mt-3 text-sm text-slate-600">Current GSC: {row.gsc.clicks} clicks · {row.gsc.impressions} impressions · position {row.gsc.avg_position?.toFixed(1)??"—"}</div>}
      {row.refresh?<div className="mt-4 grid gap-3 md:grid-cols-4"><input className="rounded-xl border px-3 py-2 text-sm" defaultValue={row.refresh.owner_email??""} placeholder="Owner email" onBlur={e=>patch(row.refresh.id,{owner_email:e.target.value})}/><input className="rounded-xl border px-3 py-2 text-sm" defaultValue={row.refresh.editor_email??""} placeholder="Editor email" onBlur={e=>patch(row.refresh.id,{editor_email:e.target.value})}/><input type="date" className="rounded-xl border px-3 py-2 text-sm" defaultValue={row.refresh.due_date??""} onBlur={e=>patch(row.refresh.id,{due_date:e.target.value})}/><div className="flex gap-2">{row.refresh.status==="queued"&&<button className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white" disabled={saving===row.refresh.id} onClick={()=>patch(row.refresh.id,{status:"in_progress"})}>Start</button>}{row.refresh.status==="in_progress"&&<button className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white" disabled={saving===row.refresh.id} onClick={()=>patch(row.refresh.id,{status:"completed"})}>Complete</button>}{row.refresh.status==="completed"&&!row.refresh.verified_at&&<button className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white" disabled={saving===row.refresh.id} onClick={()=>patch(row.refresh.id,{verify:true})}>Verify</button>}</div></div>:<button className="mt-4 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white" disabled={saving===row.post.id} onClick={()=>queue(row)}>Add to refresh queue</button>}
      {row.comparison&&<div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">Post-refresh comparison: clicks {row.comparison.clicks_delta>=0?"+":""}{row.comparison.clicks_delta}, impressions {row.comparison.impressions_delta>=0?"+":""}{row.comparison.impressions_delta}, position {row.comparison.position_delta==null?"—":`${row.comparison.position_delta>=0?"+":""}${row.comparison.position_delta.toFixed(1)}`}</div>}
    </div>)}{!rows.length&&<div className="rounded-2xl border bg-white p-8 text-center text-sm text-slate-500">No content refresh items match this filter.</div>}</div>
  </div>;
}
