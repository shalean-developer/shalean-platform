"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, Plus, Edit2, RefreshCw, AlertCircle, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminData } from "@/hooks/useAdminData";

const DEFAULT_PAGE_SIZE = 15;
const PAGE_SIZE_OPTIONS = [10, 15, 25, 50] as const;

type PostRow = {
  id: string;
  slug: string;
  title: string;
  status: string;
  source: string;
  updated_at: string;
  published_at: string | null;
};

type PostStatus = "published" | "draft" | "scheduled";

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  published: { label: "Published", cls: "bg-emerald-100 text-emerald-700" },
  draft: { label: "Draft", cls: "bg-slate-100 text-slate-600" },
  scheduled: { label: "Scheduled", cls: "bg-blue-100 text-blue-700" },
};

const SOURCE_MAP: Record<string, string> = {
  editorial: "Editorial",
  programmatic: "Programmatic",
  high_conversion: "High conversion",
};

function sourceLabel(source: string): string {
  return SOURCE_MAP[source] ?? source.replace(/_/g, " ");
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

export default function BlogPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<PostStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const { data, loading, error, refetch } = useAdminData<{ posts: PostRow[] }>("/api/admin/blog/posts", {
    params: { status: "all" },
  });

  const posts = data?.posts ?? [];

  const statusFiltered = useMemo(() => {
    if (statusFilter === "all") return posts;
    return posts.filter((p) => p.status === statusFilter);
  }, [posts, statusFilter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return statusFiltered;
    return statusFiltered.filter((p) => p.title.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q));
  }, [statusFiltered, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageFrom = filtered.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const pageTo = Math.min(safePage * pageSize, filtered.length);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const counts = useMemo(
    () => ({
      published: posts.filter((p) => p.status === "published").length,
      draft: posts.filter((p) => p.status === "draft").length,
      scheduled: posts.filter((p) => p.status === "scheduled").length,
    }),
    [posts],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Blog</h1>
          <p className="mt-0.5 text-sm text-slate-500">CMS posts from the database — manage in the blog editor.</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void refetch()}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm hover:bg-slate-50"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </button>
          <Link
            href="/office/blog/new"
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" /> New post
          </Link>
        </div>
      </div>

      {error ? (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Published", count: counts.published, color: "text-emerald-600" },
          { label: "Drafts", count: counts.draft, color: "text-slate-600" },
          { label: "Scheduled", count: counts.scheduled, color: "text-blue-600" },
          { label: "Total posts", count: posts.length, color: "text-violet-600" },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k.label}</p>
            <p className={cn("mt-1 text-2xl font-bold tabular-nums", k.color)}>{loading ? "—" : k.count}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              placeholder="Search posts…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-sm placeholder:text-slate-400 focus:border-blue-300 focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {(["all", "published", "draft", "scheduled"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors",
                  statusFilter === s ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-100",
                )}
              >
                {s === "all" ? "All" : STATUS_MAP[s]?.label ?? s}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading posts…
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-500">No posts match this filter.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  {["Title", "Source", "Updated", "Published", "Status", ""].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {pageRows.map((p) => {
                  const s = STATUS_MAP[p.status] ?? { label: p.status, cls: "bg-slate-100 text-slate-600" };
                  return (
                    <tr key={p.id} className="group hover:bg-slate-50/50">
                      <td className="px-4 py-3">
                        <Link href={`/office/blog/${p.id}`} className="font-semibold text-slate-800 hover:text-blue-600 hover:underline">
                          {p.title}
                        </Link>
                        <p className="text-xs text-slate-400">/blog/{p.slug}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{sourceLabel(p.source)}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{formatDate(p.updated_at)}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{formatDate(p.published_at)}</td>
                      <td className="px-4 py-3">
                        <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold", s.cls)}>{s.label}</span>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/office/blog/${p.id}`}
                          className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:underline"
                        >
                          <Edit2 className="h-3.5 w-3.5" /> Edit
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && filtered.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
            <p className="text-xs text-slate-400">
              Showing {pageFrom}–{pageTo} of {filtered.length} post{filtered.length === 1 ? "" : "s"}
              {search.trim() ? ` matching “${search.trim()}”` : ""}
            </p>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-xs text-slate-500">
                Rows
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
              <span className="text-xs font-medium text-slate-500">
                Page {safePage} of {totalPages}
              </span>
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Prev
              </button>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
