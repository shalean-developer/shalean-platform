"use client";

import { useMemo } from "react";
import { CalendarDays, CheckCircle2, Clock3, Loader2, RefreshCw, Users, Wallet } from "lucide-react";
import { useAdminData } from "@/hooks/useAdminData";

type TeamRow = {
  teamId: string;
  teamName: string;
  supervisorName: string;
  memberCount: number;
  todayBookings: number;
  upcomingBookings: number;
  completedBookings: number;
  inProgressBookings: number;
  pendingBookings: number;
};

type TeamPerformanceResponse = {
  scoped: boolean;
  generatedAt: string;
  teams: TeamRow[];
  totals: {
    teams: number;
    members: number;
    todayBookings: number;
    upcomingBookings: number;
    completedBookings: number;
    pendingEarningsCents: number | null;
    eligibleEarningsCents: number | null;
  };
};

function zar(cents: number | null): string {
  if (cents == null) return "Restricted";
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(cents / 100);
}

export default function TeamPerformancePage() {
  const { data, loading, error, refetch } = useAdminData<TeamPerformanceResponse>("/api/admin/team-performance");
  const totals = data?.totals;
  const title = data?.scoped ? "Team Performance" : "Cleaner & Team Performance";
  const subtitle = data?.scoped
    ? "Live operational performance for your assigned team only. Customer revenue and company-wide finance remain hidden."
    : "Company-wide team coverage and operational performance.";

  const cards = useMemo(() => [
    { label: "Team members", value: totals?.members ?? 0, icon: Users },
    { label: "Today's bookings", value: totals?.todayBookings ?? 0, icon: CalendarDays },
    { label: "Upcoming bookings", value: totals?.upcomingBookings ?? 0, icon: Clock3 },
    { label: "Completed", value: totals?.completedBookings ?? 0, icon: CheckCircle2 },
  ], [totals]);

  return (
    <main className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Workforce operations</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{subtitle}</p>
        </div>
        <button type="button" onClick={() => void refetch()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </header>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, icon: Icon }) => (
          <article key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Icon className="h-5 w-5" /></span>
            <p className="mt-4 text-2xl font-bold tabular-nums text-slate-950">{loading ? "—" : value}</p>
            <p className="mt-1 text-sm text-slate-500">{label}</p>
          </article>
        ))}
      </section>

      {totals?.pendingEarningsCents != null || totals?.eligibleEarningsCents != null ? (
        <section className="grid gap-4 sm:grid-cols-2">
          <article className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <div className="flex items-center gap-2 text-amber-800"><Wallet className="h-5 w-5" /><span className="text-sm font-semibold">Pending team earnings</span></div>
            <p className="mt-3 text-2xl font-bold text-amber-950">{zar(totals?.pendingEarningsCents ?? null)}</p>
          </article>
          <article className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <div className="flex items-center gap-2 text-emerald-800"><Wallet className="h-5 w-5" /><span className="text-sm font-semibold">Eligible team earnings</span></div>
            <p className="mt-3 text-2xl font-bold text-emerald-950">{zar(totals?.eligibleEarningsCents ?? null)}</p>
          </article>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-slate-950">Team responsibility and workload</h2>
          <p className="mt-1 text-xs text-slate-500">Team names and supervisor names come from the live team and cleaner records.</p>
        </div>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Loading team performance…</div>
        ) : !data?.teams?.length ? (
          <div className="py-16 text-center text-sm text-slate-500">No team is assigned to this account.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr><th className="px-5 py-3">Team</th><th className="px-5 py-3">Supervisor</th><th className="px-5 py-3">Members</th><th className="px-5 py-3">Today</th><th className="px-5 py-3">Upcoming</th><th className="px-5 py-3">In progress</th><th className="px-5 py-3">Completed</th><th className="px-5 py-3">Awaiting action</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.teams.map((team) => (
                  <tr key={team.teamId} className="hover:bg-slate-50/70">
                    <td className="px-5 py-4 font-semibold text-slate-900">{team.teamName}</td>
                    <td className="px-5 py-4 text-slate-700">{team.supervisorName}</td>
                    <td className="px-5 py-4 tabular-nums text-slate-600">{team.memberCount}</td>
                    <td className="px-5 py-4 tabular-nums text-slate-600">{team.todayBookings}</td>
                    <td className="px-5 py-4 tabular-nums text-slate-600">{team.upcomingBookings}</td>
                    <td className="px-5 py-4 tabular-nums text-slate-600">{team.inProgressBookings}</td>
                    <td className="px-5 py-4 tabular-nums text-slate-600">{team.completedBookings}</td>
                    <td className="px-5 py-4 tabular-nums text-slate-600">{team.pendingBookings}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
