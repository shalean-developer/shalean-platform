"use client";

import { useState } from "react";
import { Search, HeartHandshake, Gift, DollarSign, Users, Copy, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

type ReferralStatus = "pending" | "rewarded" | "expired" | "active";

const STATUS_MAP: Record<ReferralStatus, { label: string; cls: string }> = {
  pending:  { label: "Pending",  cls: "bg-orange-100 text-orange-700" },
  rewarded: { label: "Rewarded", cls: "bg-emerald-100 text-emerald-700" },
  expired:  { label: "Expired",  cls: "bg-slate-100 text-slate-500" },
  active:   { label: "Active",   cls: "bg-blue-100 text-blue-700" },
};

const REFERRALS = [
  { id: "REF-001", referrer: "Sarah Johnson", code: "SARAH50", referred: "Mark Williams", bookingRef: "BK-4534", reward: "R 100", status: "rewarded" as ReferralStatus, date: "5 May 2026" },
  { id: "REF-002", referrer: "Priya Naidoo", code: "PRIYA50", referred: "Ayesha Hendricks", bookingRef: "BK-4562", reward: "R 100", status: "rewarded" as ReferralStatus, date: "8 May 2026" },
  { id: "REF-003", referrer: "David Fourie", code: "DAVID50", referred: "Thandeka Mthembu", bookingRef: "BK-4578", reward: "R 100", status: "pending" as ReferralStatus, date: "12 May 2026" },
  { id: "REF-004", referrer: "Nomsa Dlamini", code: "NOMSA50", referred: "—", bookingRef: "—", reward: "—", status: "active" as ReferralStatus, date: "14 May 2026" },
  { id: "REF-005", referrer: "James Smith", code: "JAMES50", referred: "—", bookingRef: "—", reward: "—", status: "expired" as ReferralStatus, date: "1 Apr 2026" },
];

export default function ReferralsPage() {
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  function copyCode(code: string) {
    void navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  }

  const filtered = REFERRALS.filter(r =>
    !search || r.referrer.toLowerCase().includes(search.toLowerCase()) || r.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Referrals</h1>
          <p className="mt-0.5 text-sm text-slate-500">Manage the referral program, track codes, rewards and revenue.</p>
        </div>
        <button type="button" className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 shadow-sm">
          <Gift className="h-4 w-4" /> Create referral code
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total referrals", value: REFERRALS.length, icon: HeartHandshake, color: "text-violet-600 bg-violet-50" },
          { label: "Successful", value: REFERRALS.filter(r => r.status === "rewarded").length, icon: CheckCircle2, color: "text-emerald-600 bg-emerald-50" },
          { label: "Rewards paid", value: "R 200", icon: Gift, color: "text-orange-600 bg-orange-50" },
          { label: "Referral revenue", value: "R 1 560", icon: DollarSign, color: "text-blue-600 bg-blue-50" },
        ].map((k) => {
          const KIcon = k.icon;
          const [iconColor, iconBg] = k.color.split(" ");
          return (
            <div key={k.label} className="rounded-2xl bg-white border border-slate-100 p-4 shadow-sm">
              <div className={cn("mb-2 flex h-8 w-8 items-center justify-center rounded-xl", iconBg)}>
                <KIcon className={cn("h-4 w-4", iconColor)} />
              </div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k.label}</p>
              <p className="mt-0.5 text-2xl font-bold text-slate-800">{k.value}</p>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl bg-white border border-slate-100 shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <Search className="h-4 w-4 text-slate-400 shrink-0" />
          <input type="text" placeholder="Search referrals…" value={search} onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                {["ID", "Referrer", "Code", "Referred", "Booking", "Reward", "Status", "Date"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map((r) => {
                const s = STATUS_MAP[r.status];
                return (
                  <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 text-xs font-mono font-bold text-blue-600">{r.id}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-slate-800">{r.referrer}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-mono font-bold text-slate-700">{r.code}</span>
                        <button type="button" onClick={() => copyCode(r.code)}
                          className="text-slate-400 hover:text-blue-600 transition-colors">
                          {copied === r.code ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{r.referred}</td>
                    <td className="px-4 py-3 text-xs font-mono text-slate-500">{r.bookingRef}</td>
                    <td className="px-4 py-3 text-sm font-bold text-emerald-600">{r.reward}</td>
                    <td className="px-4 py-3">
                      <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold", s.cls)}>{s.label}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">{r.date}</td>
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
