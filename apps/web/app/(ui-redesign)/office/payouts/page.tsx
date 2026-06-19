"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Search,
  Download,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { OfficePayoutDetailPanel } from "@/components/admin/office/OfficePayoutDetailPanel";
import { cn } from "@/lib/utils";
import { useAdminData, adminFetch, getAdminToken } from "@/hooks/useAdminData";

type PayoutRow = {
  id: string;
  cleaner_id: string;
  cleaner_name: string;
  booking_count: number;
  total_amount_cents: number;
  status: string;
  payment_status: string | null;
  payment_reference: string | null;
  period_start: string;
  period_end: string;
  created_at: string;
  approved_at: string | null;
  paid_at: string | null;
};

type PayoutsResponse = {
  payouts: PayoutRow[];
};

type EligibleGroup = {
  cleaner_id: string;
  cleaner_name: string;
  cleaner_phone: string;
  total_cents: number;
  bookings: Array<{ booking_id: string; date: string | null; amount_cents: number }>;
};

type EligibleResponse = {
  groups: EligibleGroup[];
};

type GenerateResponse = {
  skipped?: boolean;
  reason?: string;
  payoutsCreated?: number;
  bookingsLinked?: number;
  payoutsBackfilled?: number;
  weeksProcessed?: number;
  periods?: Array<{ start: string; end: string; payoutsCreated: number; bookingsLinked: number }>;
  period?: { start: string; end: string };
};

const STATUS_FILTERS = ["all", "pending", "frozen", "approved", "paid", "cancelled"] as const;

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "bg-orange-100 text-orange-700" },
  frozen: { label: "Frozen", cls: "bg-violet-100 text-violet-700" },
  approved: { label: "Approved", cls: "bg-blue-100 text-blue-700" },
  paid: { label: "Paid", cls: "bg-emerald-100 text-emerald-700" },
  cancelled: { label: "Cancelled", cls: "bg-slate-100 text-slate-600" },
};

function formatZar(cents: number): string {
  return `R ${Math.round(cents / 100).toLocaleString("en-ZA")}`;
}

function formatPeriod(start: string, end: string): string {
  const s = new Date(start).toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
  const e = new Date(end).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
  return `${s} – ${e}`;
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function buildPayoutsListCsv(rows: PayoutRow[]): string {
  const header = ["Cleaner", "Period start", "Period end", "Jobs", "Net payout (ZAR)", "Status", "Payment status", "Payout ID"];
  const lines = [header.join(",")];
  for (const p of rows) {
    lines.push(
      [
        csvEscape(p.cleaner_name ?? ""),
        csvEscape(p.period_start ?? ""),
        csvEscape(p.period_end ?? ""),
        String(p.booking_count ?? 0),
        String(Math.round(Number(p.total_amount_cents ?? 0) / 100)),
        csvEscape(p.status ?? ""),
        csvEscape(p.payment_status ?? ""),
        csvEscape(p.id ?? ""),
      ].join(","),
    );
  }
  return lines.join("\n");
}

export default function PayoutsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedPayoutId = searchParams.get("payout")?.trim() || null;

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const { data, loading, error, refetch } = useAdminData<PayoutsResponse>("/api/admin/payouts");
  const {
    data: eligibleData,
    loading: eligibleLoading,
    refetch: refetchEligible,
  } = useAdminData<EligibleResponse>("/api/admin/payouts/eligible");

  const payouts = data?.payouts ?? [];
  const eligibleGroups = eligibleData?.groups ?? [];

  const eligibleSummary = useMemo(() => {
    let bookingCount = 0;
    let totalCents = 0;
    for (const g of eligibleGroups) {
      bookingCount += g.bookings.length;
      totalCents += g.total_cents;
    }
    return { cleanerCount: eligibleGroups.length, bookingCount, totalCents };
  }, [eligibleGroups]);

  const filtered = payouts.filter((p) => {
    const s =
      !search ||
      (p.cleaner_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (p.id ?? "").toLowerCase().includes(search.toLowerCase());
    const sf = statusFilter === "all" || (p.status ?? "").toLowerCase() === statusFilter;
    return s && sf;
  });

  const pendingCount = payouts.filter((p) => (p.status ?? "").toLowerCase() === "pending").length;
  const paidCount = payouts.filter((p) => (p.status ?? "").toLowerCase() === "paid").length;
  const totalPendingCents = payouts
    .filter((p) => (p.status ?? "").toLowerCase() === "pending")
    .reduce((s, p) => s + (p.total_amount_cents ?? 0), 0);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  async function refreshAll() {
    await Promise.all([refetch(), refetchEligible()]);
  }

  async function handleApprove(id: string) {
    setActionLoading(id);
    const res = await adminFetch(`/api/admin/payouts/${encodeURIComponent(id)}/approve`, { method: "POST" });
    setActionLoading(null);
    if (res.ok) {
      showToast("Payout approved", true);
      await refreshAll();
    } else {
      showToast(res.error ?? "Failed to approve", false);
    }
  }

  async function handleGenerate() {
    setActionLoading("generate");
    const res = await adminFetch<GenerateResponse>("/api/admin/payouts/generate", { method: "POST" });
    setActionLoading(null);
    if (!res.ok) {
      showToast(res.error ?? "Failed to generate payouts", false);
      return;
    }
    const body = res.data;
    if (body?.skipped) {
      showToast(body.reason ? `Generation skipped: ${body.reason}` : "Generation already running — try again shortly.", false);
      return;
    }
    const created = body?.payoutsCreated ?? 0;
    const linked = body?.bookingsLinked ?? 0;
    const weeks = body?.weeksProcessed ?? 0;
    showToast(
      created > 0
        ? `Created ${created} payout batch${created === 1 ? "" : "es"} (${linked} booking${linked === 1 ? "" : "s"} linked${weeks > 1 ? ` across ${weeks} weeks` : ""}).`
        : weeks > 0
          ? "Generation finished — no new payout batches were needed for the eligible weeks."
          : "Generation finished — no unbatched earnings found.",
      created > 0,
    );
    await refreshAll();
  }

  function handleExportList() {
    if (filtered.length === 0) {
      showToast("Nothing to export — adjust filters or generate payout batches first.", false);
      return;
    }
    downloadCsv(`cleaner-payouts-${new Date().toISOString().slice(0, 10)}.csv`, buildPayoutsListCsv(filtered));
    showToast(`Exported ${filtered.length} payout${filtered.length === 1 ? "" : "s"}.`, true);
  }

  async function handleExportOne(id: string) {
    setActionLoading(`export:${id}`);
    try {
      const token = await getAdminToken();
      if (!token) {
        showToast("Not authenticated", false);
        return;
      }
      const res = await globalThis.fetch(`/api/admin/payouts/${encodeURIComponent(id)}/export`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        showToast(j.error ?? `Export failed (${res.status})`, false);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `payout-${id.slice(0, 8)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      showToast("Payout exported", true);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Export failed", false);
    } finally {
      setActionLoading(null);
    }
  }

  const showEligibleBanner = !loading && !eligibleLoading && payouts.length === 0 && eligibleSummary.bookingCount > 0;

  function closePayoutDetail() {
    router.push("/office/payouts");
  }

  return (
    <div className="space-y-5">
      {toast && (
        <div
          className={cn(
            "fixed bottom-6 right-6 z-50 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg",
            toast.ok ? "bg-emerald-600" : "bg-red-600",
          )}
        >
          {toast.msg}
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Cleaner Payouts</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Weekly payout batches plus eligible earnings waiting to be grouped.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void refreshAll()}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 shadow-sm"
          >
            <RefreshCw className={cn("h-4 w-4", (loading || eligibleLoading) && "animate-spin")} />
          </button>
          <button
            type="button"
            disabled={actionLoading === "generate"}
            onClick={() => void handleGenerate()}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 shadow-sm disabled:opacity-50"
          >
            <Sparkles className={cn("h-4 w-4", actionLoading === "generate" && "animate-pulse")} />
            {actionLoading === "generate" ? "Generating…" : "Generate weekly payouts"}
          </button>
          <button
            type="button"
            disabled={filtered.length === 0}
            onClick={handleExportList}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 shadow-sm disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> Export
          </button>
          <Link
            href="/admin/payouts"
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 shadow-sm"
          >
            Full hub
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
          <p className="text-sm text-red-700">{error}</p>
          <button type="button" onClick={() => void refreshAll()} className="ml-auto text-xs font-semibold text-red-600 hover:underline">
            Retry
          </button>
        </div>
      )}

      {showEligibleBanner && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-amber-950">Eligible earnings not yet batched</p>
            <p className="mt-1 text-sm text-amber-900/90">
              {eligibleSummary.bookingCount} completed booking{eligibleSummary.bookingCount === 1 ? "" : "s"} across{" "}
              {eligibleSummary.cleanerCount} cleaner{eligibleSummary.cleanerCount === 1 ? "" : "s"} (
              {formatZar(eligibleSummary.totalCents)} total) are ready to batch by completion week.
            </p>
          </div>
          <button
            type="button"
            disabled={actionLoading === "generate"}
            onClick={() => void handleGenerate()}
            className="shrink-0 rounded-xl bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
          >
            Generate now
          </button>
        </div>
      )}

      {selectedPayoutId ? (
        <OfficePayoutDetailPanel
          payoutId={selectedPayoutId}
          onBack={closePayoutDetail}
          onChanged={refreshAll}
          onToast={showToast}
        />
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {[
          { label: "Payout batches", value: loading ? "—" : payouts.length, color: "text-slate-800" },
          { label: "Pending batches", value: loading ? "—" : pendingCount, color: "text-orange-600" },
          { label: "Paid batches", value: loading ? "—" : paidCount, color: "text-emerald-600" },
          { label: "Pending amount", value: loading ? "—" : formatZar(totalPendingCents), color: "text-blue-600" },
          {
            label: "Eligible (unbatched)",
            value: eligibleLoading ? "—" : eligibleSummary.bookingCount,
            sub: eligibleLoading ? undefined : formatZar(eligibleSummary.totalCents),
            color: "text-violet-700",
          },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k.label}</p>
            <p className={cn("mt-1 text-2xl font-bold tabular-nums", k.color)}>{k.value}</p>
            {"sub" in k && k.sub ? <p className="mt-0.5 text-xs font-medium text-slate-500">{k.sub}</p> : null}
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search payouts…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-sm placeholder:text-slate-400 focus:border-blue-300 focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                  statusFilter === s ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-100",
                )}
              >
                {s === "all" ? "All" : (STATUS_MAP[s]?.label ?? s)}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                {["Cleaner", "Period", "Jobs", "Net payout", "Status", "Actions"].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={6} className="px-4 py-3">
                      <div className="h-5 animate-pulse rounded-lg bg-slate-100" />
                    </td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-sm text-slate-400">
                    {payouts.length === 0 && eligibleSummary.bookingCount > 0
                      ? "No payout batches yet — use Generate weekly payouts to create them from eligible earnings."
                      : "No payouts found."}
                  </td>
                </tr>
              ) : (
                filtered.map((p) => {
                  const statusKey = (p.status ?? "pending").toLowerCase();
                  const s = STATUS_MAP[statusKey] ?? { label: p.status ?? "—", cls: "bg-slate-100 text-slate-600" };
                  const isPending = statusKey === "pending";
                  const rowBusy = actionLoading === p.id || actionLoading === `export:${p.id}`;

                  return (
                    <tr
                      key={p.id}
                      className={cn(
                        "group transition-colors hover:bg-slate-50/50",
                        selectedPayoutId === p.id && "bg-blue-50/60",
                      )}
                    >
                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold text-slate-800">{p.cleaner_name}</p>
                        <p className="font-mono text-xs text-slate-400">{p.id.slice(0, 8).toUpperCase()}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">{formatPeriod(p.period_start, p.period_end)}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">{p.booking_count}</td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-bold text-slate-800">{formatZar(p.total_amount_cents)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold", s.cls)}>{s.label}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                          {isPending && (
                            <button
                              type="button"
                              disabled={rowBusy}
                              onClick={() => void handleApprove(p.id)}
                              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Approve
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={rowBusy}
                            onClick={() => void handleExportOne(p.id)}
                            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
                          >
                            Export
                          </button>
                          <Link
                            href={`/office/payouts?payout=${encodeURIComponent(p.id)}`}
                            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                          >
                            View
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center border-t border-slate-100 px-4 py-3">
          <p className="text-xs text-slate-400">
            {loading ? "Loading…" : `${filtered.length} of ${payouts.length} payout batches`}
            {!eligibleLoading && eligibleSummary.bookingCount > 0
              ? ` · ${eligibleSummary.bookingCount} eligible booking${eligibleSummary.bookingCount === 1 ? "" : "s"} unbatched`
              : ""}
          </p>
        </div>
      </div>
    </div>
  );
}
