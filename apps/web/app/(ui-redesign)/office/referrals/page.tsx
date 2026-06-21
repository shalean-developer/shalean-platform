"use client";

import { useMemo, useState } from "react";
import { Search, HeartHandshake, Gift, DollarSign, CheckCircle2, RefreshCw, AlertCircle, Loader2, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminData } from "@/hooks/useAdminData";
import type { AdminReferralRow } from "@/lib/admin/referralsReadModel.types";
import type { ReferralsDashboardExtras } from "@/lib/admin/referralsDashboardExtras.types";

function referralUiStatus(row: AdminReferralRow): { label: string; cls: string } {
  const st = row.lifecycle.status.toLowerCase();
  if (row.lifecycle.rewardedAt || st === "completed") {
    return { label: "Rewarded", cls: "bg-emerald-100 text-emerald-700" };
  }
  if (st === "pending") return { label: "Pending", cls: "bg-orange-100 text-orange-700" };
  return { label: st || "Active", cls: "bg-blue-100 text-blue-700" };
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

export default function ReferralsPage() {
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const { data, loading, error, refetch } = useAdminData<{
    referrals: AdminReferralRow[];
    dashboard: ReferralsDashboardExtras;
  }>("/api/admin/referrals", { params: { referrerType: "customer" } });

  const referrals = data?.referrals ?? [];
  const dashboard = data?.dashboard;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return referrals;
    return referrals.filter(
      (r) =>
        r.referrer.displayLabel.toLowerCase().includes(q) ||
        (r.referrer.referralCode ?? "").toLowerCase().includes(q) ||
        (r.referred.emailOrPhone ?? "").toLowerCase().includes(q),
    );
  }, [referrals, search]);

  const rewardedCount = referrals.filter((r) => r.lifecycle.rewardedAt || r.lifecycle.status === "completed").length;
  const rewardsPaidZar = referrals.reduce((s, r) => s + (r.analytics.totalRewardsZar ?? 0), 0);
  const referralRevenueZar = referrals.reduce((s, r) => s + r.analytics.profitability.grossReferredRevenueZar, 0);

  function copyCode(code: string) {
    void navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Customer referrals</h1>
          <p className="mt-0.5 text-sm text-slate-500">Track customer referral codes, rewards, and attributed booking revenue.</p>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm hover:bg-slate-50"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> Refresh
        </button>
      </div>

      {error ? (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total referrals", value: loading ? "—" : String(referrals.length), icon: HeartHandshake, color: "text-violet-600 bg-violet-50" },
          { label: "Successful", value: loading ? "—" : String(rewardedCount), icon: CheckCircle2, color: "text-emerald-600 bg-emerald-50" },
          { label: "Rewards paid", value: loading ? "—" : `R ${Math.round(rewardsPaidZar).toLocaleString("en-ZA")}`, icon: Gift, color: "text-orange-600 bg-orange-50" },
          { label: "Referral revenue", value: loading ? "—" : `R ${Math.round(referralRevenueZar).toLocaleString("en-ZA")}`, icon: DollarSign, color: "text-blue-600 bg-blue-50" },
        ].map((k) => {
          const KIcon = k.icon;
          const [iconColor, iconBg] = k.color.split(" ");
          return (
            <div key={k.label} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className={cn("mb-2 flex h-8 w-8 items-center justify-center rounded-xl", iconBg)}>
                <KIcon className={cn("h-4 w-4", iconColor)} />
              </div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k.label}</p>
              <p className="mt-0.5 text-2xl font-bold text-slate-800 tabular-nums">{k.value}</p>
            </div>
          );
        })}
      </div>

      {dashboard && dashboard.leaderboards.topCustomersByContribution.length > 0 ? (
        <p className="text-xs text-slate-500">
          Top referrer:{" "}
          <span className="font-semibold text-slate-700">
            {dashboard.leaderboards.topCustomersByContribution[0]?.displayLabel}
          </span>
        </p>
      ) : null}

      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            type="search"
            placeholder="Search referrals…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
          />
        </div>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading referrals…
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-500">No referrals found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  {["Referrer", "Code", "Referred", "Reward", "Status", "Date"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((r) => {
                  const st = referralUiStatus(r);
                  const code = r.referrer.referralCode ?? r.lifecycle.codeSnapshot ?? "—";
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-semibold text-slate-800">{r.referrer.displayLabel}</td>
                      <td className="px-4 py-3">
                        {code !== "—" ? (
                          <button
                            type="button"
                            onClick={() => copyCode(code)}
                            className="inline-flex items-center gap-1 font-mono text-xs font-bold text-blue-600 hover:underline"
                          >
                            {code}
                            <Copy className="h-3 w-3" />
                            {copied === code ? <span className="text-emerald-600">Copied</span> : null}
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{r.referred.emailOrPhone ?? "—"}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800">
                        {r.lifecycle.rewardAmount > 0 ? `R ${r.lifecycle.rewardAmount}` : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold", st.cls)}>{st.label}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">{formatDate(r.lifecycle.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
