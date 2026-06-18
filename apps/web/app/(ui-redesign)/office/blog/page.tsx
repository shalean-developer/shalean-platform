"use client";

import { useState } from "react";
import { Search, Plus, Edit2, Eye, Trash2, Star, Globe, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

type PostStatus = "published" | "draft" | "scheduled" | "archived";

const STATUS_MAP: Record<PostStatus, { label: string; cls: string }> = {
  published: { label: "Published", cls: "bg-emerald-100 text-emerald-700" },
  draft:     { label: "Draft",     cls: "bg-slate-100 text-slate-600" },
  scheduled: { label: "Scheduled", cls: "bg-blue-100 text-blue-700" },
  archived:  { label: "Archived",  cls: "bg-slate-100 text-slate-500" },
};

const POSTS = [
  { id: "P-001", title: "10 Tips for a Sparkling Kitchen", slug: "10-tips-sparkling-kitchen", status: "published" as PostStatus, seoScore: 88, views: 1240, date: "10 May 2026", category: "Tips" },
  { id: "P-002", title: "How Often Should You Deep Clean?", slug: "how-often-deep-clean", status: "published" as PostStatus, seoScore: 92, views: 2150, date: "2 May 2026", category: "Guide" },
  { id: "P-003", title: "Cape Town Spring Cleaning Checklist", slug: "spring-cleaning-cape-town", status: "published" as PostStatus, seoScore: 76, views: 890, date: "25 Apr 2026", category: "Seasonal" },
  { id: "P-004", title: "Moving Out? Here's Your Cleaning Checklist", slug: "move-out-cleaning-checklist", status: "draft" as PostStatus, seoScore: 45, views: 0, date: "—", category: "Guide" },
  { id: "P-005", title: "Benefits of Professional Cleaning Services", slug: "professional-cleaning-benefits", status: "scheduled" as PostStatus, seoScore: 71, views: 0, date: "20 May 2026", category: "Marketing" },
];

function SeoScoreBadge({ score }: { score: number }) {
  const color = score >= 80 ? "text-emerald-600 bg-emerald-50" : score >= 60 ? "text-orange-600 bg-orange-50" : "text-red-600 bg-red-50";
  return <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", color)}>{score}</span>;
}

export default function BlogPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<PostStatus | "all">("all");

  const filtered = POSTS.filter(p => {
    const s = !search || p.title.toLowerCase().includes(search.toLowerCase());
    const sf = statusFilter === "all" || p.status === statusFilter;
    return s && sf;
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Blog</h1>
          <p className="mt-0.5 text-sm text-slate-500">Manage blog content, SEO scores and publishing pipeline.</p>
        </div>
        <button type="button" className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 shadow-sm">
          <Plus className="h-4 w-4" /> New post
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Published", count: POSTS.filter(p => p.status === "published").length, color: "text-emerald-600" },
          { label: "Drafts", count: POSTS.filter(p => p.status === "draft").length, color: "text-slate-600" },
          { label: "Scheduled", count: POSTS.filter(p => p.status === "scheduled").length, color: "text-blue-600" },
          { label: "Total views", count: POSTS.reduce((a, p) => a + p.views, 0).toLocaleString(), color: "text-violet-600" },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl bg-white border border-slate-100 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k.label}</p>
            <p className={cn("mt-1 text-2xl font-bold", k.color)}>{k.count}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl bg-white border border-slate-100 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="Search posts…" value={search} onChange={e => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-sm placeholder:text-slate-400 focus:outline-none focus:border-blue-300" />
          </div>
          <div className="flex gap-1">
            {(["all", "published", "draft", "scheduled", "archived"] as const).map((s) => (
              <button key={s} type="button" onClick={() => setStatusFilter(s as PostStatus | "all")}
                className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors",
                  statusFilter === s ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-100")}>
                {s === "all" ? "All" : STATUS_MAP[s as PostStatus].label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                {["Title", "Category", "SEO Score", "Views", "Published", "Status", ""].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map((p) => {
                const s = STATUS_MAP[p.status];
                return (
                  <tr key={p.id} className="group hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold text-slate-800">{p.title}</p>
                      <p className="text-xs text-slate-400">/blog/{p.slug}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{p.category}</span>
                    </td>
                    <td className="px-4 py-3"><SeoScoreBadge score={p.seoScore} /></td>
                    <td className="px-4 py-3 text-sm text-slate-600">{p.views > 0 ? p.views.toLocaleString() : "—"}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{p.date}</td>
                    <td className="px-4 py-3">
                      <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold", s.cls)}>{s.label}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button type="button" className="rounded-lg p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600"><Eye className="h-3.5 w-3.5" /></button>
                        <button type="button" className="rounded-lg p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600"><Edit2 className="h-3.5 w-3.5" /></button>
                        <button type="button" className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
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
