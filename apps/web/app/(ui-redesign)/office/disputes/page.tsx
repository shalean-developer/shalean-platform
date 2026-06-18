"use client";

import { useState } from "react";
import { Search, Shield, AlertTriangle, CheckCircle2, Clock, ChevronRight, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

type DisputeStatus = "open" | "under_review" | "resolved" | "escalated";

const STATUS_MAP: Record<DisputeStatus, { label: string; cls: string }> = {
  open:         { label: "Open",         cls: "bg-red-100 text-red-700" },
  under_review: { label: "Under Review", cls: "bg-orange-100 text-orange-700" },
  resolved:     { label: "Resolved",     cls: "bg-emerald-100 text-emerald-700" },
  escalated:    { label: "Escalated",    cls: "bg-violet-100 text-violet-700" },
};

const DISPUTES = [
  { id: "DIS-021", cleaner: "Fatima Adams", bookingRef: "BK-4540", amount: "R 240", reason: "Booking cancelled after partial work", status: "open" as DisputeStatus, submitted: "12 May 2026" },
  { id: "DIS-020", cleaner: "Tshepo Mokoena", bookingRef: "BK-4521", amount: "R 480", reason: "Incorrect time logged", status: "under_review" as DisputeStatus, submitted: "10 May 2026" },
  { id: "DIS-019", cleaner: "Shelaine Kondo", bookingRef: "BK-4498", amount: "R 160", reason: "Double deduction applied", status: "escalated" as DisputeStatus, submitted: "8 May 2026" },
  { id: "DIS-018", cleaner: "Lindile Nkosi", bookingRef: "BK-4476", amount: "R 320", reason: "Client did not pay – deducted from cleaner", status: "resolved" as DisputeStatus, submitted: "5 May 2026" },
  { id: "DIS-017", cleaner: "Yolandi van Zyl", bookingRef: "BK-4451", amount: "R 200", reason: "Platform fee dispute", status: "resolved" as DisputeStatus, submitted: "1 May 2026" },
];

export default function DisputesPage() {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<DisputeStatus | "all">("all");

  const filtered = DISPUTES.filter(d => {
    const s = !search || d.cleaner.toLowerCase().includes(search.toLowerCase()) || d.id.toLowerCase().includes(search.toLowerCase());
    const t = tab === "all" || d.status === tab;
    return s && t;
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Earnings Disputes</h1>
          <p className="mt-0.5 text-sm text-slate-500">Review and resolve cleaner payout and earnings issues.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Open", count: DISPUTES.filter(d => d.status === "open").length, color: "text-red-600" },
          { label: "Under Review", count: DISPUTES.filter(d => d.status === "under_review").length, color: "text-orange-600" },
          { label: "Escalated", count: DISPUTES.filter(d => d.status === "escalated").length, color: "text-violet-600" },
          { label: "Resolved", count: DISPUTES.filter(d => d.status === "resolved").length, color: "text-emerald-600" },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl bg-white border border-slate-100 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k.label}</p>
            <p className={cn("mt-1 text-2xl font-bold", k.color)}>{k.count}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl bg-white border border-slate-100 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="Search disputes…" value={search} onChange={e => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-sm placeholder:text-slate-400 focus:outline-none focus:border-blue-300" />
          </div>
          <div className="flex gap-1">
            {(["all", "open", "under_review", "escalated", "resolved"] as const).map((s) => (
              <button key={s} type="button" onClick={() => setTab(s)}
                className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                  tab === s ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-100")}>
                {s === "all" ? "All" : STATUS_MAP[s as DisputeStatus].label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                {["ID", "Cleaner", "Booking Ref", "Amount", "Reason", "Submitted", "Status", ""].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map((d) => {
                const s = STATUS_MAP[d.status];
                return (
                  <tr key={d.id} className="group hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 text-xs font-mono font-bold text-blue-600">{d.id}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-slate-800">{d.cleaner}</td>
                    <td className="px-4 py-3 text-xs font-mono text-slate-600">{d.bookingRef}</td>
                    <td className="px-4 py-3 text-sm font-bold text-slate-800">{d.amount}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 max-w-[200px] truncate">{d.reason}</td>
                    <td className="px-4 py-3 text-xs text-slate-400">{d.submitted}</td>
                    <td className="px-4 py-3">
                      <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold", s.cls)}>{s.label}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button type="button" className="rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-blue-700">Resolve</button>
                        <button type="button" className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"><MessageSquare className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
