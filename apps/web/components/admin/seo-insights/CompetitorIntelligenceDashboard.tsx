"use client";

import { FormEvent, useState } from "react";
import { useAdminData } from "@/hooks/useAdminData";

type Payload = {
  provider_configured: boolean;
  competitors: Array<{id:string;name:string;domain:string;source:string;active:boolean;ignored:boolean}>;
  keywords: Array<{id:string;keyword:string;target_path:string|null;location_name:string;device:string;priority:string;active:boolean}>;
  comparisons: Array<{keyword_id:string;keyword:string;target_path:string|null;location_name:string;device:string;priority:string;shalean_position:number|null;best_competitor_domain:string|null;best_competitor_position:number|null;gap:number|null}>;
  suggested_competitors: Array<{domain:string;appearances:number;best_position:number}>;
  visibility: { shalean:{domain:string;visibility_score:number;share_of_voice:number}; competitors:Array<{id:string;name:string;domain:string;appearances:number;visibility_score:number;share_of_voice:number}> };
  latest_snapshots: Array<{id:string;keyword_id:string;provider:string;fetched_at:string;result_count:number}>;
};

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/admin/seo-insights/competitors", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Request failed.");
  return json;
}

export function CompetitorIntelligenceDashboard() {
  const { data, loading, error } = useAdminData<Payload>("/api/admin/seo-insights/competitors");
  const [busy,setBusy]=useState(false); const [actionError,setActionError]=useState<string|null>(null);
  const [domain,setDomain]=useState(""); const [name,setName]=useState("");
  const [keyword,setKeyword]=useState(""); const [targetPath,setTargetPath]=useState(""); const [device,setDevice]=useState("desktop"); const [priority,setPriority]=useState("p1");

  async function addCompetitor(e:FormEvent){e.preventDefault();setBusy(true);setActionError(null);try{await post({action:"add_competitor",domain,name});window.location.reload();}catch(err){setActionError(err instanceof Error?err.message:"Could not add competitor.");}finally{setBusy(false);}}
  async function addKeyword(e:FormEvent){e.preventDefault();setBusy(true);setActionError(null);try{await post({action:"add_keyword",keyword,target_path:targetPath,device,priority});window.location.reload();}catch(err){setActionError(err instanceof Error?err.message:"Could not add keyword.");}finally{setBusy(false);}}
  async function acceptSuggestion(domain:string){setBusy(true);setActionError(null);try{await post({action:"add_competitor",domain,name:domain,source:"discovered"});window.location.reload();}catch(err){setActionError(err instanceof Error?err.message:"Could not add competitor.");}finally{setBusy(false);}}
  async function ignoreSuggestion(domain:string){setBusy(true);setActionError(null);try{await post({action:"ignore_competitor",domain});window.location.reload();}catch(err){setActionError(err instanceof Error?err.message:"Could not ignore competitor.");}finally{setBusy(false);}}

  if(loading) return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading competitor intelligence…</div>;
  if(error) return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{error}</div>;
  if(!data) return null;
  const latest=data.latest_snapshots[0]?.fetched_at??null;

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-bold text-slate-900">Competitor Intelligence</h1><p className="mt-1 text-sm text-slate-500">Track Cape Town SERPs, discover recurring competitors and compare Shalean ranking visibility keyword by keyword.</p></div><div className={`rounded-full px-3 py-1.5 text-xs font-semibold ${data.provider_configured?"bg-emerald-100 text-emerald-700":"bg-amber-100 text-amber-800"}`}>{data.provider_configured?"SERP provider configured":"SERP provider setup required"}</div></div>
    {actionError?<div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{actionError}</div>:null}
    {!data.provider_configured?<div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"><p className="font-semibold">Data collection is ready but paused.</p><p className="mt-1">Add <code>DATAFORSEO_LOGIN</code> and <code>DATAFORSEO_PASSWORD</code> to production. The scheduled SERP sync will then populate rankings automatically.</p></div>:null}

    <div className="grid gap-3 md:grid-cols-4"><div className="rounded-2xl border bg-white p-4"><p className="text-xs uppercase text-slate-500">Tracked competitors</p><p className="mt-2 text-2xl font-bold">{data.competitors.filter(c=>c.active&&!c.ignored).length}</p></div><div className="rounded-2xl border bg-white p-4"><p className="text-xs uppercase text-slate-500">Tracked keywords</p><p className="mt-2 text-2xl font-bold">{data.keywords.filter(k=>k.active).length}</p></div><div className="rounded-2xl border bg-white p-4"><p className="text-xs uppercase text-slate-500">Shalean share of voice</p><p className="mt-2 text-2xl font-bold">{(data.visibility.shalean.share_of_voice*100).toFixed(1)}%</p></div><div className="rounded-2xl border bg-white p-4"><p className="text-xs uppercase text-slate-500">Latest SERP snapshot</p><p className="mt-2 text-sm font-semibold">{latest?new Date(latest).toLocaleString("en-ZA"):"Not run yet"}</p></div></div>

    <div className="grid gap-4 xl:grid-cols-2"><form onSubmit={addCompetitor} className="rounded-2xl border bg-white p-5"><h2 className="font-semibold">Add competitor</h2><div className="mt-4 grid gap-3 sm:grid-cols-2"><input className="rounded-xl border px-3 py-2 text-sm" placeholder="Competitor name" value={name} onChange={e=>setName(e.target.value)}/><input required className="rounded-xl border px-3 py-2 text-sm" placeholder="competitor.co.za" value={domain} onChange={e=>setDomain(e.target.value)}/></div><button disabled={busy} className="mt-3 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Add competitor</button></form>
      <form onSubmit={addKeyword} className="rounded-2xl border bg-white p-5"><h2 className="font-semibold">Track keyword</h2><div className="mt-4 grid gap-3 sm:grid-cols-2"><input required className="rounded-xl border px-3 py-2 text-sm" placeholder="cleaning services cape town" value={keyword} onChange={e=>setKeyword(e.target.value)}/><input className="rounded-xl border px-3 py-2 text-sm" placeholder="Target path, e.g. /services" value={targetPath} onChange={e=>setTargetPath(e.target.value)}/><select className="rounded-xl border px-3 py-2 text-sm" value={device} onChange={e=>setDevice(e.target.value)}><option value="desktop">Desktop</option><option value="mobile">Mobile</option></select><select className="rounded-xl border px-3 py-2 text-sm" value={priority} onChange={e=>setPriority(e.target.value)}><option value="p0">P0</option><option value="p1">P1</option><option value="p2">P2</option></select></div><button disabled={busy} className="mt-3 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Track keyword</button></form></div>

    <div className="rounded-2xl border bg-white p-5"><h2 className="font-semibold">Share of voice</h2><div className="mt-4 grid gap-3 md:grid-cols-3"><div className="rounded-xl bg-slate-50 p-3"><p className="text-sm font-semibold">Shalean</p><p className="mt-1 text-xl font-bold">{(data.visibility.shalean.share_of_voice*100).toFixed(1)}%</p></div>{data.visibility.competitors.map(c=><div key={c.id} className="rounded-xl bg-slate-50 p-3"><p className="text-sm font-semibold">{c.name}</p><p className="text-xs text-slate-500">{c.domain}</p><p className="mt-1 text-xl font-bold">{(c.share_of_voice*100).toFixed(1)}%</p></div>)}</div></div>

    <div className="overflow-hidden rounded-2xl border bg-white"><div className="border-b px-5 py-4"><h2 className="font-semibold">Shalean vs competitors</h2><p className="text-xs text-slate-500">Positive gap means a competitor is ranking above Shalean.</p></div><div className="overflow-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Keyword</th><th className="px-4 py-3">Device</th><th className="px-4 py-3 text-right">Shalean</th><th className="px-4 py-3">Best competitor</th><th className="px-4 py-3 text-right">Competitor</th><th className="px-4 py-3 text-right">Gap</th></tr></thead><tbody className="divide-y">{data.comparisons.map(r=><tr key={r.keyword_id}><td className="px-4 py-3"><p className="font-medium">{r.keyword}</p><p className="text-xs text-slate-500">{r.target_path||"No target page"}</p></td><td className="px-4 py-3">{r.device}</td><td className="px-4 py-3 text-right">{r.shalean_position??"—"}</td><td className="px-4 py-3">{r.best_competitor_domain??"—"}</td><td className="px-4 py-3 text-right">{r.best_competitor_position??"—"}</td><td className="px-4 py-3 text-right font-semibold">{r.gap??"—"}</td></tr>)}</tbody></table>{data.comparisons.length===0?<p className="p-6 text-sm text-slate-500">Add tracked keywords to begin competitor comparisons.</p>:null}</div></div>

    <div className="rounded-2xl border bg-white p-5"><h2 className="font-semibold">Suggested competitors</h2><p className="mt-1 text-xs text-slate-500">Domains repeatedly found in the same SERPs but not yet tracked.</p><div className="mt-4 space-y-2">{data.suggested_competitors.map(c=><div key={c.domain} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3"><div><p className="text-sm font-semibold">{c.domain}</p><p className="text-xs text-slate-500">Appears for {c.appearances} tracked keyword(s) · best position #{c.best_position}</p></div><div className="flex gap-2"><button disabled={busy} onClick={()=>ignoreSuggestion(c.domain)} className="rounded-lg border px-3 py-1.5 text-xs font-semibold">Ignore</button><button disabled={busy} onClick={()=>acceptSuggestion(c.domain)} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">Add competitor</button></div></div>)}{data.suggested_competitors.length===0?<p className="text-sm text-slate-500">No suggestions yet. They appear after the first SERP sync.</p>:null}</div></div>
  </div>;
}
