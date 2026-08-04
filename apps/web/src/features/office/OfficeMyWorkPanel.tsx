"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabaseAccessToken } from "@/lib/supabase/browser";
import type { OfficeWorkItem } from "@/lib/admin/officeWorkItems";

type MyWorkResponse = {
  items?: OfficeWorkItem[];
  counts?: Partial<Record<OfficeWorkItem["priority"], number>>;
  generatedAt?: string;
  error?: string;
};

function priorityClass(priority: OfficeWorkItem["priority"]): string {
  if (priority === "critical") return "border-red-200 bg-red-50 text-red-700";
  if (priority === "high") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function WorkMeta({ summary }: { summary: string }) {
  const parts = summary.split(" • ");
  return <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs leading-5 text-slate-500">
    {parts.map((part, index) => <span key={`${part}-${index}`} className="inline-flex items-center gap-1.5">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-300" aria-hidden="true" />{part}
    </span>)}
  </div>;
}

export function OfficeMyWorkPanel() {
  const [items, setItems] = useState<OfficeWorkItem[]>([]);
  const [counts, setCounts] = useState<MyWorkResponse["counts"]>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await getSupabaseAccessToken();
      if (!token) {
        if (!cancelled) { setError("Office session unavailable."); setLoading(false); }
        return;
      }
      const response = await fetch("/api/admin/my-work", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as MyWorkResponse;
      if (cancelled) return;
      if (!response.ok) setError(payload.error || "Could not load your work queue.");
      else {
        setItems(payload.items ?? []);
        setCounts(payload.counts ?? {});
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  return <section aria-labelledby="my-work-heading" className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_4px_22px_rgba(15,23,42,0.045)] sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">Priority 3</p>
        <h2 id="my-work-heading" className="mt-1 text-xl font-semibold tracking-tight text-slate-950">My Work</h2>
        <p className="mt-1 text-sm text-slate-500">Live, permission-scoped actions requiring your attention.</p>
      </div>
      {!loading && !error ? <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
        <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-700">{items.length} open</span>
        {(counts?.critical ?? 0) > 0 ? <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-red-700">Critical {counts?.critical}</span> : null}
        {(counts?.high ?? 0) > 0 ? <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-amber-700">High {counts?.high}</span> : null}
        {(counts?.medium ?? 0) > 0 ? <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-700">Medium {counts?.medium}</span> : null}
      </div> : null}
    </div>

    {loading ? <div className="mt-5 grid gap-3 lg:grid-cols-2">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-28 animate-pulse rounded-2xl bg-slate-100" />)}</div> : null}
    {error ? <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{error}</p> : null}
    {!loading && !error && items.length === 0 ? <p className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">No urgent work is currently assigned to your permissions and scope.</p> : null}

    {items.length > 0 ? <div className="mt-5 grid gap-3 lg:grid-cols-2">{items.slice(0, 8).map((item) => (
      <article key={item.id} className="group rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_4px_rgba(15,23,42,0.025)] transition duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_8px_24px_rgba(15,23,42,0.07)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold leading-5 text-slate-950">{item.title}</h3>
            <WorkMeta summary={item.summary} />
          </div>
          <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase ${priorityClass(item.priority)}`}>{item.priority}</span>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-5 border-t border-slate-100 pt-3 text-xs font-semibold">
          <Link href={item.href} className="text-blue-700 transition hover:text-blue-900">{item.actionLabel} →</Link>
          <Link href={item.href} className="text-slate-600 transition hover:text-slate-950">View booking</Link>
        </div>
      </article>
    ))}</div> : null}
  </section>;
}
