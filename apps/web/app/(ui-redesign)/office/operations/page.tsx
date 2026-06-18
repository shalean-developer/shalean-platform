"use client";

import { useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Users, Calendar, MessageSquare, Plus, Edit2, Save } from "lucide-react";
import { cn } from "@/lib/utils";

const OPEN_ISSUES = [
  { id: 1, title: "BK-4587 overdue 11h", priority: "critical", assigned: "Ops Manager", age: "2h" },
  { id: 2, title: "3 unassigned bookings today", priority: "high", assigned: "Dispatch", age: "45m" },
  { id: 3, title: "Team 3 short-staffed tomorrow", priority: "medium", assigned: "HR", age: "1d" },
  { id: 4, title: "Notification failures > 5%", priority: "low", assigned: "Tech", age: "3h" },
];

const PRIORITY_MAP: Record<string, { cls: string; label: string }> = {
  critical: { cls: "bg-red-100 text-red-700",    label: "Critical" },
  high:     { cls: "bg-orange-100 text-orange-700", label: "High" },
  medium:   { cls: "bg-yellow-100 text-yellow-700", label: "Medium" },
  low:      { cls: "bg-slate-100 text-slate-600",   label: "Low" },
};

export default function OperationsPage() {
  const [adminNote, setAdminNote] = useState("");
  const [noteSaved, setNoteSaved] = useState(false);

  function saveNote() {
    setNoteSaved(true);
    setTimeout(() => setNoteSaved(false), 2000);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Operations</h1>
          <p className="mt-0.5 text-sm text-slate-500">Daily operational control center — summary, issues and team supply.</p>
        </div>
        <button type="button" className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 shadow-sm">
          <Plus className="h-4 w-4" /> Log issue
        </button>
      </div>

      {/* Daily summary */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Bookings today", value: "12", icon: Calendar, color: "bg-blue-50 text-blue-600" },
          { label: "Open issues", value: OPEN_ISSUES.length, icon: AlertTriangle, color: "bg-red-50 text-red-600" },
          { label: "Available cleaners", value: "10", icon: Users, color: "bg-emerald-50 text-emerald-600" },
          { label: "Cleaner demand", value: "8", icon: Activity, color: "bg-violet-50 text-violet-600" },
        ].map((k) => {
          const KIcon = k.icon;
          const [iconBg, iconColor] = k.color.split(" ");
          return (
            <div key={k.label} className="rounded-2xl bg-white border border-slate-100 p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k.label}</p>
                  <p className="mt-1 text-3xl font-bold text-slate-800">{k.value}</p>
                </div>
                <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", iconBg)}>
                  <KIcon className={cn("h-5 w-5", iconColor)} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Open issues */}
        <div className="lg:col-span-2 rounded-2xl bg-white border border-slate-100 p-5 shadow-sm">
          <h3 className="mb-4 text-sm font-bold text-slate-800">Open issues</h3>
          <div className="space-y-2">
            {OPEN_ISSUES.map((issue) => {
              const p = PRIORITY_MAP[issue.priority]!;
              return (
                <div key={issue.id} className="flex items-center gap-3 rounded-xl border border-slate-100 px-4 py-3">
                  <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold", p.cls)}>{p.label}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800">{issue.title}</p>
                    <p className="text-xs text-slate-400">Assigned to: {issue.assigned} · {issue.age} ago</p>
                  </div>
                  <button type="button" className="shrink-0 rounded-lg bg-emerald-100 px-2.5 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-200 transition-colors flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Resolve
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Admin notes */}
        <div className="rounded-2xl bg-white border border-slate-100 p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-bold text-slate-800">Admin notes</h3>
          <p className="mb-2 text-xs text-slate-400">Internal ops notes — visible to admins only.</p>
          <textarea
            value={adminNote}
            onChange={e => setAdminNote(e.target.value)}
            placeholder="Add a note for today's operations…"
            rows={6}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100 resize-none"
          />
          <button type="button" onClick={saveNote}
            className={cn("mt-2 flex w-full items-center justify-center gap-2 rounded-xl py-2 text-sm font-bold transition-colors",
              noteSaved ? "bg-emerald-100 text-emerald-700" : "bg-blue-600 text-white hover:bg-blue-700")}>
            {noteSaved ? <><CheckCircle2 className="h-4 w-4" /> Saved!</> : <><Save className="h-4 w-4" /> Save note</>}
          </button>
        </div>
      </div>

      {/* Cleaner supply vs demand */}
      <div className="rounded-2xl bg-white border border-slate-100 p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-bold text-slate-800">Cleaner supply vs booking demand — next 7 days</h3>
        <div className="space-y-2">
          {["Mon 19 May", "Tue 20 May", "Wed 21 May", "Thu 22 May", "Fri 23 May", "Sat 24 May", "Sun 25 May"].map((day, i) => {
            const supply = [10, 9, 11, 8, 10, 6, 4][i]!;
            const demand = [8, 9, 7, 10, 9, 5, 2][i]!;
            const gap = supply - demand;
            return (
              <div key={day} className="flex items-center gap-3">
                <div className="w-28 shrink-0 text-xs font-medium text-slate-600">{day}</div>
                <div className="flex-1 flex items-center gap-2">
                  <div className="flex flex-1 gap-1">
                    <div title={`Supply: ${supply}`} className="h-2 rounded-full bg-emerald-400" style={{ width: `${(supply / 12) * 50}%` }} />
                    <div title={`Demand: ${demand}`} className="h-2 rounded-full bg-blue-400" style={{ width: `${(demand / 12) * 50}%` }} />
                  </div>
                  <span className={cn("text-[11px] font-bold w-16 text-right",
                    gap < 0 ? "text-red-600" : gap === 0 ? "text-orange-600" : "text-emerald-600")}>
                    {gap > 0 ? `+${gap} spare` : gap === 0 ? "Exact" : `${gap} short`}
                  </span>
                </div>
              </div>
            );
          })}
          <div className="flex items-center gap-3 pt-1">
            <div className="w-28" />
            <div className="flex items-center gap-4 text-[10px] text-slate-400">
              <span className="flex items-center gap-1"><span className="h-2 w-3 rounded bg-emerald-400 inline-block" /> Supply</span>
              <span className="flex items-center gap-1"><span className="h-2 w-3 rounded bg-blue-400 inline-block" /> Demand</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
