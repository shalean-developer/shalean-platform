"use client";

import { useState } from "react";
import { Eye, TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle2, Search, Globe } from "lucide-react";
import { cn } from "@/lib/utils";

const KEYWORDS = [
  { keyword: "cleaning services cape town", position: 3, prevPosition: 5, volume: 1900, clicks: 142, url: "/" },
  { keyword: "house cleaner cape town", position: 6, prevPosition: 6, volume: 1300, clicks: 87, url: "/services" },
  { keyword: "deep cleaning service", position: 12, prevPosition: 8, volume: 880, clicks: 42, url: "/services/deep-clean" },
  { keyword: "end of tenancy cleaning", position: 4, prevPosition: 7, volume: 720, clicks: 98, url: "/services/move-out" },
  { keyword: "office cleaning service cape town", position: 8, prevPosition: 9, volume: 590, clicks: 61, url: "/services/office" },
];

const ISSUES = [
  { type: "warning", title: "3 pages missing meta descriptions", description: "Add meta descriptions to improve CTR from search results." },
  { type: "error", title: "Slow mobile load time on /book", description: "Core Web Vitals LCP is 4.2s — target <2.5s." },
  { type: "info", title: "New page indexing opportunity", description: "/locations/stellenbosch not yet indexed — submit to Search Console." },
];

export default function SeoInsightsPage() {
  const [search, setSearch] = useState("");
  const filtered = KEYWORDS.filter(k => !search || k.keyword.includes(search.toLowerCase()));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">SEO Insights</h1>
        <p className="mt-0.5 text-sm text-slate-500">Keyword rankings, page performance and technical SEO recommendations.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Top 3 positions", value: "2", color: "text-emerald-600" },
          { label: "Top 10 positions", value: "4", color: "text-blue-600" },
          { label: "Total clicks (30d)", value: "430", color: "text-slate-800" },
          { label: "Avg position", value: "6.6", color: "text-violet-600" },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl bg-white border border-slate-100 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k.label}</p>
            <p className={cn("mt-1 text-2xl font-bold", k.color)}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Keywords */}
        <div className="lg:col-span-2 rounded-2xl bg-white border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
            <Search className="h-4 w-4 text-slate-400" />
            <input type="text" placeholder="Search keywords…" value={search} onChange={e => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  {["Keyword", "Position", "Change", "Volume", "Clicks"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((k) => {
                  const change = k.prevPosition - k.position;
                  return (
                    <tr key={k.keyword} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-slate-800">{k.keyword}</p>
                        <p className="text-xs text-slate-400">{k.url}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("text-base font-bold",
                          k.position <= 3 ? "text-emerald-600" : k.position <= 10 ? "text-blue-600" : "text-slate-600")}>
                          #{k.position}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {change > 0 ? (
                          <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600"><TrendingUp className="h-3.5 w-3.5" />+{change}</span>
                        ) : change < 0 ? (
                          <span className="flex items-center gap-1 text-xs font-semibold text-red-600"><TrendingDown className="h-3.5 w-3.5" />{change}</span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-slate-400"><Minus className="h-3.5 w-3.5" />0</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{k.volume.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-slate-700">{k.clicks}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Technical issues */}
        <div className="rounded-2xl bg-white border border-slate-100 p-5 shadow-sm">
          <h3 className="mb-4 text-sm font-bold text-slate-800">Technical issues</h3>
          <div className="space-y-3">
            {ISSUES.map((issue, i) => (
              <div key={i} className={cn("rounded-xl border p-3",
                issue.type === "error" ? "border-red-200 bg-red-50" :
                issue.type === "warning" ? "border-orange-200 bg-orange-50" : "border-blue-200 bg-blue-50")}>
                <div className="flex items-start gap-2">
                  {issue.type === "error" ? <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" /> :
                   issue.type === "warning" ? <AlertTriangle className="h-4 w-4 text-orange-600 mt-0.5 shrink-0" /> :
                   <CheckCircle2 className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />}
                  <div>
                    <p className="text-xs font-bold text-slate-800">{issue.title}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{issue.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button type="button" className="mt-4 w-full rounded-xl bg-blue-600 py-2 text-sm font-bold text-white hover:bg-blue-700 transition-colors">
            Run full audit
          </button>
        </div>
      </div>
    </div>
  );
}
