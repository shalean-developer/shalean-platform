"use client";

import { useState } from "react";
import { adminFetch, useAdminData } from "@/hooks/useAdminData";

type Row = { url:string; path:string; page_group:string; http_status:number|null; json_ld_count:number; schema_types:string[]; required_types:string[]; missing_types:string[]; errors:string[]; warnings:string[]; status:"valid"|"warning"|"error"|"unknown"; checked_at:string };
type Payload = { summary:{audited:number;valid:number;warnings:number;errors:number;needsAction:number;withJsonLd:number}; rows:Row[] };

export function StructuredDataDashboard(){
  const { data, loading, error, refetch } = useAdminData<Payload>("/api/admin/seo-insights/structured-data");
  const [running,setRunning]=useState(false); const [runError,setRunError]=useState<string|null>(null);
  async function run(){ setRunning(true); setRunError(null); const result=await adminFetch("/api/admin/seo-insights/structured-data",{method:"POST",body:JSON.stringify({limit:220})}); if(!result.ok)setRunError(result.error||"Audit failed"); else await refetch(); setRunning(false); }
  if(loading&&!data)return <div className="rounded-2xl border bg-white p-6 text-sm text-slate-500">Loading structured data inventory…</div>;
  const rows=data?.rows??[]; const s=data?.summary;
  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-bold text-slate-950">Structured Data & Rich Results</h1><p className="mt-1 text-sm text-slate-600">Whole-site JSON-LD inventory, page-type expectations and actionable schema regressions.</p></div><button onClick={run} disabled={running} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{running?"Auditing…":"Run schema audit"}</button></div>
    {(error||runError)&&<div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{runError||error}</div>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">{[["Audited",s?.audited],["With JSON-LD",s?.withJsonLd],["Valid",s?.valid],["Warnings",s?.warnings],["Errors",s?.errors],["Needs action",s?.needsAction]].map(([k,v])=><div key={String(k)} className="rounded-2xl border bg-white p-4"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k}</div><div className="mt-2 text-2xl font-bold text-slate-950">{v??0}</div></div>)}</div>
    <div className="overflow-x-auto rounded-2xl border bg-white"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="p-3">Page</th><th className="p-3">Group</th><th className="p-3">Status</th><th className="p-3">Schema types</th><th className="p-3">Needs action</th><th className="p-3">Checked</th></tr></thead><tbody>{rows.map((r)=><tr key={r.url} className="border-t align-top"><td className="p-3"><a href={r.url} target="_blank" rel="noreferrer" className="font-semibold text-slate-900 hover:underline">{r.path}</a><div className="text-xs text-slate-500">HTTP {r.http_status??"—"} · {r.json_ld_count} JSON-LD block{r.json_ld_count===1?"":"s"}</div></td><td className="p-3 capitalize">{r.page_group}</td><td className="p-3 font-semibold capitalize">{r.status}</td><td className="max-w-[320px] p-3 text-slate-600">{r.schema_types.length?r.schema_types.join(", "):"—"}</td><td className="max-w-[420px] p-3">{r.errors.length||r.missing_types.length?<div className="space-y-1 text-red-700">{[...r.errors,...r.missing_types.map(t=>`Missing ${t}`)].map((x,i)=><div key={`${x}:${i}`}>{x}</div>)}</div>:r.warnings.length?<div className="space-y-1 text-amber-700">{r.warnings.map((x,i)=><div key={`${x}:${i}`}>{x}</div>)}</div>:<span className="text-emerald-700">No action required</span>}</td><td className="p-3 text-xs text-slate-500">{new Date(r.checked_at).toLocaleString()}</td></tr>)}</tbody></table>{!rows.length&&<div className="p-8 text-center text-sm text-slate-500">No schema audit yet. Run the first whole-site audit.</div>}</div>
  </div>;
}
