"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Search,
  Download,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Calendar,
  ClipboardList,
  DollarSign,
  Clock,
  Zap,
  Layers,
  Wallet,
  Loader2,
  Building2,
  TrendingUp,
  Pencil,
  Save,
  X,
} from "lucide-react";
import {
  OfficeZohoMetricCard,
  OfficeZohoMetricsRow,
  OfficeZohoPageHeader,
  OfficeZohoPillTabs,
  OfficeZohoPrimaryButton,
  OfficeZohoSecondaryButton,
  OfficeZohoTableShell,
} from "@/components/admin/office/OfficeZohoChrome";
import { OfficePayoutDetailPanel } from "@/components/admin/office/OfficePayoutDetailPanel";
import { defaultOfficePayoutPeriodRange } from "@/lib/admin/payouts/officePayoutPeriodReport";
import { MONTHLY_PAYOUT_START_YMD } from "@/lib/payout/payoutPeriodConfig";
import { cleanerEarningsRulesSummaryText } from "@/lib/admin/cleanerTenureDisplay";
import type {
  OfficePayoutBatchRow,
  OfficePayoutCleanerRow,
  OfficePayoutPeriodReport,
} from "@/lib/admin/payouts/officePayoutPeriodReport";
import { cn } from "@/lib/utils";
import { useAdminData, adminFetch, getAdminToken } from "@/hooks/useAdminData";

type GenerateResponse = {
  skipped?: boolean;
  reason?: string;
  payoutsCreated?: number;
  bookingsLinked?: number;
  payoutsBackfilled?: number;
  weeksProcessed?: number;
  monthsProcessed?: number;
  periods?: Array<{ start: string; end: string; payoutsCreated: number; bookingsLinked: number }>;
  period?: { start: string; end: string };
};

type RecalculateEarningsResponse = {
  ok?: boolean;
  recomputed?: number;
  skipped?: number;
  failed?: number;
  resetBlocked?: number;
  attempted?: number;
  candidates?: number;
  dryRun?: boolean;
  skipReasons?: Record<string, number>;
  error?: string;
};

const STATUS_FILTERS = ["all", "pending", "frozen", "approved", "paid", "cancelled"] as const;

const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

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

function zarInputToCents(raw: string): number | null {
  const cleaned = raw.replace(/[R\s,]/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function centsToZarInput(cents: number): string {
  return String(Math.round(cents / 100));
}

function earningsSharePercent(partCents: number, totalCents: number): number {
  if (totalCents <= 0) return 0;
  return Math.round((partCents / totalCents) * 1000) / 10;
}

function formatPeriod(start: string, end: string): string {
  const s = new Date(start).toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
  const e = new Date(end).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
  return `${s} – ${e}`;
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

function buildPayoutsListCsv(rows: OfficePayoutBatchRow[]): string {
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

function buildCleanerSummaryCsv(rows: OfficePayoutCleanerRow[], from: string, to: string): string {
  const header = [
    "Cleaner",
    "Visits",
    "Earned (ZAR)",
    "Pending visits",
    "Pending (ZAR)",
    "Eligible visits",
    "Eligible (ZAR)",
    "Batched visits",
    "Batched (ZAR)",
    "Paid visits",
    "Paid (ZAR)",
  ];
  const lines = [`Period,${from},${to}`, header.join(",")];
  for (const c of rows) {
    lines.push(
      [
        csvEscape(c.cleaner_name),
        String(c.visit_count),
        String(Math.round(c.earned_cents / 100)),
        String(c.pending_visits),
        String(Math.round(c.pending_cents / 100)),
        String(c.eligible_visits),
        String(Math.round(c.eligible_cents / 100)),
        String(c.batched_open_visits),
        String(Math.round(c.batched_open_cents / 100)),
        String(c.paid_visits),
        String(Math.round(c.paid_cents / 100)),
      ].join(","),
    );
  }
  return lines.join("\n");
}

function LoadingRows({ colSpan }: { colSpan: number }) {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <tr key={i}>
          <td colSpan={colSpan} className="px-4 py-3">
            <div className="h-5 w-full animate-pulse rounded-lg bg-slate-100" />
          </td>
        </tr>
      ))}
    </>
  );
}

export default function PayoutsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedPayoutId = searchParams.get("payout")?.trim() || null;
  const earningsRules = cleanerEarningsRulesSummaryText();

  const defaultRange = defaultOfficePayoutPeriodRange();
  const [fromDate, setFromDate] = useState(defaultRange.from);
  const [toDate, setToDate] = useState(defaultRange.to);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [cleanerPage, setCleanerPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [edits, setEdits] = useState<Record<string, { zar: string; note: string }>>({});
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);

  const reportParams = useMemo(
    () => ({ from: fromDate, to: toDate }),
    [fromDate, toDate],
  );

  const { data, loading, error, refetch } = useAdminData<OfficePayoutPeriodReport>(
    "/api/admin/payouts/period-report",
    { params: reportParams },
  );

  useEffect(() => {
    if (!loading && data) setLastRefreshedAt(new Date());
  }, [loading, data]);

  const payouts = data?.payouts ?? [];
  const cleaners = data?.cleaners ?? [];
  const totals = data?.totals;
  const range = data?.range ?? { from: fromDate, to: toDate };

  useEffect(() => {
    const timer = globalThis.setTimeout(() => {
      setPage(1);
      setCleanerPage(1);
    }, 0);
    return () => globalThis.clearTimeout(timer);
  }, [search, statusFilter, pageSize, fromDate, toDate]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return payouts.filter((p) => {
      const matchSearch =
        !q ||
        (p.cleaner_name ?? "").toLowerCase().includes(q) ||
        (p.id ?? "").toLowerCase().includes(q);
      const matchStatus = statusFilter === "all" || (p.status ?? "").toLowerCase() === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [payouts, search, statusFilter]);

  const filteredCleaners = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cleaners;
    return cleaners.filter((c) => (c.cleaner_name ?? "").toLowerCase().includes(q));
  }, [cleaners, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageFrom = filtered.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const pageTo = Math.min(safePage * pageSize, filtered.length);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const cleanerTotalPages = Math.max(1, Math.ceil(filteredCleaners.length / pageSize));
  const safeCleanerPage = Math.min(cleanerPage, cleanerTotalPages);
  const cleanerPageFrom =
    filteredCleaners.length === 0 ? 0 : (safeCleanerPage - 1) * pageSize + 1;
  const cleanerPageTo = Math.min(safeCleanerPage * pageSize, filteredCleaners.length);
  const cleanerPageRows = filteredCleaners.slice((safeCleanerPage - 1) * pageSize, safeCleanerPage * pageSize);

  useEffect(() => {
    if (page > totalPages) {
      const timer = globalThis.setTimeout(() => setPage(Math.max(1, totalPages)), 0);
      return () => globalThis.clearTimeout(timer);
    }
  }, [page, totalPages]);

  useEffect(() => {
    if (cleanerPage > cleanerTotalPages) {
      const timer = globalThis.setTimeout(() => setCleanerPage(Math.max(1, cleanerTotalPages)), 0);
      return () => globalThis.clearTimeout(timer);
    }
  }, [cleanerPage, cleanerTotalPages]);

  const editableBatches = useMemo(
    () =>
      payouts.filter((p) => {
        const s = (p.status ?? "").toLowerCase();
        return s === "pending" || s === "frozen";
      }),
    [payouts],
  );
  const pendingBatchCount = payouts.filter((p) => (p.status ?? "").toLowerCase() === "pending").length;
  const frozenBatchCount = payouts.filter((p) => (p.status ?? "").toLowerCase() === "frozen").length;
  const editableBatchCount = editableBatches.length;
  const editablePayoutByCleanerId = useMemo(() => {
    const map = new Map<string, OfficePayoutBatchRow>();
    for (const p of editableBatches) {
      const existing = map.get(p.cleaner_id);
      if (!existing || p.period_end > existing.period_end) {
        map.set(p.cleaner_id, p);
      }
    }
    return map;
  }, [editableBatches]);
  const paidBatchCount = payouts.filter((p) => (p.status ?? "").toLowerCase() === "paid").length;
  const totalPendingBatchCents = payouts
    .filter((p) => (p.status ?? "").toLowerCase() === "pending")
    .reduce((s, p) => s + (p.total_amount_cents ?? 0), 0);

  const statusPillTabs = useMemo(
    () =>
      STATUS_FILTERS.map((s) => ({
        key: s,
        label: s === "all" ? "All" : (STATUS_MAP[s]?.label ?? s),
        count:
          s === "all"
            ? payouts.length
            : payouts.filter((p) => (p.status ?? "").toLowerCase() === s).length,
      })),
    [payouts],
  );

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  async function refreshAll() {
    await refetch();
  }

  function resetToThisMonth() {
    const d = defaultOfficePayoutPeriodRange();
    setFromDate(d.from);
    setToDate(d.to);
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
    const months = body?.monthsProcessed ?? body?.weeksProcessed ?? 0;
    showToast(
      created > 0
        ? `Created ${created} payout batch${created === 1 ? "" : "es"} (${linked} booking${linked === 1 ? "" : "s"} linked${months > 1 ? ` across ${months} months` : ""}).`
        : months > 0
          ? "Generation finished — no new payout batches were needed for the eligible months."
          : "Generation finished — no unbatched earnings found.",
      created > 0,
    );
    await refreshAll();
  }

  async function handleRecalculateEarnings() {
    const confirmed = globalThis.confirm(
      `Recalculate cleaner earnings for ${formatRangeLabel(fromDate, toDate)} using current tenure rules (${earningsRules.juniorRateLabel}/${earningsRules.experiencedRateLabel}, R${earningsRules.minZar}–R${earningsRules.maxZar})?\n\nJobs in locked or paid payout batches are skipped.`,
    );
    if (!confirmed) return;

    setActionLoading("recalculate");
    const res = await adminFetch<RecalculateEarningsResponse>("/api/admin/payouts/recalculate-earnings", {
      method: "POST",
      body: JSON.stringify({ from: fromDate, to: toDate }),
    });
    setActionLoading(null);

    if (!res.ok) {
      showToast(res.error ?? "Failed to recalculate earnings", false);
      return;
    }

    const body = res.data;
    const recomputed = body?.recomputed ?? 0;
    const skipped = body?.skipped ?? 0;
    const failed = body?.failed ?? 0;
    const blocked = body?.resetBlocked ?? 0;

    if (failed > 0) {
      showToast(`Recalculated ${recomputed} job(s); ${failed} failed, ${skipped} skipped.`, false);
    } else if (recomputed === 0) {
      showToast(
        blocked > 0
          ? `No jobs updated — ${blocked} locked by payout batch, ${skipped} skipped.`
          : `No jobs needed recalculation (${skipped} skipped).`,
        true,
      );
    } else {
      showToast(`Recalculated ${recomputed} job(s)${skipped > 0 ? `; ${skipped} skipped` : ""}.`, true);
    }
    await refreshAll();
  }

  function handleExportBatches() {
    if (filtered.length === 0) {
      showToast("Nothing to export — adjust filters or generate payout batches first.", false);
      return;
    }
    downloadCsv(`cleaner-payout-batches-${range.from}-to-${range.to}.csv`, buildPayoutsListCsv(filtered));
    showToast(`Exported ${filtered.length} payout batch${filtered.length === 1 ? "" : "es"}.`, true);
  }

  function handleExportCleaners() {
    if (filteredCleaners.length === 0) {
      showToast("No cleaner rows in this period.", false);
      return;
    }
    downloadCsv(
      `cleaner-payout-summary-${range.from}-to-${range.to}.csv`,
      buildCleanerSummaryCsv(filteredCleaners, range.from, range.to),
    );
    showToast(`Exported ${filteredCleaners.length} cleaner${filteredCleaners.length === 1 ? "" : "s"}.`, true);
  }

  function startEditMode() {
    const initial: Record<string, { zar: string; note: string }> = {};
    for (const p of editableBatches) {
      initial[p.id] = {
        zar: centsToZarInput(p.total_amount_cents ?? 0),
        note: p.adjustment_note ?? "",
      };
    }
    setEdits(initial);
    setEditMode(true);
  }

  function cancelEditMode() {
    setEditMode(false);
    setEdits({});
  }

  async function handleSaveAllEdits() {
    const changed = editableBatches.filter((p) => {
      const edit = edits[p.id];
      if (!edit) return false;
      const cents = zarInputToCents(edit.zar);
      return cents != null && cents !== (p.total_amount_cents ?? 0);
    });

    if (changed.length === 0) {
      showToast("No payout amounts were changed.", false);
      return;
    }

    setActionLoading("save-edits");
    let saved = 0;
    let failed = 0;
    for (const p of changed) {
      const edit = edits[p.id];
      const cents = zarInputToCents(edit?.zar ?? "");
      if (cents == null) {
        failed += 1;
        continue;
      }
      const res = await adminFetch(`/api/admin/payouts/${encodeURIComponent(p.id)}/amount`, {
        method: "PATCH",
        body: JSON.stringify({
          total_amount_cents: cents,
          adjustment_note: edit?.note?.trim() || null,
        }),
      });
      if (res.ok) saved += 1;
      else failed += 1;
    }
    setActionLoading(null);
    if (failed > 0) {
      showToast(`Saved ${saved} payout${saved === 1 ? "" : "s"}; ${failed} failed.`, false);
    } else {
      showToast(`Updated ${saved} payout amount${saved === 1 ? "" : "s"}.`, true);
      setEditMode(false);
      setEdits({});
    }
    await refreshAll();
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

  const showEligibleBanner =
    !loading && (totals?.eligible_visits ?? 0) > 0;

  function closePayoutDetail() {
    router.push("/office/payouts");
  }

  return (
    <div className="min-w-0 max-w-full space-y-5 overflow-x-hidden">
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

      <OfficeZohoPageHeader
        title="Cleaner Payouts"
        subtitle={`Visit earnings and monthly payout batches (Johannesburg calendar, from ${new Date(`${MONTHLY_PAYOUT_START_YMD}T12:00:00`).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}).`}
        live
        actions={
          <>
            <OfficeZohoSecondaryButton
              disabled={actionLoading === "recalculate"}
              onClick={() => void handleRecalculateEarnings()}
            >
              {actionLoading === "recalculate" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {actionLoading === "recalculate" ? "Recalculating…" : "Recalculate earnings"}
            </OfficeZohoSecondaryButton>
            <OfficeZohoPrimaryButton
              disabled={actionLoading === "generate"}
              onClick={() => void handleGenerate()}
            >
              {actionLoading === "generate" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {actionLoading === "generate" ? "Generating…" : "Generate monthly payouts"}
            </OfficeZohoPrimaryButton>
            <OfficeZohoSecondaryButton disabled={filteredCleaners.length === 0} onClick={handleExportCleaners}>
              <Download className="h-4 w-4" /> Summary CSV
            </OfficeZohoSecondaryButton>
            <OfficeZohoSecondaryButton disabled={filtered.length === 0} onClick={handleExportBatches}>
              <Download className="h-4 w-4" /> Batches CSV
            </OfficeZohoSecondaryButton>
            <Link
              href="/office/payouts/phase15a-diagnostics"
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Full hub
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
            <OfficeZohoSecondaryButton onClick={() => void refreshAll()} disabled={loading}>
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              Refresh
            </OfficeZohoSecondaryButton>
          </>
        }
      />

      <details className="rounded-lg border border-violet-200 bg-violet-50/60 px-4 py-3 text-sm text-violet-950">
        <summary className="cursor-pointer font-semibold">
          Standard cleaner earnings rules (R{earningsRules.minZar}–R{earningsRules.maxZar})
        </summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-violet-900/90">
          <li>
            <strong>Junior</strong> (&lt;{earningsRules.tenureMonthsThreshold} months with company):{" "}
            {earningsRules.juniorRateLabel} of eligible visit total, clamped R{earningsRules.minZar}–R{earningsRules.maxZar}{" "}
            per job.
          </li>
          <li>
            <strong>Experienced</strong> (≥{earningsRules.tenureMonthsThreshold} months): {earningsRules.experiencedRateLabel},
            same clamp.
          </li>
          <li>Tenure uses each cleaner&apos;s company join date vs the booking appointment date.</li>
          <li>
            Manage join dates on{" "}
            <Link href="/office/cleaners" className="font-semibold underline">
              Office → Cleaners
            </Link>
            . Recalculate a stored booking via Reset earnings on the booking.
          </li>
          <li>Deep / move / carpet: fixed R250 (R270 team lead) — tenure does not apply.</li>
        </ul>
      </details>

      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
          <p className="text-sm text-red-700">{error}</p>
          <button type="button" onClick={() => void refreshAll()} className="ml-auto text-xs font-semibold text-red-600 hover:underline">
            Retry
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Calendar className="h-4 w-4 text-slate-400" />
          Period
        </span>
        <input
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
          aria-label="From date"
        />
        <span className="text-xs text-slate-400">to</span>
        <input
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
          aria-label="To date"
        />
        <OfficeZohoSecondaryButton onClick={resetToThisMonth} className="px-3 py-2 text-xs">
          This month
        </OfficeZohoSecondaryButton>
        <p className="text-xs text-slate-500 sm:ml-auto">
          {loading ? "Loading…" : `Showing ${formatRangeLabel(range.from, range.to)}`}
        </p>
      </div>

      {showEligibleBanner && (
        <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-amber-950">Eligible earnings in this period</p>
            <p className="mt-1 text-sm text-amber-900/90">
              {totals?.eligible_visits ?? 0} visit{(totals?.eligible_visits ?? 0) === 1 ? "" : "s"} (
              {formatZar(totals?.eligible_cents ?? 0)}) are paid-invoice ready but not yet in a monthly batch.
            </p>
          </div>
          <OfficeZohoPrimaryButton
            disabled={actionLoading === "generate"}
            onClick={() => void handleGenerate()}
            className="shrink-0 bg-amber-700 hover:brightness-95"
          >
            Generate now
          </OfficeZohoPrimaryButton>
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

      <OfficeZohoMetricsRow
        meta={
          <>
            <p>
              Report last refreshed
              {lastRefreshedAt
                ? ` on ${lastRefreshedAt.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}`
                : ""}
            </p>
            <button
              type="button"
              onClick={() => void refreshAll()}
              className="mt-1 font-semibold text-[--sidebar-active] hover:underline"
            >
              Refresh report
            </button>
          </>
        }
      >
        <OfficeZohoMetricCard icon={ClipboardList} label="Visits" value={loading ? "—" : String(totals?.visit_count ?? 0)} />
        <OfficeZohoMetricCard icon={DollarSign} label="Earned" value={loading ? "—" : formatZar(totals?.earned_cents ?? 0)} />
        <OfficeZohoMetricCard
          icon={Clock}
          iconClassName="bg-amber-50 text-amber-600"
          label="Pending invoice"
          value={
            loading ? (
              "—"
            ) : (
              <>
                {formatZar(totals?.pending_cents ?? 0)}
                <span className="block text-xs font-medium text-slate-500">{totals?.pending_visits ?? 0} visits</span>
              </>
            )
          }
        />
        <OfficeZohoMetricCard
          icon={Zap}
          iconClassName="bg-violet-50 text-violet-600"
          label="Eligible"
          value={
            loading ? (
              "—"
            ) : (
              <>
                {formatZar(totals?.eligible_cents ?? 0)}
                <span className="block text-xs font-medium text-slate-500">{totals?.eligible_visits ?? 0} visits</span>
              </>
            )
          }
        />
        <OfficeZohoMetricCard
          icon={Layers}
          iconClassName="bg-blue-50 text-blue-600"
          label="Batched (open)"
          value={
            loading ? (
              "—"
            ) : (
              <>
                {formatZar(totals?.batched_open_cents ?? 0)}
                <span className="block text-xs font-medium text-slate-500">{totals?.batched_open_visits ?? 0} visits</span>
              </>
            )
          }
        />
        <OfficeZohoMetricCard
          icon={Wallet}
          iconClassName="bg-emerald-50 text-emerald-600"
          label="Paid out"
          value={
            loading ? (
              "—"
            ) : (
              <>
                {formatZar(totals?.paid_cents ?? 0)}
                <span className="block text-xs font-medium text-slate-500">{totals?.paid_visits ?? 0} visits</span>
              </>
            )
          }
        />
      </OfficeZohoMetricsRow>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-slate-800">Earnings split</h2>
          <p className="text-xs text-slate-500">
            {loading ? "Loading…" : `${totals?.visit_count ?? 0} completed visit${(totals?.visit_count ?? 0) === 1 ? "" : "s"} in period`}
          </p>
        </div>
        <div className="p-5">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Total earnings</p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">
                {loading ? "—" : formatZar(totals?.total_revenue_cents ?? 0)}
              </p>
              <p className="mt-1 text-xs text-slate-500">Customer revenue on completed visits</p>
            </div>
            <div className="rounded-lg bg-emerald-50 px-4 py-3 text-right">
              <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">Company earnings</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-800">
                {loading ? "—" : formatZar(totals?.company_earnings_cents ?? 0)}
              </p>
              {!loading && totals?.margin_percent != null ? (
                <p className="mt-0.5 text-xs text-emerald-700">{totals.margin_percent}% margin</p>
              ) : null}
            </div>
          </div>

          {!loading && (totals?.total_revenue_cents ?? 0) > 0 ? (
            <>
              {(() => {
                const revenue = totals?.total_revenue_cents ?? 0;
                const company = totals?.company_earnings_cents ?? 0;
                const cleaner = totals?.earned_cents ?? 0;
                const companyWidth = Math.min(100, earningsSharePercent(company, revenue));
                const cleanerWidth = Math.min(100 - companyWidth, earningsSharePercent(cleaner, revenue));
                return (
                  <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
                    {company > 0 ? (
                      <div
                        className="h-full bg-emerald-500"
                        style={{ width: `${companyWidth}%` }}
                        title={`Company: ${formatZar(company)}`}
                      />
                    ) : null}
                    {cleaner > 0 ? (
                      <div
                        className="h-full bg-blue-500"
                        style={{ width: `${cleanerWidth}%` }}
                        title={`Cleaner payouts: ${formatZar(cleaner)}`}
                      />
                    ) : null}
                  </div>
                );
              })()}
              <div className="mt-4 space-y-2.5">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <div className="flex min-w-0 items-center gap-2">
                    <Building2 className="h-4 w-4 shrink-0 text-emerald-600" />
                    <span className="text-slate-600">Company earnings</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 tabular-nums">
                    <span className="font-semibold text-slate-900">{formatZar(totals?.company_earnings_cents ?? 0)}</span>
                    <span className="w-10 text-right text-xs text-slate-400">
                      {earningsSharePercent(totals?.company_earnings_cents ?? 0, totals?.total_revenue_cents ?? 0)}%
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <div className="flex min-w-0 items-center gap-2">
                    <TrendingUp className="h-4 w-4 shrink-0 text-blue-600" />
                    <span className="text-slate-600">Cleaner payouts</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 tabular-nums">
                    <span className="font-semibold text-slate-900">{formatZar(totals?.earned_cents ?? 0)}</span>
                    <span className="w-10 text-right text-xs text-slate-400">
                      {earningsSharePercent(totals?.earned_cents ?? 0, totals?.total_revenue_cents ?? 0)}%
                    </span>
                  </div>
                </div>
              </div>
            </>
          ) : !loading ? (
            <p className="text-sm text-slate-400">No revenue recorded for completed visits in this period.</p>
          ) : null}
        </div>
      </section>

      <OfficeZohoTableShell>
        <div className="border-b border-slate-200 bg-slate-50/40 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">By cleaner</h2>
              <p className="text-xs text-slate-500">Completed visits by booking date — includes roster partners on paired jobs</p>
            </div>
            <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search cleaners…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-md border border-slate-200 bg-white py-2 pl-9 pr-4 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                {["Cleaner", "Visits", "Earned", "Pending", "Eligible", "Batched", "Paid", "Actions"].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <LoadingRows colSpan={8} />
              ) : cleanerPageRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-sm text-slate-400">
                    No completed visits in this period.
                  </td>
                </tr>
              ) : (
                cleanerPageRows.map((c) => {
                  const editablePayout = editablePayoutByCleanerId.get(c.cleaner_id);
                  return (
                  <tr key={c.cleaner_id} className="transition-colors hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-semibold text-slate-800">
                      <Link
                        href={`/office/cleaners/${encodeURIComponent(c.cleaner_id)}`}
                        className="hover:text-blue-700 hover:underline"
                      >
                        {c.cleaner_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">{c.visit_count}</td>
                    <td className="px-4 py-3 font-semibold tabular-nums text-slate-800">{formatZar(c.earned_cents)}</td>
                    <td className="px-4 py-3 tabular-nums text-amber-800">
                      {c.pending_visits > 0 ? `${c.pending_visits} · ${formatZar(c.pending_cents)}` : "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-violet-800">
                      {c.eligible_visits > 0 ? `${c.eligible_visits} · ${formatZar(c.eligible_cents)}` : "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-blue-800">
                      {c.batched_open_visits > 0 ? `${c.batched_open_visits} · ${formatZar(c.batched_open_cents)}` : "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-emerald-800">
                      {c.paid_visits > 0 ? `${c.paid_visits} · ${formatZar(c.paid_cents)}` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {editablePayout ? (
                        <Link
                          href={`/office/payouts?payout=${encodeURIComponent(editablePayout.id)}`}
                          className="inline-flex items-center gap-1 rounded-md border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100"
                        >
                          <Pencil className="h-3 w-3" />
                          Edit payout
                        </Link>
                      ) : c.eligible_visits > 0 ? (
                        <span className="text-xs text-slate-400">Generate batch first</span>
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
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
          <p className="text-xs text-slate-500">
            {loading
              ? "Loading…"
              : filteredCleaners.length === 0
                ? "No cleaners"
                : `Showing ${cleanerPageFrom}–${cleanerPageTo} of ${filteredCleaners.length} cleaner${filteredCleaners.length === 1 ? "" : "s"}`}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">
              Page {safeCleanerPage} of {cleanerTotalPages}
            </span>
            <OfficeZohoSecondaryButton
              disabled={loading || safeCleanerPage <= 1}
              onClick={() => setCleanerPage((p) => Math.max(1, p - 1))}
              className="px-2.5 py-1.5 text-xs"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Prev
            </OfficeZohoSecondaryButton>
            <OfficeZohoSecondaryButton
              disabled={loading || safeCleanerPage >= cleanerTotalPages}
              onClick={() => setCleanerPage((p) => Math.min(cleanerTotalPages, p + 1))}
              className="px-2.5 py-1.5 text-xs"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </OfficeZohoSecondaryButton>
          </div>
        </div>
      </OfficeZohoTableShell>

      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Monthly payout batches</h2>
            <p className="text-xs text-slate-500">
              Batches whose month overlaps the period (
              {loading ? "…" : `${pendingBatchCount} pending · ${frozenBatchCount} frozen · ${paidBatchCount} paid · ${formatZar(totalPendingBatchCents)} pending amount`}
            </p>
          </div>
          {editableBatchCount > 0 ? (
            <div className="flex flex-wrap gap-2">
              {editMode ? (
                <>
                  <OfficeZohoPrimaryButton
                    disabled={actionLoading === "save-edits"}
                    onClick={() => void handleSaveAllEdits()}
                  >
                    {actionLoading === "save-edits" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    Save all changes
                  </OfficeZohoPrimaryButton>
                  <OfficeZohoSecondaryButton disabled={actionLoading === "save-edits"} onClick={cancelEditMode}>
                    <X className="h-4 w-4" />
                    Cancel
                  </OfficeZohoSecondaryButton>
                </>
              ) : (
                <OfficeZohoSecondaryButton onClick={startEditMode}>
                  <Pencil className="h-4 w-4" />
                  Edit payouts
                </OfficeZohoSecondaryButton>
              )}
            </div>
          ) : null}
        </div>

        <OfficeZohoPillTabs tabs={statusPillTabs} activeKey={statusFilter} onChange={setStatusFilter} />

        {editableBatchCount > 0 && !editMode ? (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950">
            <p className="font-semibold">How to edit payouts</p>
            <p className="mt-1 text-xs leading-relaxed">
              Click <strong>View &amp; edit</strong> on a cleaner row to change each visit amount (e.g. all 5 visits
              to R300), or use <strong>Edit payouts</strong> above for a lump-sum override on the batch total.
            </p>
          </div>
        ) : null}

        <OfficeZohoTableShell>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
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
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <LoadingRows colSpan={6} />
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-sm text-slate-400">
                      {(totals?.eligible_visits ?? 0) > 0
                        ? "No monthly batches overlap this period — eligible visits may still need Generate monthly payouts."
                        : "No payout batches overlap this period."}
                    </td>
                  </tr>
                ) : (
                  pageRows.map((p) => {
                    const statusKey = (p.status ?? "pending").toLowerCase();
                    const s = STATUS_MAP[statusKey] ?? { label: p.status ?? "—", cls: "bg-slate-100 text-slate-600" };
                    const isPending = statusKey === "pending";
                    const isFrozen = statusKey === "frozen";
                    const isEditable = isPending || isFrozen;
                    const rowBusy = actionLoading === p.id || actionLoading === `export:${p.id}`;

                    return (
                      <tr
                        key={p.id}
                        className={cn(
                          "group transition-colors hover:bg-slate-50/80",
                          selectedPayoutId === p.id && "bg-blue-50/40",
                        )}
                      >
                        <td className="px-4 py-3">
                          <p className="text-sm font-semibold text-slate-800">{p.cleaner_name}</p>
                          <p className="font-mono text-xs text-slate-400">{p.id.slice(0, 8).toUpperCase()}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">{formatPeriod(p.period_start, p.period_end)}</td>
                        <td className="px-4 py-3 text-sm text-slate-700">{p.booking_count}</td>
                        <td className="px-4 py-3">
                          {editMode && isEditable ? (
                            <div className="space-y-1">
                              <input
                                type="number"
                                min={0}
                                step={1}
                                value={edits[p.id]?.zar ?? centsToZarInput(p.total_amount_cents ?? 0)}
                                onChange={(e) =>
                                  setEdits((prev) => ({
                                    ...prev,
                                    [p.id]: { zar: e.target.value, note: prev[p.id]?.note ?? "" },
                                  }))
                                }
                                className="w-28 rounded-md border border-blue-200 bg-white px-2 py-1 text-sm font-bold tabular-nums text-slate-800"
                                aria-label={`Edit payout for ${p.cleaner_name}`}
                              />
                              {(p.calculated_amount_cents ?? p.total_amount_cents) !==
                              zarInputToCents(edits[p.id]?.zar ?? "") ? (
                                <input
                                  type="text"
                                  placeholder="Adjustment note"
                                  value={edits[p.id]?.note ?? ""}
                                  onChange={(e) =>
                                    setEdits((prev) => ({
                                      ...prev,
                                      [p.id]: { zar: prev[p.id]?.zar ?? centsToZarInput(p.total_amount_cents ?? 0), note: e.target.value },
                                    }))
                                  }
                                  className="w-full min-w-[140px] rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600"
                                />
                              ) : null}
                              {p.calculated_amount_cents != null &&
                              p.calculated_amount_cents !== p.total_amount_cents ? (
                                <p className="text-[10px] text-slate-400">
                                  Calculated: {formatZar(p.calculated_amount_cents)}
                                </p>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-sm font-bold tabular-nums text-slate-800">
                              {formatZar(p.total_amount_cents)}
                              {p.amount_adjusted_at ? (
                                <span className="ml-1 text-[10px] font-medium text-violet-600">(adjusted)</span>
                              ) : null}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold", s.cls)}>{s.label}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {isEditable && !editMode && (
                              <button
                                type="button"
                                disabled={rowBusy}
                                onClick={() => void handleApprove(p.id)}
                                className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Approve
                              </button>
                            )}
                            <OfficeZohoSecondaryButton
                              disabled={rowBusy}
                              onClick={() => void handleExportOne(p.id)}
                              className="px-3 py-1.5 text-xs"
                            >
                              Export
                            </OfficeZohoSecondaryButton>
                            <Link
                              href={`/office/payouts?payout=${encodeURIComponent(p.id)}`}
                              className={cn(
                                "inline-flex items-center rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors",
                                isEditable
                                  ? "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100"
                                  : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50",
                              )}
                            >
                              {isEditable ? "View & edit" : "View"}
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

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500">
              {loading
                ? "Loading…"
                : filtered.length === 0
                  ? "No batches in period"
                  : `Showing ${pageFrom}–${pageTo} of ${filtered.length} batch${filtered.length === 1 ? "" : "es"}`}
            </p>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-xs text-slate-500">
                Rows
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
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
              <OfficeZohoSecondaryButton
                disabled={loading || safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-2.5 py-1.5 text-xs"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Prev
              </OfficeZohoSecondaryButton>
              <OfficeZohoSecondaryButton
                disabled={loading || safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-2.5 py-1.5 text-xs"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </OfficeZohoSecondaryButton>
            </div>
          </div>
        </OfficeZohoTableShell>
      </div>
    </div>
  );
}
