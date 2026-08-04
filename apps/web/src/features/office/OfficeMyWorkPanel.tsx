"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabaseAccessToken } from "@/lib/supabase/browser";
import type { OfficeWorkItem } from "@/lib/admin/officeWorkItems";

type MyWorkResponse = { items?: OfficeWorkItem[]; generatedAt?: string; error?: string };

function priorityClass(priority: OfficeWorkItem["priority"]): string {
  if (priority === "critical") return "border-red-200 bg-red-50 text-red-800";
  if (priority === "high") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

export function OfficeMyWorkPanel() {
  const [items, setItems] = useState<OfficeWorkItem[]>([]);
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
      else setItems(payload.items ?? []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  return <section aria-labelledby="my-work-heading" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">Priority 3</p>
        <h2 id="my-work-heading" className="mt-1 text-lg font-semibold text-slate-950">My Work</h2>
        <p className="mt-1 text-sm text-slate-500">Live, permission-scoped actions requiring your attention.</p>
      </div>
      {!loading && !error ? <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{items.length} open</span> : null}
    </div>

    {loading ? <p className="mt-4 text-sm text-slate-500">Loading your work queue…</p> : null}
    {error ? <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{error}</p> : null}
    {!loading && !error && items.length === 0 ? <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">No urgent work is currently assigned to your permissions and scope.</p> : null}

    {items.length > 0 ? <div className="mt-4 grid gap-3 lg:grid-cols-2">{items.slice(0, 8).map((item) => (
      <Link key={item.id} href={item.href} className="rounded-xl border border-slate-200 p-4 transition hover:border-blue-300 hover:shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-950">{item.title}</h3>
            <p className="mt-1 text-sm text-slate-600">{item.summary}</p>
          </div>
          <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase ${priorityClass(item.priority)}`}>{item.priority}</span>
        </div>
        <p className="mt-3 text-xs font-semibold text-blue-700">{item.actionLabel} →</p>
      </Link>
    ))}</div> : null}
  </section>;
}
