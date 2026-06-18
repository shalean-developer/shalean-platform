"use client";

import { TrendingUp, ArrowRight, ArrowDownRight, Lightbulb, Users, ShoppingCart, CreditCard, Eye } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { step: 1, label: "Visitors", icon: Eye, value: 1240, pct: 100, dropoff: null, dropoffPct: null, color: "bg-blue-500" },
  { step: 2, label: "Quote started", icon: Users, value: 372, pct: 30.0, dropoff: 868, dropoffPct: 70.0, color: "bg-blue-400" },
  { step: 3, label: "Checkout reached", icon: ShoppingCart, value: 186, pct: 15.0, dropoff: 186, dropoffPct: 50.0, color: "bg-violet-400" },
  { step: 4, label: "Payment completed", icon: CreditCard, value: 111, pct: 9.0, dropoff: 75, dropoffPct: 40.3, color: "bg-emerald-500" },
];

const RECOMMENDATIONS = [
  { id: 1, priority: "high", title: "Reduce quote friction", description: "70% of visitors drop off at quote start. Simplify the initial form from 6 fields to 3." },
  { id: 2, priority: "high", title: "Add price anchoring", description: "Show estimated price earlier in the flow — users who see pricing before checkout convert 2.3× more." },
  { id: 3, priority: "medium", title: "Cart abandonment recovery", description: "186 users reached checkout but didn't pay. Set up a 1-hour WhatsApp follow-up sequence." },
  { id: 4, priority: "low", title: "A/B test CTA copy", description: "\"Book now\" vs \"Get your quote\" — early tests show quote-framing increases click-through by 12%." },
];

const PRIORITY_MAP: Record<string, { cls: string }> = {
  high:   { cls: "bg-red-100 text-red-700" },
  medium: { cls: "bg-orange-100 text-orange-700" },
  low:    { cls: "bg-blue-100 text-blue-700" },
};

export default function FunnelIntelligencePage() {
  const maxVal = STEPS[0]!.value;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Funnel Intelligence</h1>
        <p className="mt-0.5 text-sm text-slate-500">Monitor booking conversion funnel, drop-off points and actionable recommendations.</p>
      </div>

      {/* Overall conversion */}
      <div className="rounded-2xl bg-white border border-slate-100 p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Overall conversion rate</p>
            <p className="mt-1 text-4xl font-bold text-slate-900">9.0%</p>
            <p className="text-xs text-slate-400">Visitors → paid bookings (last 30 days)</p>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-orange-50 border border-orange-200 px-4 py-3">
            <TrendingUp className="h-5 w-5 text-orange-600" />
            <div>
              <p className="text-sm font-bold text-orange-800">Industry avg: 12–15%</p>
              <p className="text-xs text-orange-600">3% gap — 33 extra bookings/month potential</p>
            </div>
          </div>
        </div>

        {/* Funnel steps */}
        <div className="space-y-3">
          {STEPS.map((s, i) => {
            const SIcon = s.icon;
            return (
              <div key={s.step}>
                <div className="flex items-center gap-4">
                  <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white", s.color)}>
                    <SIcon className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-800">{s.label}</span>
                        <span className="text-sm font-bold text-slate-600">{s.value.toLocaleString()}</span>
                        <span className="text-xs text-slate-400">({s.pct}%)</span>
                      </div>
                      {s.dropoff ? (
                        <div className="flex items-center gap-1 text-xs text-red-600 font-semibold">
                          <ArrowDownRight className="h-3.5 w-3.5" />
                          -{s.dropoff} dropped ({s.dropoffPct}%)
                        </div>
                      ) : null}
                    </div>
                    <div className="h-3 rounded-full bg-slate-100">
                      <div className={cn("h-3 rounded-full transition-all", s.color)}
                        style={{ width: `${(s.value / maxVal) * 100}%` }} />
                    </div>
                  </div>
                </div>
                {i < STEPS.length - 1 && (
                  <div className="ml-4 flex items-center gap-2 py-1">
                    <div className="w-1 h-4 bg-slate-200 rounded-full ml-3.5" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Recommendations */}
      <div className="rounded-2xl bg-white border border-slate-100 p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Lightbulb className="h-5 w-5 text-orange-500" />
          <h3 className="text-sm font-bold text-slate-800">Conversion recommendations</h3>
        </div>
        <div className="space-y-3">
          {RECOMMENDATIONS.map((r) => {
            const p = PRIORITY_MAP[r.priority]!;
            return (
              <div key={r.id} className="rounded-xl border border-slate-100 px-4 py-3">
                <div className="flex items-start gap-3">
                  <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold capitalize mt-0.5", p.cls)}>
                    {r.priority}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{r.title}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{r.description}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
