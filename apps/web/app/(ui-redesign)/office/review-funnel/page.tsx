"use client";

import { useMemo } from "react";
import { Send, Star, TrendingUp, CheckCircle2, Lightbulb, RefreshCw, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminData } from "@/hooks/useAdminData";
import type { OfficeReviewFunnelSummary } from "@/lib/admin/officeReviewFunnel";

export default function ReviewFunnelPage() {
  const { data, loading, error, refetch } = useAdminData<OfficeReviewFunnelSummary>("/api/admin/office-review-funnel", {
    params: { days: "30" },
  });

  const funnelSteps = useMemo(() => {
    if (!data) return [];
    const base = Math.max(data.completedJobs, data.promptsSent, 1);
    return [
      { label: "Completed jobs", value: data.completedJobs, pct: 100, color: "bg-blue-500" },
      {
        label: "Review requests sent",
        value: data.promptsSent,
        pct: Math.round((data.promptsSent / base) * 100),
        color: "bg-violet-500",
      },
      {
        label: "Reviews received",
        value: data.reviewsSubmitted,
        pct: Math.round((data.reviewsSubmitted / base) * 100),
        color: "bg-emerald-500",
      },
    ];
  }, [data]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Review Funnel</h1>
          <p className="mt-0.5 text-sm text-slate-500">Review collection from completed jobs to published ratings.</p>
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Completed jobs", value: data?.completedJobs ?? "—", icon: CheckCircle2, color: "bg-blue-50 text-blue-600" },
          { label: "Requests sent", value: data?.promptsSent ?? "—", icon: Send, color: "bg-violet-50 text-violet-600" },
          { label: "Reviews received", value: data?.reviewsSubmitted ?? "—", icon: Star, color: "bg-yellow-50 text-yellow-600" },
          {
            label: "Conversion rate",
            value: data?.conversionPct != null ? `${data.conversionPct}%` : "—",
            icon: TrendingUp,
            color: "bg-emerald-50 text-emerald-600",
          },
        ].map((k) => {
          const KIcon = k.icon;
          const [iconBg, iconColor] = k.color.split(" ");
          return (
            <div key={k.label} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k.label}</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">{loading ? "—" : k.value}</p>
                </div>
                <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", iconBg)}>
                  <KIcon className={cn("h-4 w-4", iconColor)} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-bold text-slate-800">Review collection funnel (last {data?.windowDays ?? 30} days)</h3>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="space-y-4">
            {funnelSteps.map((step) => (
              <div key={step.label}>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-700">{step.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-800">{step.value}</span>
                    <span className="text-xs text-slate-400">({step.pct}%)</span>
                  </div>
                </div>
                <div className="h-4 rounded-full bg-slate-100">
                  <div className={cn("h-4 rounded-full", step.color)} style={{ width: `${step.pct}%` }} />
                </div>
              </div>
            ))}
            {data?.clickThroughPct != null ? (
              <p className="text-xs text-slate-500">Prompt click-through: {data.clickThroughPct}%</p>
            ) : null}
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-3">
            <h3 className="text-sm font-bold text-slate-800">Recent review requests</h3>
          </div>
          {loading ? (
            <p className="px-5 py-8 text-sm text-slate-500">Loading…</p>
          ) : (data?.recentRequests.length ?? 0) === 0 ? (
            <p className="px-5 py-8 text-sm text-slate-500">No review prompts sent in this window.</p>
          ) : (
            <div className="divide-y divide-slate-50">
              {data!.recentRequests.map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800">{r.customerLabel}</p>
                    <p className="text-xs text-slate-400">
                      {r.bookingId ? `${r.bookingId.slice(0, 8)}…` : "—"} · via {r.channel} ·{" "}
                      {r.daysAgo === 0 ? "today" : `${r.daysAgo}d ago`}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold",
                      r.reviewed ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500",
                    )}
                  >
                    {r.reviewed ? "Reviewed" : "Pending"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-orange-500" />
            <h3 className="text-sm font-bold text-slate-800">Signals</h3>
          </div>
          <ul className="space-y-2 text-xs text-slate-600">
            <li>Prompts are logged when SMS/email review requests succeed.</li>
            <li>Conversion = reviews submitted ÷ prompts sent in the window.</li>
            <li>Completed jobs count uses bookings with status completed.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
