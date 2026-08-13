"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Loader2, RefreshCw, Users } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

type Team = { id: string; name: string; member_count: number; lead_cleaner_id?: string | null };
type Earnings = { month_total_cents: number; pending_cents: number; approved_cents: number; paid_cents: number };
type Member = { cleaner_id: string; team_id: string | null; name: string; status: string | null; is_available: boolean | null; jobs_completed: number; rating: number | null; earnings: { total_cents: number } };
type Payload = { teams?: Team[]; supervisor_view?: boolean; members?: Member[]; earnings?: Earnings; earnings_period_start?: string; error?: string };

function money(cents: number) {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format((Number(cents) || 0) / 100);
}

export function OfficeSupervisorTeamsGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const onTeams = pathname === "/office/teams" || pathname.startsWith("/office/teams/");
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(onTeams);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!onTeams) return;
    setLoading(true);
    setError(null);
    try {
      const sb = getSupabaseBrowser();
      const session = await sb?.auth.getSession();
      const token = session?.data.session?.access_token;
      if (!token) throw new Error("Please sign in.");
      const res = await fetch("/api/admin/teams", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const json = (await res.json()) as Payload;
      if (!res.ok) throw new Error(json.error ?? "Could not load your team.");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your team.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (onTeams) void load(); }, [onTeams]);

  if (!onTeams) return <>{children}</>;
  if (loading && !data) return <div className="flex min-h-[260px] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>;
  if (error && !data) return <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">{error}</div>;
  if (!data?.supervisor_view) return <>{children}</>;

  const team = data.teams?.[0];
  const members = (data.members ?? []).filter((m) => !team || m.team_id === team.id);
  const cleaners = team?.lead_cleaner_id ? members.filter((m) => m.cleaner_id !== team.lead_cleaner_id) : members;
  const earnings = data.earnings ?? { month_total_cents: 0, pending_cents: 0, approved_cents: 0, paid_cents: 0 };

  return (
    <div className="space-y-5" data-supervisor-my-team>
      <div className="flex items-start justify-between gap-3">
        <div><h1 className="text-2xl font-bold text-slate-900">My Team</h1><p className="mt-1 text-sm text-slate-500">Your assigned cleaners and team earnings only. Customer payment and company revenue are hidden.</p></div>
        <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600"><RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />Refresh</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase text-slate-500">Team</p><p className="mt-1 text-xl font-bold text-slate-900">{team?.name ?? "No team"}</p></div>
        <div className="rounded-2xl border bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase text-slate-500">Cleaners</p><p className="mt-1 text-2xl font-bold text-slate-900">{cleaners.length}</p></div>
        <div className="rounded-2xl border bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase text-slate-500">Team earnings this month</p><p className="mt-1 text-2xl font-bold text-slate-900">{money(earnings.month_total_cents)}</p></div>
        <div className="rounded-2xl border bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase text-slate-500">Paid earnings</p><p className="mt-1 text-2xl font-bold text-slate-900">{money(earnings.paid_cents)}</p><p className="mt-1 text-xs text-slate-500">Approved {money(earnings.approved_cents)} · Pending {money(earnings.pending_cents)}</p></div>
      </div>
      <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b px-4 py-4"><Users className="h-5 w-5 text-blue-600" /><h2 className="font-bold text-slate-900">My cleaners</h2></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead className="bg-slate-50"><tr><th className="px-4 py-3">Cleaner</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Jobs</th><th className="px-4 py-3 text-right">Earnings this month</th></tr></thead><tbody className="divide-y">{cleaners.map((m) => <tr key={m.cleaner_id}><td className="px-4 py-3 font-semibold text-slate-900">{m.name}</td><td className="px-4 py-3 text-slate-600">{m.status ?? (m.is_available ? "available" : "offline")}</td><td className="px-4 py-3 text-slate-600">{m.jobs_completed ?? 0}</td><td className="px-4 py-3 text-right font-semibold">{money(m.earnings.total_cents)}</td></tr>)}</tbody></table></div>
      </div>
      <p className="text-xs text-slate-500">This view does not include customer amount paid, invoices, Paystack/Zoho payment data, company revenue, margin, or profit.</p>
    </div>
  );
}
