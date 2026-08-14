"use client";

import { useMemo, useState } from "react";
import { adminFetch, useAdminData } from "@/hooks/useAdminData";

type KeywordRow = {
  id:string; keyword:string; target_path:string|null; service_name:string|null; location_name:string; language_code:string; device:"desktop"|"mobile"; priority:"p0"|"p1"|"p2"; intent:string|null; baseline_rank:number|null; target_rank:number|null; owner_email:string|null; notes:string|null; active:boolean; current_rank:number|null; current_impressions:number; current_clicks:number; missing_target_page:boolean; target_page_has_gsc:boolean; shared_target_keywords:string[];
};
type Payload = { summary:{total:number;active:number;missingTarget:number;withGoal:number;withoutBaseline:number}; rows:KeywordRow[] };
type EditState = { id:string; keyword:string; target_path:string; service_name:string; location_name:string; device:"desktop"|"mobile"; priority:"p0"|"p1"|"p2"; intent:string; baseline_rank:string; target_rank:string; notes:string };

const inputClass="rounded-xl border px-3 py-2 text-sm";

function toEdit(row:KeywordRow):EditState{
  return {id:row.id,keyword:row.keyword,target_path:row.target_path??"",service_name:row.service_name??"",location_name:row.location_name,device:row.device,priority:row.priority,intent:row.intent??"",baseline_rank:row.baseline_rank?.toString()??"",target_rank:row.target_rank?.toString()??"",notes:row.notes??""};
}

export function KeywordPortfolioDashboard(){
  const {data,loading,error,refetch}=useAdminData<Payload>("/api/admin/seo-insights/keywords");
  const [saving,setSaving]=useState(false);
  const [actionError,setActionError]=useState<string|null>(null);
  const [query,setQuery]=useState("");
  const [statusFilter,setStatusFilter]=useState<"all"|"active"|"paused"|"missing">("all");
  const [editing,setEditing]=useState<EditState|null>(null);
  const [form,setForm]=useState({keyword:"",target_path:"",service_name:"",location_name:"Cape Town, Western Cape, South Africa",device:"desktop",priority:"p1",intent:"local",baseline_rank:"",target_rank:"10",notes:""});
  const rows=useMemo(()=>data?.rows??[],[data]);
  const cannibalisation=rows.filter(r=>r.active&&r.shared_target_keywords.length>0);
  const filteredRows=useMemo(()=>rows.filter(r=>{
    const q=query.trim().toLowerCase();
    const matchesText=!q||[r.keyword,r.target_path,r.service_name,r.location_name,r.intent].some(v=>String(v??"").toLowerCase().includes(q));
    const matchesStatus=statusFilter==="all"||(statusFilter==="active"&&r.active)||(statusFilter==="paused"&&!r.active)||(statusFilter==="missing"&&r.missing_target_page);
    return matchesText&&matchesStatus;
  }),[rows,query,statusFilter]);

  async function runAction(method:"POST"|"PATCH"|"DELETE",body:unknown){
    setSaving(true);setActionError(null);
    const res=await adminFetch("/api/admin/seo-insights/keywords",{method,body:JSON.stringify(body)});
    setSaving(false);
    if(!res.ok){
      const payload=await res.json().catch(()=>({}));
      setActionError(typeof payload.error==="string"?payload.error:"Could not update keyword portfolio.");
      return false;
    }
    await refetch();
    return true;
  }

  async function add(){
    if(!form.keyword.trim()) return;
    if(await runAction("POST",form)) setForm({...form,keyword:"",target_path:"",service_name:"",baseline_rank:"",notes:""});
  }

  async function toggle(row:KeywordRow){await runAction("PATCH",{id:row.id,active:!row.active});}

  async function saveEdit(){
    if(!editing||!editing.keyword.trim()) return;
    if(await runAction("PATCH",editing)) setEditing(null);
  }

  async function remove(row:KeywordRow){
    if(!window.confirm(`Delete keyword “${row.keyword}”? This removes its landing-page ownership from Organic Revenue.`)) return;
    if(await runAction("DELETE",{id:row.id})) setEditing(null);
  }

  if(loading&&!data) return <div className="rounded-2xl border bg-white p-6">Loading keyword portfolio…</div>;
  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold text-slate-950">Keyword Portfolio</h1><p className="mt-1 text-sm text-slate-600">You control which keywords Shalean tracks, which landing page owns each keyword, ranking goals, priority and whether the keyword is active.</p></div>
    {(error||actionError)&&<div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{actionError||error}</div>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[["Total",data?.summary.total],["Active",data?.summary.active],["Missing target",data?.summary.missingTarget],["With goal",data?.summary.withGoal],["No baseline",data?.summary.withoutBaseline]].map(([k,v])=><div key={String(k)} className="rounded-2xl border bg-white p-4"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k}</div><div className="mt-2 text-2xl font-bold">{v??0}</div></div>)}</div>

    <div className="rounded-2xl border bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-bold text-slate-950">Add strategic keyword</h2><p className="mt-1 text-xs text-slate-500">One landing page can own several close variants when they have the same search intent.</p></div><div className="text-xs font-semibold text-slate-500">Owner is recorded automatically</div></div><div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
      <input className={inputClass} placeholder="Keyword" value={form.keyword} onChange={e=>setForm({...form,keyword:e.target.value})}/>
      <input className={inputClass} placeholder="Target path e.g. /services/deep-cleaning-cape-town" value={form.target_path} onChange={e=>setForm({...form,target_path:e.target.value})}/>
      <input className={inputClass} placeholder="Service / cluster" value={form.service_name} onChange={e=>setForm({...form,service_name:e.target.value})}/>
      <input className={inputClass} placeholder="Location" value={form.location_name} onChange={e=>setForm({...form,location_name:e.target.value})}/>
      <select className={inputClass} value={form.device} onChange={e=>setForm({...form,device:e.target.value})}><option value="desktop">Desktop</option><option value="mobile">Mobile</option></select>
      <select className={inputClass} value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}><option value="p0">P0 — highest</option><option value="p1">P1 — important</option><option value="p2">P2 — supporting</option></select>
      <select className={inputClass} value={form.intent} onChange={e=>setForm({...form,intent:e.target.value})}><option value="local">Local</option><option value="transactional">Transactional</option><option value="commercial">Commercial</option><option value="informational">Informational</option><option value="navigational">Navigational</option></select>
      <div className="grid grid-cols-2 gap-2"><input className={inputClass} placeholder="Baseline rank" value={form.baseline_rank} onChange={e=>setForm({...form,baseline_rank:e.target.value})}/><input className={inputClass} placeholder="Target rank" value={form.target_rank} onChange={e=>setForm({...form,target_rank:e.target.value})}/></div>
      <input className={`${inputClass} md:col-span-2 lg:col-span-4`} placeholder="Notes (optional)" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/>
    </div><button onClick={add} disabled={saving||!form.keyword.trim()} className="mt-3 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving?"Saving…":"Add keyword"}</button></div>

    {cannibalisation.length>0&&<div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><h2 className="font-bold text-amber-950">Shared target-page review</h2><p className="mt-1 text-sm text-amber-800">Sharing a page is fine for close variants. Review these when the keywords represent different intent.</p><div className="mt-3 space-y-2 text-sm">{cannibalisation.slice(0,10).map(r=><div key={r.id}><span className="font-semibold">{r.keyword}</span> → {r.target_path} <span className="text-amber-700">also: {r.shared_target_keywords.join(", ")}</span></div>)}</div></div>}

    <div className="rounded-2xl border bg-white p-4"><div className="flex flex-wrap gap-3"><input className={`${inputClass} min-w-72 flex-1`} placeholder="Search keyword, target page, service or location" value={query} onChange={e=>setQuery(e.target.value)}/><select className={inputClass} value={statusFilter} onChange={e=>setStatusFilter(e.target.value as typeof statusFilter)}><option value="all">All keywords</option><option value="active">Active</option><option value="paused">Paused</option><option value="missing">Missing target page</option></select></div></div>

    <div className="overflow-x-auto rounded-2xl border bg-white"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="p-3">Keyword</th><th className="p-3">Target</th><th className="p-3">Intent</th><th className="p-3">Priority</th><th className="p-3">Ranks</th><th className="p-3">Status</th><th className="p-3">Control</th></tr></thead><tbody>{filteredRows.map(r=><tr key={r.id} className="border-t align-top"><td className="p-3"><div className="font-semibold text-slate-900">{r.keyword}</div><div className="text-xs text-slate-500">{r.service_name||"—"} · {r.location_name}</div></td><td className="p-3"><div>{r.target_path??<span className="font-semibold text-red-600">Missing</span>}</div>{r.target_path&&!r.target_page_has_gsc&&<div className="mt-1 text-xs text-amber-700">No GSC page data yet</div>}</td><td className="p-3 capitalize">{r.intent||"—"}<div className="mt-1 text-xs text-slate-500 capitalize">{r.device}</div></td><td className="p-3 uppercase">{r.priority}</td><td className="p-3"><div>Current: {r.current_rank==null?"—":r.current_rank.toFixed(1)}</div><div className="text-xs text-slate-500">Baseline {r.baseline_rank??"—"} · Goal {r.target_rank??"—"}</div></td><td className="p-3"><button onClick={()=>toggle(r)} disabled={saving} className={`rounded-lg border px-2 py-1 text-xs font-semibold ${r.active?"border-emerald-200 bg-emerald-50 text-emerald-800":"border-slate-200 bg-slate-50 text-slate-600"}`}>{r.active?"Active":"Paused"}</button></td><td className="p-3"><div className="flex gap-2"><button onClick={()=>setEditing(toEdit(r))} className="rounded-lg border px-2 py-1 text-xs font-semibold">Edit</button><button onClick={()=>remove(r)} disabled={saving} className="rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-700">Delete</button></div></td></tr>)}</tbody></table>{!filteredRows.length&&<div className="p-8 text-center text-sm text-slate-500">No keywords match this view.</div>}</div>

    {editing&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"><div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-bold text-slate-950">Edit keyword ownership</h2><p className="mt-1 text-sm text-slate-500">Changes update Keyword Portfolio and Organic Revenue immediately.</p></div><button onClick={()=>setEditing(null)} className="rounded-lg border px-3 py-1 text-sm">Close</button></div><div className="mt-4 grid gap-3 md:grid-cols-2">
      <label className="text-xs font-semibold text-slate-600">Keyword<input className={`${inputClass} mt-1 w-full`} value={editing.keyword} onChange={e=>setEditing({...editing,keyword:e.target.value})}/></label>
      <label className="text-xs font-semibold text-slate-600">Target page<input className={`${inputClass} mt-1 w-full`} value={editing.target_path} onChange={e=>setEditing({...editing,target_path:e.target.value})}/></label>
      <label className="text-xs font-semibold text-slate-600">Service / cluster<input className={`${inputClass} mt-1 w-full`} value={editing.service_name} onChange={e=>setEditing({...editing,service_name:e.target.value})}/></label>
      <label className="text-xs font-semibold text-slate-600">Location<input className={`${inputClass} mt-1 w-full`} value={editing.location_name} onChange={e=>setEditing({...editing,location_name:e.target.value})}/></label>
      <label className="text-xs font-semibold text-slate-600">Intent<select className={`${inputClass} mt-1 w-full`} value={editing.intent} onChange={e=>setEditing({...editing,intent:e.target.value})}><option value="">—</option><option value="local">Local</option><option value="transactional">Transactional</option><option value="commercial">Commercial</option><option value="informational">Informational</option><option value="navigational">Navigational</option></select></label>
      <label className="text-xs font-semibold text-slate-600">Priority<select className={`${inputClass} mt-1 w-full`} value={editing.priority} onChange={e=>setEditing({...editing,priority:e.target.value as EditState["priority"]})}><option value="p0">P0 — highest</option><option value="p1">P1 — important</option><option value="p2">P2 — supporting</option></select></label>
      <label className="text-xs font-semibold text-slate-600">Device<select className={`${inputClass} mt-1 w-full`} value={editing.device} onChange={e=>setEditing({...editing,device:e.target.value as EditState["device"]})}><option value="desktop">Desktop</option><option value="mobile">Mobile</option></select></label>
      <div className="grid grid-cols-2 gap-3"><label className="text-xs font-semibold text-slate-600">Baseline<input className={`${inputClass} mt-1 w-full`} value={editing.baseline_rank} onChange={e=>setEditing({...editing,baseline_rank:e.target.value})}/></label><label className="text-xs font-semibold text-slate-600">Goal<input className={`${inputClass} mt-1 w-full`} value={editing.target_rank} onChange={e=>setEditing({...editing,target_rank:e.target.value})}/></label></div>
      <label className="text-xs font-semibold text-slate-600 md:col-span-2">Notes<textarea className={`${inputClass} mt-1 min-h-24 w-full`} value={editing.notes} onChange={e=>setEditing({...editing,notes:e.target.value})}/></label>
    </div><div className="mt-5 flex justify-end gap-2"><button onClick={()=>setEditing(null)} className="rounded-xl border px-4 py-2 text-sm font-semibold">Cancel</button><button onClick={saveEdit} disabled={saving||!editing.keyword.trim()} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving?"Saving…":"Save changes"}</button></div></div></div>}
  </div>;
}
