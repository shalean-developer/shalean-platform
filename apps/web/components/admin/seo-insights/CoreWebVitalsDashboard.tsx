"use client";

import { useEffect, useState } from "react";

type Row = { url:string; path:string; page_group?:string; priority:string; device:"mobile"|"desktop"; measured_at:string; performance_score:number|null; field_lcp_ms:number|null; field_inp_ms:number|null; field_cls:number|null; field_source:string|null; lab_lcp_ms:number|null; lab_cls:number|null; lab_tbt_ms:number|null; status:string; regression_detected:boolean; regression_reason:string|null };

type Payload = { summary:{measurements:number;good:number;needsImprovement:number;poor:number;unknown:number;regressions:number}; rows:Row[] };

function metric(value:number|null, suffix="") { return value == null ? "—" : `${Math.round(value*100)/100}${suffix}`; }

export function CoreWebVitalsDashboard(){
  const [data,setData]=useState<Payload|null>(null); const [loading,setLoading]=useState(true); const [running,setRunning]=useState(false); const [error,setError]=useState<string|null>(null);
  async function load(){ setLoading(true); const r=await fetch("/api/admin/seo-insights/web-vitals",{cache:"no-store"}); const j=await r.json(); if(!r.ok) setError(j.error||"Failed to load Web Vitals."); else {setData(j);setError(null);} setLoading(false); }
  async function run(){ setRunning(true); const r=await fetch("/api/admin/seo-insights/web-vitals",{method:"POST"}); const j=await r.json(); if(!r.ok && r.status!==207) setError(j.error||"Measurement failed."); await load(); setRunning(false); }
  useEffect(()=>{void load();},[]);
  if(loading && !data) return <div className="rounded-2xl border bg-white p-6">Loading Core Web Vitals…</div>;
  const s=data?.summary;
  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-bold text-slate-950">Core Web Vitals & PageSpeed</h1><p className="mt-1 text-sm text-slate-600">Priority-page performance by device. Field metrics use CrUX when available; Lighthouse lab data remains visible when field data is sparse.</p></div><button onClick={run} disabled={running} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{running?"Running…":"Run measurements now"}</button></div>
    {error&&<div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">{[["Measured",s?.measurements],["Good",s?.good],["Needs improvement",s?.needsImprovement],["Poor",s?.poor],["Unknown",s?.unknown],["Regressions",s?.regressions]].map(([k,v])=><div key={String(k)} className="rounded-2xl border bg-white p-4"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k}</div><div className="mt-2 text-2xl font-bold text-slate-950">{v??0}</div></div>)}</div>
    <div className="overflow-x-auto rounded-2xl border bg-white"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="p-3">Page</th><th className="p-3">Device</th><th className="p-3">Status</th><th className="p-3">Perf</th><th className="p-3">LCP</th><th className="p-3">INP</th><th className="p-3">CLS</th><th className="p-3">Measured</th></tr></thead><tbody>{(data?.rows??[]).map((r)=><tr key={`${r.path}:${r.device}`} className="border-t align-top"><td className="p-3"><div className="font-semibold text-slate-900">{r.path}</div><div className="text-xs text-slate-500">{r.page_group||"Page"} · {r.priority}</div>{r.regression_detected&&<div className="mt-1 text-xs font-semibold text-red-600">Regression: {r.regression_reason}</div>}</td><td className="p-3 capitalize">{r.device}</td><td className="p-3 font-semibold">{r.status.replace("_"," ")}</td><td className="p-3">{r.performance_score??"—"}</td><td className="p-3">{metric(r.field_lcp_ms??r.lab_lcp_ms," ms")}</td><td className="p-3">{metric(r.field_inp_ms," ms")}</td><td className="p-3">{metric(r.field_cls??r.lab_cls)}</td><td className="p-3 text-xs text-slate-500">{new Date(r.measured_at).toLocaleString()}</td></tr>)}</tbody></table>{!data?.rows?.length&&<div className="p-8 text-center text-sm text-slate-500">No measurements yet. Run the first priority-page scan.</div>}</div>
  </div>;
}
