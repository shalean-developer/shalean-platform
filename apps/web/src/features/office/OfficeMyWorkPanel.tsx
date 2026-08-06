"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseAccessToken } from "@/lib/supabase/browser";
import {
  groupOfficeWorkItems,
  type OfficeWorkItem,
} from "@/lib/admin/officeWorkItems";

type MyWorkResponse = {
  items?: OfficeWorkItem[];
  counts?: Partial<Record<OfficeWorkItem["priority"], number>>;
  groups?: { operational?: number; systemHealth?: number };
  generatedAt?: string;
  error?: string;
};

function priorityClass(priority: OfficeWorkItem["priority"]): string {
  if (priority === "critical") return "border-red-200 bg-red-50 text-red-700";
  if (priority === "high") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function formatWhen(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toLocaleString("en-ZA", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function WorkItemCard({ item }: { item: OfficeWorkItem }) {
  const [openTech, setOpenTech] = useState(false);
  const lastSuccess = formatWhen(item.lastSuccessAt);
  const occurred = formatWhen(item.occurredAt);

  return (
    <article className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-[0_1px_4px_rgba(15,23,42,0.025)] transition hover:border-blue-200">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${priorityClass(item.severity ?? item.priority)}`}>
              {item.severity ?? item.priority}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
              {item.category === "system_health" ? "System" : "Operations"}
            </span>
          </div>
          <h3 className="mt-2 text-sm font-semibold leading-5 text-slate-950">{item.title}</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">{item.summary}</p>
          <p className="mt-1.5 text-xs leading-5 text-slate-600">
            <span className="font-medium text-slate-700">Impact:</span> {item.businessImpact}
          </p>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
            {item.affectedRecordCount != null ? <span>{item.affectedRecordCount} record{item.affectedRecordCount === 1 ? "" : "s"}</span> : null}
            {lastSuccess ? <span>Last success {lastSuccess}</span> : null}
            {occurred && !lastSuccess ? <span>Last run {occurred}</span> : null}
          </div>
        </div>
      </div>

      {item.technicalDetails ? (
        <div className="mt-2">
          <button
            type="button"
            className="text-[11px] font-semibold text-slate-500 hover:text-slate-800"
            onClick={() => setOpenTech((value) => !value)}
            aria-expanded={openTech}
          >
            {openTech ? "Hide technical details" : "Technical details"}
          </button>
          {openTech ? (
            <pre className="mt-1.5 max-h-40 overflow-auto rounded-lg bg-slate-50 p-2 text-[10px] leading-4 text-slate-600">
              {item.technicalDetails}
            </pre>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-slate-100 pt-2.5 text-xs font-semibold">
        <Link href={item.href} className="text-blue-700 transition hover:text-blue-900">
          {item.actionLabel} →
        </Link>
      </div>
    </article>
  );
}

function WorkGroup({
  title,
  subtitle,
  items,
  emptyLabel,
}: {
  title: string;
  subtitle: string;
  items: OfficeWorkItem[];
  emptyLabel: string;
}) {
  return (
    <div>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-3 text-xs text-emerald-900">{emptyLabel}</p>
      ) : (
        <div className="grid gap-2.5 lg:grid-cols-2">
          {items.map((item) => (
            <WorkItemCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
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
        if (!cancelled) {
          setError("Office session unavailable.");
          setLoading(false);
        }
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
    return () => {
      cancelled = true;
    };
  }, []);

  const grouped = useMemo(() => groupOfficeWorkItems(items), [items]);

  return (
    <section aria-labelledby="my-work-heading" className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_4px_22px_rgba(15,23,42,0.045)] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-600">Work queue</p>
          <h2 id="my-work-heading" className="mt-1 text-lg font-semibold tracking-tight text-slate-950">My Work</h2>
          <p className="mt-0.5 text-sm text-slate-500">Permission-scoped operational actions and system health.</p>
        </div>
        {!loading && !error ? (
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">{items.length} open</span>
            {(counts?.critical ?? 0) > 0 ? (
              <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-red-700">Critical {counts?.critical}</span>
            ) : null}
            {(counts?.high ?? 0) > 0 ? (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-700">High {counts?.high}</span>
            ) : null}
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      ) : null}
      {error ? <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{error}</p> : null}

      {!loading && !error ? (
        <div className="mt-5 space-y-6">
          <WorkGroup
            title="Operational actions"
            subtitle="Team allocations, booking exceptions, customer issues and approval tasks."
            items={grouped.operational}
            emptyLabel="No operational actions need your attention."
          />
          <WorkGroup
            title="System health"
            subtitle="Recurring failures, invoice scheduler, payout integrity and notification queues."
            items={grouped.systemHealth}
            emptyLabel="No stale or failed system jobs in your scope."
          />
        </div>
      ) : null}
    </section>
  );
}
