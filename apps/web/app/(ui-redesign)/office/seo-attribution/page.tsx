"use client";

import { Globe, TrendingUp, DollarSign, BookOpen, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

const TOP_PAGES = [
  { page: "/", name: "Homepage", sessions: 820, bookings: 28, revenue: "R 21 840", convRate: 3.4 },
  { page: "/book", name: "Book now page", sessions: 380, bookings: 19, revenue: "R 14 820", convRate: 5.0 },
  { page: "/services/deep-clean", name: "Deep clean", sessions: 240, bookings: 9, revenue: "R 11 250", convRate: 3.8 },
  { page: "/blog/10-tips-sparkling-kitchen", name: "Blog: Kitchen tips", sessions: 1240, bookings: 7, revenue: "R 5 460", convRate: 0.6 },
  { page: "/locations/cape-town", name: "Cape Town location", sessions: 180, bookings: 6, revenue: "R 4 680", convRate: 3.3 },
];

export default function SeoAttributionPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">SEO Attribution</h1>
        <p className="mt-0.5 text-sm text-slate-500">Connect organic search traffic to bookings and revenue.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Organic sessions", value: "2 860", trend: "+22%", icon: Globe, color: "bg-blue-50 text-blue-600" },
          { label: "SEO bookings", value: "69", trend: "+18%", icon: BookOpen, color: "bg-violet-50 text-violet-600" },
          { label: "SEO revenue", value: "R 58 050", trend: "+24%", icon: DollarSign, color: "bg-emerald-50 text-emerald-600" },
          { label: "Avg SEO CVR", value: "2.4%", trend: "+0.3%", icon: TrendingUp, color: "bg-orange-50 text-orange-600" },
        ].map((k) => {
          const KIcon = k.icon;
          const [iconBg, iconColor] = k.color.split(" ");
          return (
            <div key={k.label} className="rounded-2xl bg-white border border-slate-100 p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k.label}</p>
                  <p className="mt-1.5 text-2xl font-bold text-slate-900">{k.value}</p>
                  <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                    <ArrowUpRight className="h-3 w-3" />{k.trend}
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

      {/* Attribution by channel */}
      <div className="rounded-2xl bg-white border border-slate-100 p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-bold text-slate-800">Revenue attribution — organic vs paid</h3>
        <div className="space-y-3">
          {[
            { label: "Organic SEO", revenue: 58050, pct: 63, color: "bg-emerald-500" },
            { label: "Google Ads", revenue: 9360, pct: 10, color: "bg-blue-400" },
            { label: "Facebook Ads", revenue: 10000, pct: 11, color: "bg-blue-600" },
            { label: "Referrals", revenue: 3900, pct: 4, color: "bg-violet-400" },
            { label: "Direct", revenue: 11090, pct: 12, color: "bg-slate-300" },
          ].map((s) => (
            <div key={s.label}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-slate-700">{s.label}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400">R {s.revenue.toLocaleString("en-ZA")}</span>
                  <span className="text-xs font-bold text-slate-700 w-8 text-right">{s.pct}%</span>
                </div>
              </div>
              <div className="h-2 rounded-full bg-slate-100">
                <div className={cn("h-2 rounded-full transition-all", s.color)} style={{ width: `${s.pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top converting pages */}
      <div className="rounded-2xl bg-white border border-slate-100 shadow-sm">
        <div className="border-b border-slate-100 px-5 py-3">
          <h3 className="text-sm font-bold text-slate-800">Top converting organic pages</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                {["Page", "Organic sessions", "Bookings", "Revenue", "Conversion rate"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {TOP_PAGES.map((p) => (
                <tr key={p.page} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-sm font-semibold text-slate-800">{p.name}</p>
                    <p className="text-xs text-slate-400">{p.page}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{p.sessions.toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-slate-700">{p.bookings}</td>
                  <td className="px-4 py-3 text-sm font-bold text-emerald-600">{p.revenue}</td>
                  <td className="px-4 py-3">
                    <span className={cn("text-xs font-bold",
                      p.convRate >= 4 ? "text-emerald-600" : p.convRate >= 2 ? "text-blue-600" : "text-orange-600")}>
                      {p.convRate}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
