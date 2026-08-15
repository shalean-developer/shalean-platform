"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { adminFetch } from "@/hooks/useAdminData";
import { emitAdminToast } from "@/lib/admin/toastBus";

const SERVICES = [
  ["regular-cleaning", "Standard"],
  ["deep-cleaning", "Deep"],
  ["moving-cleaning", "Move In/Out"],
  ["airbnb-cleaning", "Airbnb"],
  ["office-cleaning", "Office"],
  ["carpet-cleaning", "Carpet"],
] as const;

type ExtraAssignment = {
  id: string;
  slug: string;
  name: string;
  service_slugs: string[];
  is_active: boolean;
  sort_order: number;
};

export function PricingExtraServiceAssignments() {
  const [rows, setRows] = useState<ExtraAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await adminFetch<{ extras?: ExtraAssignment[] }>(
      "/api/admin/pricing-extra-service-assignments",
      { method: "GET", cache: "no-store" },
    );
    setLoading(false);
    if (!res.ok) {
      emitAdminToast(res.error ?? "Could not load extra service assignments.", "error");
      return;
    }
    setRows(res.data?.extras ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(row: ExtraAssignment, serviceSlug: string) {
    const current = row.service_slugs ?? [];
    const next = current.includes(serviceSlug)
      ? current.filter((slug) => slug !== serviceSlug)
      : [...current, serviceSlug];

    setSavingId(row.id);
    const res = await adminFetch<{ extra?: ExtraAssignment }>(
      "/api/admin/pricing-extra-service-assignments",
      {
        method: "PATCH",
        body: JSON.stringify({ id: row.id, service_slugs: next }),
      },
    );
    setSavingId(null);

    if (!res.ok) {
      emitAdminToast(res.error ?? "Could not save service assignments.", "error");
      return;
    }

    setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, service_slugs: next } : item)));
    emitAdminToast("Extra service assignment saved.", "success");
  }

  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Extra service assignments</h2>
          <p className="mt-1 text-sm text-slate-500">
            Database source of truth for which add-ons appear for each booking service.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || savingId != null}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100" />)}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="min-w-[820px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 font-semibold">Extra</th>
                {SERVICES.map(([, label]) => (
                  <th key={label} className="px-3 py-2 text-center font-semibold">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-800">{row.name}</div>
                    <div className="text-xs text-slate-400">{row.slug}{!row.is_active ? " · inactive" : ""}</div>
                  </td>
                  {SERVICES.map(([slug]) => (
                    <td key={slug} className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={(row.service_slugs ?? []).includes(slug)}
                        disabled={savingId === row.id}
                        onChange={() => void toggle(row, slug)}
                        aria-label={`${row.name} for ${slug}`}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
