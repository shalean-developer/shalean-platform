"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2, Pencil, Save, Trash2, X } from "lucide-react";
import { confirm } from "@/components/ui/notifications";
import { cn } from "@/lib/utils";
import { adminFetch, getAdminToken } from "@/hooks/useAdminData";
import type { OfficeCleanerEditableVisitRow } from "@/lib/admin/payouts/officeCleanerEditableVisits";

type CleanerVisitsResponse = {
  cleaner_id: string;
  cleaner_name: string;
  range: { from: string; to: string };
  visits: OfficeCleanerEditableVisitRow[];
  total_cents: number;
  editable_total_cents: number;
  unbatched_cents: number;
  unbatched_visits: number;
};

const BUCKET_LABEL: Record<string, { label: string; cls: string }> = {
  pending: { label: "Pending invoice", cls: "bg-amber-100 text-amber-800" },
  eligible: { label: "Eligible", cls: "bg-violet-100 text-violet-800" },
  batched_open: { label: "In batch", cls: "bg-blue-100 text-blue-800" },
  paid: { label: "Paid", cls: "bg-emerald-100 text-emerald-800" },
};

function formatZar(cents: number): string {
  return `R ${Math.round(cents / 100).toLocaleString("en-ZA")}`;
}

function formatRangeLabel(from: string, to: string): string {
  const f = new Date(`${from}T12:00:00`).toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
  const t = new Date(`${to}T12:00:00`).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `${f} – ${t}`;
}

function centsToZarInput(cents: number): string {
  return String(Math.round(cents / 100));
}

function zarInputToCents(raw: string): number | null {
  const cleaned = raw.replace(/[R\s,]/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

type Props = {
  cleanerId: string;
  fromDate: string;
  toDate: string;
  onBack: () => void;
  onChanged: () => void | Promise<void>;
  onToast: (msg: string, ok: boolean) => void;
};

export function OfficeCleanerEarningsEditPanel({
  cleanerId,
  fromDate,
  toDate,
  onBack,
  onChanged,
  onToast,
}: Props) {
  const [detail, setDetail] = useState<CleanerVisitsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [visitEditMode, setVisitEditMode] = useState(false);
  const [visitEdits, setVisitEdits] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAdminToken();
      if (!token) throw new Error("Not authenticated");
      const params = new URLSearchParams({
        cleaner_id: cleanerId,
        from: fromDate,
        to: toDate,
      });
      const res = await globalThis.fetch(`/api/admin/payouts/cleaner-visits?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const json = (await res.json()) as CleanerVisitsResponse & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not load visits.");
      setDetail(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed.");
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [cleanerId, fromDate, toDate]);

  useEffect(() => {
    void load();
  }, [load]);

  function visitEarningsCents(visit: OfficeCleanerEditableVisitRow): number {
    return visit.earnings_cents;
  }

  function startVisitEditMode() {
    if (!detail) return;
    const initial: Record<string, string> = {};
    for (const v of detail.visits) {
      if (!v.editable) continue;
      initial[v.id] = centsToZarInput(visitEarningsCents(v));
    }
    setVisitEdits(initial);
    setVisitEditMode(true);
  }

  function cancelVisitEditMode() {
    setVisitEditMode(false);
    setVisitEdits({});
  }

  async function handleRemoveVisit(visit: OfficeCleanerEditableVisitRow) {
    const label = visit.customer_name ?? visit.date ?? visit.id;
    const confirmed = await confirm({
      title: `Remove "${label}" from ${detail?.cleaner_name ?? "this cleaner"}'s payout?`,
      description:
        "The visit will be unassigned from this cleaner so you can assign it to the correct person. This cannot be undone from this screen.",
      confirmLabel: "Remove visit",
      variant: "destructive",
    });
    if (!confirmed) return;

    setBusy(`remove:${visit.id}`);
    const res = await adminFetch(`/api/admin/bookings/${encodeURIComponent(visit.id)}/remove-cleaner-payout`, {
      method: "POST",
      body: JSON.stringify({ cleaner_id: cleanerId }),
    });
    setBusy(null);

    if (!res.ok) {
      onToast(res.error ?? "Could not remove visit payout.", false);
      return;
    }

    const mode = (res.data as { mode?: string } | undefined)?.mode;
    onToast(
      mode === "roster_removed"
        ? "Cleaner removed from this visit — earnings recalculated for remaining roster."
        : "Visit removed from this cleaner — reassign to the correct cleaner on the booking page.",
      true,
    );
    await load();
    await onChanged();
  }

  async function handleSaveVisitEdits() {
    if (!detail) return;
    const editableVisits = detail.visits.filter((v) => v.editable);
    const changed = editableVisits.filter((v) => {
      const editZar = visitEdits[v.id];
      if (editZar == null) return false;
      const cents = zarInputToCents(editZar);
      const current = visitEarningsCents(v);
      return cents != null && cents !== current;
    });

    if (changed.length === 0) {
      onToast("No visit earnings were changed.", false);
      return;
    }

    setBusy("save-visits");
    let saved = 0;
    let failed = 0;
    let lastError: string | null = null;
    for (const v of changed) {
      const cents = zarInputToCents(visitEdits[v.id] ?? "");
      if (cents == null) {
        failed += 1;
        continue;
      }
      const res = await adminFetch(`/api/admin/bookings/${encodeURIComponent(v.id)}/adjust-payout-earnings`, {
        method: "PATCH",
        body: JSON.stringify({ payout_cents: cents, bonus_cents: 0, cleaner_id: cleanerId }),
      });
      if (res.ok) saved += 1;
      else {
        failed += 1;
        lastError = res.error ?? "Save failed";
      }
    }
    setBusy(null);
    if (failed > 0) {
      onToast(lastError ? `${lastError} (${saved} saved, ${failed} failed)` : `Saved ${saved}; ${failed} failed.`, false);
    } else {
      onToast(
        `Updated ${saved} visit${saved === 1 ? "" : "s"} — cleaners will see the new amounts on their dashboard.`,
        true,
      );
      setVisitEditMode(false);
      setVisitEdits({});
    }
    await load();
    await onChanged();
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-slate-100 bg-white p-8 text-sm text-slate-500 shadow-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading visits…
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm">
        <p className="text-sm text-red-700">{error ?? "Cleaner visits not found."}</p>
        <button type="button" onClick={onBack} className="mt-3 text-sm font-semibold text-red-700 hover:underline">
          ← Back to payouts
        </button>
      </div>
    );
  }

  const editableVisits = detail.visits.filter((v) => v.editable);
  const hasUnbatched = detail.unbatched_visits > 0;

  return (
    <div className="space-y-4 rounded-2xl border border-violet-100 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-4 sm:px-6">
        <button
          type="button"
          onClick={onBack}
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-violet-700"
        >
          <ArrowLeft className="h-4 w-4" />
          All payouts
        </button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{detail.cleaner_name}</h2>
            <p className="mt-1 text-sm text-slate-600">{formatRangeLabel(detail.range.from, detail.range.to)}</p>
            <p className="mt-1 text-xs text-slate-500">
              {detail.visits.length} completed visit{detail.visits.length === 1 ? "" : "s"} in period
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total earnings</p>
            <p className="text-2xl font-bold tabular-nums text-slate-900">{formatZar(detail.total_cents)}</p>
            {hasUnbatched ? (
              <p className="text-xs text-violet-700">
                {detail.unbatched_visits} unbatched · {formatZar(detail.unbatched_cents)}
              </p>
            ) : null}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {editableVisits.length > 0 && !visitEditMode ? (
            <button
              type="button"
              disabled={busy !== null}
              onClick={startVisitEditMode}
              className="inline-flex items-center gap-1.5 rounded-lg border border-violet-300 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-800 hover:bg-violet-100 disabled:opacity-50"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit visit earnings
            </button>
          ) : null}
          {visitEditMode ? (
            <>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void handleSaveVisitEdits()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-xs font-bold text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {busy === "save-visits" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save visits
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={cancelVisitEditMode}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </button>
            </>
          ) : null}
          <Link
            href={`/office/cleaners/${encodeURIComponent(detail.cleaner_id)}`}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cleaner profile
          </Link>
        </div>
      </div>

      {hasUnbatched ? (
        <div className="mx-4 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-950 sm:mx-6">
          <p className="font-semibold">Edit before generating monthly payouts</p>
          <p className="mt-1 text-xs leading-relaxed">
            Changes update each visit&apos;s stored earnings and appear on the cleaner&apos;s dashboard immediately —
            including team jobs (per-member roster split). Use <strong>Remove</strong> when a visit was assigned
            to the wrong cleaner. After you&apos;re happy with the amounts, use <strong>Generate monthly payouts</strong>{" "}
            on the main page.
          </p>
        </div>
      ) : null}

      <div className="overflow-x-auto px-4 pb-4 sm:px-6 sm:pb-6">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
          Visits ({detail.visits.length})
          {visitEditMode ? (
            <span className="ml-2 font-medium normal-case text-violet-600">— edit each visit amount (ZAR)</span>
          ) : null}
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">
              <th className="py-2 pr-3">Date</th>
              <th className="py-2 pr-3">Customer</th>
              <th className="py-2 pr-3">Service</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 text-right">Earnings</th>
              <th className="py-2 pl-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {detail.visits.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-slate-400">
                  No completed visits for this cleaner in this period.
                </td>
              </tr>
            ) : (
              detail.visits.map((v) => {
                const bucket = BUCKET_LABEL[v.payout_bucket] ?? {
                  label: v.payout_bucket,
                  cls: "bg-slate-100 text-slate-600",
                };
                const lineCents = visitEarningsCents(v);
                return (
                  <tr key={v.id} className={cn(!v.editable && "opacity-70")}>
                    <td className="py-2 pr-3 text-slate-600">{v.date ?? "—"}</td>
                    <td className="py-2 pr-3 font-medium text-slate-800">
                      <Link
                        href={`/office/bookings/${encodeURIComponent(v.id)}`}
                        className="hover:text-violet-700 hover:underline"
                      >
                        {v.customer_name ?? "—"}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 text-slate-600">{v.service ?? "—"}</td>
                    <td className="py-2 pr-3">
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", bucket.cls)}>
                        {bucket.label}
                      </span>
                      {v.edit_blocked_reason ? (
                        <p className="mt-1 text-[10px] leading-snug text-slate-500">{v.edit_blocked_reason}</p>
                      ) : null}
                    </td>
                    <td className="py-2 text-right font-semibold tabular-nums text-slate-800">
                      {visitEditMode && v.editable ? (
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={visitEdits[v.id] ?? centsToZarInput(lineCents)}
                          onChange={(e) => setVisitEdits((prev) => ({ ...prev, [v.id]: e.target.value }))}
                          className="w-24 rounded-md border border-violet-200 bg-white px-2 py-1 text-right text-sm font-bold tabular-nums"
                          aria-label={`Edit earnings for ${v.customer_name ?? v.id}`}
                        />
                      ) : (
                        formatZar(v.earnings_cents)
                      )}
                    </td>
                    <td className="py-2 pl-2 text-right">
                      {v.editable && !visitEditMode ? (
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => void handleRemoveVisit(v)}
                          className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                          title="Remove wrong assignment from this cleaner"
                        >
                          {busy === `remove:${v.id}` ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="h-3 w-3" />
                          )}
                          Remove
                        </button>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
