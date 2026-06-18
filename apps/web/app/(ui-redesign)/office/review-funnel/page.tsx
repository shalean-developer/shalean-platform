"use client";

import { MessageCircle, Send, Star, TrendingUp, CheckCircle2, ArrowUpRight, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";

const FUNNEL_STEPS = [
  { label: "Completed jobs", value: 38, pct: 100, color: "bg-blue-500" },
  { label: "Review requests sent", value: 30, pct: 79, color: "bg-violet-500" },
  { label: "Reviews received", value: 18, pct: 47, color: "bg-emerald-500" },
];

const RECENT_REQUESTS = [
  { customer: "Sarah Johnson", booking: "BK-4590", sentVia: "Email", daysAgo: 0, reviewed: true },
  { customer: "Mark Williams", booking: "BK-4589", sentVia: "WhatsApp", daysAgo: 1, reviewed: false },
  { customer: "Priya Naidoo", booking: "BK-4588", sentVia: "Email", daysAgo: 2, reviewed: true },
  { customer: "Ayesha Hendricks", booking: "BK-4587", sentVia: "WhatsApp", daysAgo: 3, reviewed: false },
  { customer: "James Smith", booking: "BK-4586", sentVia: "Email", daysAgo: 4, reviewed: false },
];

export default function ReviewFunnelPage() {
  const conversionRate = ((FUNNEL_STEPS[2]!.value / FUNNEL_STEPS[0]!.value) * 100).toFixed(1);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Review Funnel</h1>
        <p className="mt-0.5 text-sm text-slate-500">Optimise review collection from completed jobs to published ratings.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Completed jobs", value: "38", icon: CheckCircle2, color: "bg-blue-50 text-blue-600" },
          { label: "Requests sent", value: "30", icon: Send, color: "bg-violet-50 text-violet-600" },
          { label: "Reviews received", value: "18", icon: Star, color: "bg-yellow-50 text-yellow-600" },
          { label: "Conversion rate", value: `${conversionRate}%`, icon: TrendingUp, color: "bg-emerald-50 text-emerald-600" },
        ].map((k) => {
          const KIcon = k.icon;
          const [iconBg, iconColor] = k.color.split(" ");
          return (
            <div key={k.label} className="rounded-2xl bg-white border border-slate-100 p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k.label}</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">{k.value}</p>
                </div>
                <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", iconBg)}>
                  <KIcon className={cn("h-4 w-4", iconColor)} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Funnel visual */}
      <div className="rounded-2xl bg-white border border-slate-100 p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800">Review collection funnel (last 30 days)</h3>
          <div className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
            <ArrowUpRight className="h-3.5 w-3.5" />
            +4% vs last month
          </div>
        </div>
        <div className="space-y-4">
          {FUNNEL_STEPS.map((step, i) => (
            <div key={step.label}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-semibold text-slate-700">{step.label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-800">{step.value}</span>
                  <span className="text-xs text-slate-400">({step.pct}%)</span>
                </div>
              </div>
              <div className="h-4 rounded-full bg-slate-100">
                <div className={cn("h-4 rounded-full transition-all", step.color)} style={{ width: `${step.pct}%` }} />
              </div>
              {i < FUNNEL_STEPS.length - 1 && (
                <p className="mt-1 text-xs text-slate-400">
                  {FUNNEL_STEPS[0]!.value - FUNNEL_STEPS[i + 1]!.value} not contacted / dropped off
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Recent requests */}
        <div className="rounded-2xl bg-white border border-slate-100 shadow-sm">
          <div className="border-b border-slate-100 px-5 py-3">
            <h3 className="text-sm font-bold text-slate-800">Recent review requests</h3>
          </div>
          <div className="divide-y divide-slate-50">
            {RECENT_REQUESTS.map((r) => (
              <div key={r.booking} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800">{r.customer}</p>
                  <p className="text-xs text-slate-400">{r.booking} · via {r.sentVia} · {r.daysAgo === 0 ? "today" : `${r.daysAgo}d ago`}</p>
                </div>
                <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold",
                  r.reviewed ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500")}>
                  {r.reviewed ? "Reviewed" : "Pending"}
                </span>
                {!r.reviewed && (
                  <button type="button" className="shrink-0 text-xs font-bold text-blue-600 hover:underline">Remind</button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Recommendations */}
        <div className="rounded-2xl bg-white border border-slate-100 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Lightbulb className="h-4 w-4 text-orange-500" />
            <h3 className="text-sm font-bold text-slate-800">Improvement tips</h3>
          </div>
          <div className="space-y-3">
            {[
              { tip: "Send WhatsApp follow-ups", desc: "WhatsApp requests have 2× higher review conversion than email." },
              { tip: "Time requests optimally", desc: "Send within 2 hours of job completion for best results." },
              { tip: "Add a review incentive", desc: "Offer a R50 discount on next booking for leaving a review." },
              { tip: "Reduce unanswered reviews", desc: "Reply to all reviews within 24 hours to build trust." },
            ].map((t, i) => (
              <div key={i} className="flex gap-3 rounded-xl border border-slate-100 px-3 py-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700 mt-0.5">{i + 1}</span>
                <div>
                  <p className="text-xs font-bold text-slate-800">{t.tip}</p>
                  <p className="text-xs text-slate-500">{t.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
