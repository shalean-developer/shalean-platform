"use client";

import { useMemo, useState } from "react";
import { adminFetch, useAdminData } from "@/hooks/useAdminData";

type KeywordRow = {
  id:string; keyword:string; target_path:string|null; service_name:string|null; location_name:string; language_code:string; device:"desktop"|"mobile"; priority:"p0"|"p1"|"p2"; intent:string|null; baseline_rank:number|null; target_rank:number|null; owner_email:string|null; notes:string|null; active:boolean; current_rank:number|null; current_impressions:number; current_clicks:number; missing_target_page:boolean; target_page_has_gsc:boolean; shared_target_keywords:string[];
};
type Payload = { summary:{total:number;active:number;missingTarget:number;withGoal:number;withoutBaseline:number}; rows:KeywordRow[] };

export function KeywordPortfolioDashboard(){
  const {data,loading,error,refetch}=useAdminData<Payload>("/api/admin/seo-insights/keywords");
  const [saving,setSaving]=useState(false);
  const [form,setForm]=useState({keyword:"",target_path:"",service_name:"",location_name:"Cape Town, Western Cape, South Africa",device:"desktop",priority:"p1",intent:"local",baseline_rank:"",target_rank:"10"});
  const rows=useMemo(()=>data?.rows??[],[data]);
  const cannibalisation=rows.filter(r=>r.active&&r.shared_target_keywords.length>0);

  async function add(){
    if(!form.keyword.trim()) return;
    setSaving(true);
    const res=await adminFetch("/api/admin/seo-insights/keywords",{method:"POST",body:JSON.stringify(form)});
    setSaving(false);
    if(res.ok){setForm({...form,keyword:"",target_path:"",service_name:"",baseline_rank:""});await refetch();}
  }

  async function toggle(row:KeywordRow){
    setSaving(true);
    await adminFetch("/api/admin/seo-insights/keywords",{method:"PATCH",body:JSON.stringify({id:row.id,active:!row.active})});
    setSaving(false); await refetch();
  }

  if(loading&&!data) return <div className="rounded-2xl border bg-white p-6">Loading keyword portfolio…</div>;
  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold text-slate-950">Keyword Portfolio</h1><p className="mt-1 text-sm text-slate-600">Canonical target keywords with page ownership, intent, priority, device, baseline rank and ranking goals.</p></div>
    {error&&<div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[["Total",data?.summary.total],["Active",data?.summary.active],["Missing target",data?.summary.missingTarget],["With goal",data?.summary.withGoal],["No baseline",data?.summary.withoutBaseline]].map(([k,v])=><div key={String(k)} className="rounded-2xl border bg-white p-4"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k}</div><div className="mt-2 text-2xl font-bold">{v??0}</div></div>)}</div>
    <div className="rounded-2xl border bg-white p-4"><h2 className="font-bold text-slate-950">Add strategic keyword</h2><div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
      <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Keyword" value={form.keyword} onChange={e=>setForm({...form,keyword:e.target.value})}/>
      <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Target path e.g. /services/deep-cleaning" value={form.target_path} onChange={e=>setForm({...form,target_path:e.target.value})}/>
      <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Service" value={form.service_name} onChange={e=>setForm({...form,service_name:e.target.value})}/>
      <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Location" value={form.location_name} onChange={e=>setForm({...form,location_name:e.target.value})}/>
      <select className="rounded-xl border px-3 py-2 text-sm" value={form.device} onChange={e=>setForm({...form,device:e.target.value})}><option value="desktop">Desktop</option><option value="mobile">Mobile</option></select>
      <select className="rounded-xl border px-3 py-2 text-sm" value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}><option value="p0">P0</option><option value="p1">P1</option><option value="p2">P2</option></select>
      <select className="rounded-xl border px-3 py-2 text-sm" value={form.intent} onChange={e=>setForm({...form,intent:e.target.value})}><option value="local">Local</option><option value="transactional">Transactional</option><option value="commercial">Commercial</option><option value="informational">Informational</option><option value="navigational">Navigational</option></select>
      <div className="grid grid-cols-2 gap-2"><input className="rounded-xl border px-3 py-2 text-sm" placeholder="Baseline" value={form.baseline_rank} onChange={e=>setForm({...form,baseline_rank:e.target.value})}/><input className="rounded-xl border px-3 py-2 text-sm" placeholder="Target" value={form.target_rank} onChange={e=>setForm({...form,target_rank:e.target.value})}/></div>
    </div><button onClick={add} disabled={saving} className="mt-3 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving?"Saving…":"Add keyword"}</button></div>
    {cannibalisation.length>0&&<div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><h2 className="font-bold text-amber-950">Shared target-page review</h2><p className="mt-1 text-sm text-amber-800">Multiple strategic keywords can intentionally share a page, but review these to make sure different search intents are not being forced onto one URL.</p><div className="mt-3 space-y-2 text-sm">{cannibalisation.slice(0,10).map(r=><div key={r.id}><span className="font-semibold">{r.keyword}</span> → {r.target_path} <span className="text-amber-700">also: {r.shared_target_keywords.join(", ")}</span></div>)}</div></div>}
    <div className="overflow-x-auto rounded-2xl border bg-white"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="p-3">Keyword</th><th className="p-3">Target</th><th className="p-3">Intent</th><th className="p-3">Priority</th><th className="p-3">Device</th><th className="p-3">Baseline</th><th className="p-3">Current</th><th className="p-3">Goal</th><th className="p-3">Status</th></tr></thead><tbody>{rows.map(r=><tr key={r.id} className="border-t align-top"><td className="p-3"><div className="font-semibold text-slate-900">{r.keyword}</div><div className="text-xs text-slate-500">{r.service_name||"—"} · {r.location_name}</div></td><td className="p-3">{r.target_path??<span className="font-semibold text-red-600">Missing</span>}</td><td className="p-3 capitalize">{r.intent||"—"}</td><td className="p-3 uppercase">{r.priority}</td><td className="p-3 capitalize">{r.device}</td><td className="p-3">{r.baseline_rank??"—"}</td><td className="p-3">{r.current_rank==null?"—":r.current_rank.toFixed(1)}</td><td className="p-3">{r.target_rank??"—"}</td><td className="p-3"><button onClick={()=>toggle(r)} disabled={saving} className="rounded-lg border px-2 py-1 text-xs font-semibold">{r.active?"Active":"Paused"}</button>{r.target_path&&!r.target_page_has_gsc&&<div className="mt-1 text-xs text-amber-700">No GSC page data yet</div>}</td></tr>)}</tbody></table>{!rows.length&&<div className="p-8 text-center text-sm text-slate-500">No strategic keywords yet.</div>}</div>
  </div>;
}
