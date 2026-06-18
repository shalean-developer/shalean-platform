"use client";

import { Zap, Clock, Users, TrendingUp, AlertTriangle, CheckCircle2, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

const METRIC_CARDS = [
  { label: "Avg assignment time", value: "18 min", sub: "From booking to cleaner assigned", trend: "+3min vs yesterday", trendDir: "bad", icon: Clock, color: "bg-orange-50 text-orange-600" },
  { label: "Unassigned jobs", value: "3", sub: "Across all teams today", trend: "Down from 7 yesterday", trendDir: "good", icon: AlertTriangle, color: "bg-red-50 text-red-600" },
  { label: "Cleaner utilisation", value: "72%", sub: "Of available cleaner hours", trend: "+4% vs last week", trendDir: "good", icon: Users, color: "bg-blue-50 text-blue-600" },
  { label: "Jobs starting soon", value: "5", sub: "Starting within 2 hours", trend: "3 still unassigned", trendDir: "bad", icon: Zap, color: "bg-violet-50 text-violet-600" },
];

const TEAM_CAPACITY = [
  { team: "Team 1", members: 3, jobsToday: 4, utilisation: 85, status: "busy" },
  { team: "Team 2", members: 3, jobsToday: 3, utilisation: 70, status: "active" },
  { team: "Team 3", members: 2, jobsToday: 2, utilisation: 60, status: "available" },
  { team: "Freelancers", members: 10, jobsToday: 3, utilisation: 20, status: "available" },
];

export default function MetricsPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dispatch Metrics</h1>
        <p className="mt-0.5 text-sm text-slate-500">Monitor dispatch performance, utilisation and team capacity.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {METRIC_CARDS.map((m) => {
          const MIcon = m.icon;
          const [iconBg, iconColor] = m.color.split(" ");
          return (
            <div key={m.label} className="rounded-2xl bg-white border border-slate-100 p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{m.label}</p>
                  <p className="mt-1.5 text-2xl font-bold text-slate-900">{m.value}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{m.sub}</p>
                  <p className={cn("mt-1.5 text-[11px] font-semibold",
                    m.trendDir === "good" ? "text-emerald-600" : "text-orange-600")}>{m.trend}</p>
                </div>
                <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", iconBg)}>
                  <MIcon className={cn("h-5 w-5", iconColor)} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Assignment time chart */}
      <div className="rounded-2xl bg-white border border-slate-100 p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-bold text-slate-800">Assignment time — last 7 days (minutes)</h3>
        <div className="flex items-end gap-2 h-32">
          {[22, 18, 25, 15, 20, 18, 18].map((val, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[10px] text-slate-500">{val}m</span>
              <div className="w-full rounded-t-lg bg-blue-200 hover:bg-blue-400 transition-colors cursor-default"
                style={{ height: `${(val / 30) * 100}%` }} />
              <span className="text-[9px] text-slate-400">{["M", "T", "W", "T", "F", "S", "S"][i]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Team capacity */}
      <div className="rounded-2xl bg-white border border-slate-100 p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-bold text-slate-800">Team capacity</h3>
        <div className="space-y-3">
          {TEAM_CAPACITY.map((t) => (
            <div key={t.team} className="flex items-center gap-4">
              <div className="w-24 shrink-0">
                <p className="text-sm font-semibold text-slate-800">{t.team}</p>
                <p className="text-xs text-slate-400">{t.members} members</p>
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-500">{t.jobsToday} jobs today</span>
                  <span className="text-xs font-bold text-slate-700">{t.utilisation}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div className={cn("h-2 rounded-full transition-all",
                    t.utilisation >= 80 ? "bg-orange-400" : t.utilisation >= 60 ? "bg-blue-400" : "bg-emerald-400"
                  )} style={{ width: `${t.utilisation}%` }} />
                </div>
              </div>
              <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold",
                t.status === "busy" ? "bg-orange-100 text-orange-700" :
                t.status === "active" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700")}>
                {t.status.charAt(0).toUpperCase() + t.status.slice(1)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
