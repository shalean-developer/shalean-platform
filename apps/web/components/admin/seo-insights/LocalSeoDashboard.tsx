"use client";

import { useMemo, useState } from "react";
import { adminFetch, useAdminData } from "@/hooks/useAdminData";

type Row = {
  id:string; area_name:string; location_path:string|null; gbp_location_id:string|null; gbp_location_name:string|null; gbp_connected:boolean;
  review_count:number; average_rating:number|null; local_pack_position:number|null; local_pack_keyword:string|null;
  gsc_clicks:number; gsc_impressions:number; gsc_avg_position:number|null; health:"healthy"|"watch"|"action"|"unknown";
  notes:string|null; gbp_last_sync:string|null; gbp_account_health:string;
};
type Payload = { summary:{areas:number;healthy:number;watch:number;action:number;gbpConnected:boolean}; rows:Row[] };

export function LocalSeoDashboard(){
  const {data,loading,error,refetch}=useAdminData<Payload>("/api/admin/seo-insights/local-seo");
  const [saving,setSaving]=useState(false);
  const [form,setForm]=useState({area_name:"",location_path:"",review_count:"",average_rating:"",local_pack_position:"",local_pack_keyword:"",notes:""});
  const rows=useMemo(()=>data?.rows??[],[data]);

  async function save(){
    if(!form.area_name.trim()) return;
    setSaving(true);
    const res=await adminFetch("/api/admin/seo-insights/local-seo",{method:"POST",body:JSON.stringify(form)});
    setSaving(false);
    if(res.ok){setForm({area_name:"",location_path:"",review_count:"",average_rating:"",local_pack_position:"",local_pack_keyword:"",notes:""});await refetch();}
  }

  if(loading&&!data) return <div className="rounded-2xl border bg-white p-6">Loading local SEO…</div>;
  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold text-slate-950">Local SEO & Google Business Profile</h1><p className="mt-1 text-sm text-slate-600">Compare location-page search visibility, Google Business Profile health, reviews and local-pack position by target area.</p></div>
    {error&&<div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[["Areas",data?.summary.areas],["Healthy",data?.summary.healthy],["Watch",data?.summary.watch],["Action",data?.summary.action],["GBP",data?.summary.gbpConnected?"Connected":"Not connected"]].map(([k,v])=><div key={String(k)} className="rounded-2xl border bg-white p-4"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k}</div><div className="mt-2 text-2xl font-bold">{v??0}</div></div>)}</div>
    <div className="rounded-2xl border bg-white p-4"><h2 className="font-bold text-slate-950">Add / update target area</h2><div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
      <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Area e.g. Claremont" value={form.area_name} onChange={e=>setForm({...form,area_name:e.target.value})}/>
      <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Location page path" value={form.location_path} onChange={e=>setForm({...form,location_path:e.target.value})}/>
      <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Review count" value={form.review_count} onChange={e=>setForm({...form,review_count:e.target.value})}/>
      <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Average rating" value={form.average_rating} onChange={e=>setForm({...form,average_rating:e.target.value})}/>
      <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Local-pack position" value={form.local_pack_position} onChange={e=>setForm({...form,local_pack_position:e.target.value})}/>
      <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Local-pack keyword" value={form.local_pack_keyword} onChange={e=>setForm({...form,local_pack_keyword:e.target.value})}/>
      <input className="rounded-xl border px-3 py-2 text-sm lg:col-span-2" placeholder="Notes" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/>
    </div><button onClick={save} disabled={saving} className="mt-3 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving?"Saving…":"Save area"}</button></div>
    <div className="overflow-x-auto rounded-2xl border bg-white"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="p-3">Area</th><th className="p-3">Location page</th><th className="p-3">GBP</th><th className="p-3">Reviews</th><th className="p-3">Local pack</th><th className="p-3">GSC</th><th className="p-3">Health</th></tr></thead><tbody>{rows.map(r=><tr key={r.id} className="border-t align-top"><td className="p-3 font-semibold text-slate-900">{r.area_name}</td><td className="p-3">{r.location_path||"—"}</td><td className="p-3">{r.gbp_connected?"Connected":"Not connected"}<div className="text-xs text-slate-500">{r.gbp_location_name||"—"}</div></td><td className="p-3">{r.review_count} · {r.average_rating==null?"—":`${r.average_rating.toFixed(1)}★`}</td><td className="p-3">{r.local_pack_position==null?"—":`#${r.local_pack_position}`}<div className="text-xs text-slate-500">{r.local_pack_keyword||"—"}</div></td><td className="p-3">{r.gsc_clicks} clicks<div className="text-xs text-slate-500">{r.gsc_impressions} impr · pos {r.gsc_avg_position==null?"—":r.gsc_avg_position.toFixed(1)}</div></td><td className="p-3 capitalize font-semibold">{r.health}</td></tr>)}</tbody></table>{!rows.length&&<div className="p-8 text-center text-sm text-slate-500">No local SEO target areas yet.</div>}</div>
  </div>;
}
