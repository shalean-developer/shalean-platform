"use client";

import { TrendingUp, MousePointer, ShoppingCart, CreditCard, ArrowUpRight, ArrowDownRight, Globe } from "lucide-react";
import { cn } from "@/lib/utils";

const LANDING_PAGES = [
  { page: "/", name: "Home", visitors: 620, bookingStarts: 148, completions: 67, cvr: 10.8 },
  { page: "/book", name: "Book now", visitors: 380, bookingStarts: 210, completions: 89, cvr: 23.4 },
  { page: "/services/deep-clean", name: "Deep clean", visitors: 240, bookingStarts: 82, completions: 31, cvr: 12.9 },
  { page: "/locations/cape-town", name: "Cape Town", visitors: 180, bookingStarts: 54, completions: 22, cvr: 12.2 },
  { page: "/services/move-out", name: "Move out", visitors: 150, bookingStarts: 45, completions: 18, cvr: 12.0 },
];

export default function ConversionPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Conversion</h1>
        <p className="mt-0.5 text-sm text-slate-500">Landing page performance, CTA clicks and booking completion rates.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Total visitors", value: "1 570", trend: "+11%", dir: "up" as const, icon: Globe, color: "bg-blue-50 text-blue-600" },
          { label: "CTA clicks", value: "539", trend: "+8%", dir: "up" as const, icon: MousePointer, color: "bg-violet-50 text-violet-600" },
          { label: "Booking starts", value: "539", trend: "+8%", dir: "up" as const, icon: ShoppingCart, color: "bg-orange-50 text-orange-600" },
          { label: "Completions", value: "227", trend: "+14%", dir: "up" as const, icon: CreditCard, color: "bg-emerald-50 text-emerald-600" },
        ].map((k) => {
          const KIcon = k.icon;
          const [iconBg, iconColor] = k.color.split(" ");
          return (
            <div key={k.label} className="rounded-2xl bg-white border border-slate-100 p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k.label}</p>
                  <p className="mt-1.5 text-2xl font-bold text-slate-900">{k.value}</p>
                  <div className={cn("mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    k.dir === "up" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600")}>
                    {k.dir === "up" ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    {k.trend}
                  </div>
                </div>
                <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", iconBg)}>
                  <KIcon className={cn("h-5 w-5", iconColor)} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Conversion rate by page */}
      <div className="rounded-2xl bg-white border border-slate-100 p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-bold text-slate-800">Landing page performance</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                {["Page", "Visitors", "Booking starts", "Completions", "CVR"].map(h => (
                  <th key={h} className="pb-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {LANDING_PAGES.map((p) => (
                <tr key={p.page} className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-3 pr-4">
                    <p className="text-sm font-semibold text-slate-800">{p.name}</p>
                    <p className="text-xs text-slate-400">{p.page}</p>
                  </td>
                  <td className="py-3 pr-4 text-sm text-slate-700">{p.visitors.toLocaleString()}</td>
                  <td className="py-3 pr-4 text-sm text-slate-700">{p.bookingStarts}</td>
                  <td className="py-3 pr-4 text-sm font-semibold text-emerald-600">{p.completions}</td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-20 rounded-full bg-slate-100">
                        <div className="h-2 rounded-full bg-blue-500" style={{ width: `${Math.min(p.cvr * 4, 100)}%` }} />
                      </div>
                      <span className={cn("text-xs font-bold",
                        p.cvr >= 20 ? "text-emerald-600" : p.cvr >= 12 ? "text-blue-600" : "text-orange-600")}>
                        {p.cvr}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Weekly conversion trend */}
      <div className="rounded-2xl bg-white border border-slate-100 p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-bold text-slate-800">Weekly conversion trend</h3>
        <div className="flex items-end gap-3 h-28">
          {[
            { label: "W1", cvr: 8.2 }, { label: "W2", cvr: 9.1 }, { label: "W3", cvr: 7.8 },
            { label: "W4", cvr: 10.2 }, { label: "W5", cvr: 11.4 }, { label: "W6", cvr: 9.8 },
            { label: "W7", cvr: 12.1 },
          ].map((w) => (
            <div key={w.label} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[10px] text-slate-500">{w.cvr}%</span>
              <div className="w-full rounded-t-lg bg-violet-300 hover:bg-violet-500 transition-colors"
                style={{ height: `${(w.cvr / 15) * 100}%` }} />
              <span className="text-[10px] text-slate-500">{w.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
