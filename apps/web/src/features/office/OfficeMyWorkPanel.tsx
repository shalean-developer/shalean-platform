"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabaseAccessToken } from "@/lib/supabase/browser";
import type { OfficeWorkItem } from "@/lib/admin/officeWorkItems";

type Category = "all" | "operations" | "finance" | "workforce" | "customer-care" | "marketing" | "system-health";
type MyWorkResponse = {
  items?: OfficeWorkItem[];
  counts?: Partial<Record<OfficeWorkItem["priority"], number>>;
  total?: number;
  totalAll?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
  category?: Category;
  categoryCounts?: Partial<Record<Category, number>>;
  nearTermBookingDays?: number;
  error?: string;
};

const CATEGORIES: Array<{ id: Category; label: string }> = [
  { id: "all", label: "All" },
  { id: "operations", label: "Operations" },
  { id: "finance", label: "Finance" },
  { id: "workforce", label: "Workforce" },
  { id: "customer-care", label: "Customer Care" },
  { id: "marketing", label: "Marketing" },
  { id: "system-health", label: "System Health" },
];

function priorityClass(priority: OfficeWorkItem["priority"]): string {
  if (priority === "critical") return "border-red-200 bg-red-50 text-red-700";
  if (priority === "high") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function WorkMeta({ summary }: { summary: string }) {
  return <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs leading-5 text-slate-500">{summary.split(" • ").map((part, index) => <span key={`${part}-${index}`} className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-slate-300" aria-hidden="true" />{part}</span>)}</div>;
}

export function OfficeMyWorkPanel() {
  const [payload, setPayload] = useState<MyWorkResponse>({});
  const [category, setCategory] = useState<Category>("all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pageSize = 30;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const token = await getSupabaseAccessToken();
      if (!token) { if (!cancelled) { setError("Office session unavailable."); setLoading(false); } return; }
      const qs = new URLSearchParams({ category, page: String(page), pageSize: String(pageSize) });
      const response = await fetch(`/api/admin/my-work?${qs.toString()}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const next = (await response.json().catch(() => ({}))) as MyWorkResponse;
      if (cancelled) return;
      if (!response.ok) setError(next.error || "Could not load your work queue.");
      else { setError(null); setPayload(next); if (next.page && next.page !== page) setPage(next.page); }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [category, page]);

  const items = payload.items ?? [];
  const counts = payload.counts ?? {};
  const total = payload.total ?? 0;
  const totalAll = payload.totalAll ?? total;
  const totalPages = payload.totalPages ?? 1;
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = total === 0 ? 0 : Math.min(total, start + items.length - 1);

  return <section aria-labelledby="my-work-heading" className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_4px_22px_rgba(15,23,42,0.045)] sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">Priority 3</p>
        <h2 id="my-work-heading" className="mt-1 text-xl font-semibold tracking-tight text-slate-950">My Work</h2>
        <p className="mt-1 text-sm text-slate-500">Live, permission-scoped actions requiring your attention. Unassigned bookings appear only when overdue, today, or within the next {payload.nearTermBookingDays ?? 7} days.</p>
      </div>
      {!loading && !error ? <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
        <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-700">{totalAll.toLocaleString("en-ZA")} total open</span>
        {(counts.critical ?? 0) > 0 ? <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-red-700">Critical {counts.critical}</span> : null}
        {(counts.high ?? 0) > 0 ? <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-amber-700">High {counts.high}</span> : null}
        {(counts.medium ?? 0) > 0 ? <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-700">Medium {counts.medium}</span> : null}
      </div> : null}
    </div>

    <div className="mt-4 flex flex-wrap gap-2" aria-label="My Work categories">{CATEGORIES.map((entry) => {
      const active = category === entry.id;
      const count = entry.id === "all" ? totalAll : (payload.categoryCounts?.[entry.id] ?? 0);
      return <button key={entry.id} type="button" onClick={() => { setCategory(entry.id); setPage(1); }} className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${active ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-700"}`}>{entry.label} <span className={active ? "text-blue-100" : "text-slate-400"}>{count}</span></button>;
    })}</div>

    {!loading && !error ? <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"><span>Showing {start}–{end} of {total.toLocaleString("en-ZA")}{category !== "all" ? ` in ${CATEGORIES.find((x) => x.id === category)?.label}` : ""}</span>{totalPages > 1 ? <span>Page {page} of {totalPages}</span> : null}</div> : null}

    {loading ? <div className="mt-5 grid gap-3 lg:grid-cols-2">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-28 animate-pulse rounded-2xl bg-slate-100" />)}</div> : null}
    {error ? <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{error}</p> : null}
    {!loading && !error && items.length === 0 ? <p className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">No open work is currently assigned to this category and scope.</p> : null}

    {items.length > 0 ? <div className="mt-5 grid gap-3 lg:grid-cols-2">{items.map((item) => <article key={item.id} className="group rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_4px_rgba(15,23,42,0.025)] transition duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_8px_24px_rgba(15,23,42,0.07)]">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="text-sm font-semibold leading-5 text-slate-950">{item.title}</h3><WorkMeta summary={item.summary} /></div><span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase ${priorityClass(item.priority)}`}>{item.priority}</span></div>
      <div className="mt-4 flex flex-wrap items-center gap-5 border-t border-slate-100 pt-3 text-xs font-semibold"><Link href={item.href} className="text-blue-700 transition hover:text-blue-900">{item.actionLabel} →</Link><Link href={item.href} className="text-slate-600 transition hover:text-slate-950">View details</Link></div>
    </article>)}</div> : null}

    {!loading && !error && totalPages > 1 ? <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4"><button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40">Previous</button><span className="text-xs text-slate-500">Showing {start}–{end} of {total.toLocaleString("en-ZA")}</span><button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40">Next</button></div> : null}
  </section>;
}
