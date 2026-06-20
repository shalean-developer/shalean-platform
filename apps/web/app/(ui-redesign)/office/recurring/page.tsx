"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Search,
  Repeat,
  Pause,
  PlayCircle,
  ChevronLeft,
  ChevronRight,
  Calendar,
  DollarSign,
  RefreshCw,
  AlertCircle,
  Loader2,
  Plus,
  XCircle,
  ExternalLink,
  RotateCcw,
  MoreHorizontal,
  AlertTriangle,
  Pencil,
  Trash2,
  HelpCircle,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminData, adminFetch, getAdminToken } from "@/hooks/useAdminData";
import { CreateRecurringPlanDialog } from "@/components/admin/CreateRecurringPlanDialog";
import { EditRecurringPlanDialog, type EditRecurringPlanTarget } from "@/components/admin/EditRecurringPlanDialog";
import {
  OfficeRecurringPlanConfirmDialog,
  type RecurringPlanConfirmVariant,
} from "@/components/admin/office/OfficeRecurringPlanConfirmDialog";
import { formatIsoInJohannesburgYmd } from "@/lib/booking/dateInJohannesburg";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCurrency } from "@/lib/admin/invoices/invoiceAdminFormatters";
import { estimateMonthlyRevenue } from "@/lib/recurring/estimateMonthlyRevenue";
import type { RecurringPageSummary } from "@/lib/recurring/loadRecurringPageSummary";

type PlanStatus = "active" | "paused" | "cancelled";

const STATUS_MAP: Record<PlanStatus, { label: string; cls: string }> = {
  active: { label: "Active", cls: "bg-emerald-100 text-emerald-700" },
  paused: { label: "Paused", cls: "bg-orange-100 text-orange-700" },
  cancelled: { label: "Cancelled", cls: "bg-slate-100 text-slate-600" },
};

const FREQ_LABELS: Record<string, string> = {
  weekly: "Weekly",
  fortnightly: "Fortnightly",
  biweekly: "Fortnightly",
  monthly: "Monthly",
  custom: "Custom",
};

const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

type RecurringPlan = {
  id: string;
  customer_id: string;
  address_id: string | null;
  frequency: string;
  days_of_week: number[];
  start_date: string | null;
  end_date: string | null;
  price: number;
  status: string;
  next_run_date: string;
  last_generated_at: string | null;
  skip_next_occurrence_date: string | null;
  monthly_pattern: string;
  monthly_nth: number | null;
  created_at: string | null;
  updated_at: string | null;
  customer_email: string | null;
  customer_name: string | null;
  service_label: string | null;
  template_visit_date: string | null;
  template_visit_time: string | null;
  template_location: string | null;
  preferred_cleaner_id: string | null;
};

const PAGE_SIZE = 25;

type CronHealthJob = {
  job_name: string;
  last_success_at: string | null;
  last_run_at: string | null;
  errors_last_24h: number;
};

function RecurringStatCard({
  label,
  value,
  icon: Icon,
  cls,
  tooltip,
  hint,
  href,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  cls: string;
  tooltip?: string;
  hint?: string;
  href?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className={cn("mb-2 flex h-9 w-9 items-center justify-center rounded-xl", cls)}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-xl font-bold tabular-nums text-slate-900">{value}</p>
      <div className="mt-0.5 flex items-center gap-1">
        <p className="text-xs text-slate-500">{label}</p>
        {tooltip ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="rounded-full text-slate-400 transition hover:text-slate-600"
                aria-label={`About ${label}`}
              >
                <HelpCircle className="h-3 w-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-left">
              {tooltip}
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      {hint ? <p className="mt-1 text-[11px] text-slate-400">{hint}</p> : null}
      {href ? (
        <Link href={href} className="mt-1 inline-block text-[11px] font-semibold text-blue-600 hover:underline">
          View invoices
        </Link>
      ) : null}
    </div>
  );
}

function generatorCronWarning(jobs: CronHealthJob[] | undefined): {
  show: boolean;
  message: string;
  severity: "amber" | "red";
} | null {
  const gen = jobs?.find((j) => j.job_name === "generate-recurring-bookings");
  if (!gen) {
    return {
      show: true,
      severity: "red",
      message: "Recurring generator cron has no recorded runs. Visit rows will not spawn until pg_cron is fixed.",
    };
  }
  const lastSuccess = gen.last_success_at ? new Date(gen.last_success_at).getTime() : null;
  const staleMs = 30 * 60 * 1000;
  if (!lastSuccess || Date.now() - lastSuccess > staleMs) {
    return {
      show: true,
      severity: "red",
      message: `Recurring generator last succeeded ${formatCronTs(gen.last_success_at)}. Expected every ~10 minutes — check Supabase pg_cron and CRON_SECRET.`,
    };
  }
  if (gen.errors_last_24h > 0) {
    return {
      show: true,
      severity: "amber",
      message: `Generator cron reported ${gen.errors_last_24h} error(s) in the last 24h. Last success ${formatCronTs(gen.last_success_at)}.`,
    };
  }
  return null;
}

function formatDays(days: number[]): string {
  const uniq = [...new Set(days.filter((d) => d >= 1 && d <= 7))].sort((a, b) => a - b);
  if (uniq.length === 0) return "—";
  return uniq.map((d) => WEEKDAY_SHORT[d - 1]).join(", ");
}

function displayCustomer(plan: RecurringPlan): { primary: string; secondary: string | null } {
  const name = plan.customer_name?.trim();
  const email = plan.customer_email?.trim();
  if (name && email) return { primary: name, secondary: email };
  if (name) return { primary: name, secondary: null };
  if (email) return { primary: email, secondary: null };
  return { primary: `${plan.customer_id.slice(0, 8)}…`, secondary: null };
}

function formatCronTs(iso: string | null): string {
  if (!iso?.trim()) return "never";
  try {
    return new Date(iso).toLocaleString("en-ZA", {
      timeZone: "Africa/Johannesburg",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso.slice(0, 16);
  }
}

function previewText(plan: RecurringPlan): string {
  const parts = [
    plan.template_visit_date && plan.template_visit_time
      ? `${plan.template_visit_date} ${plan.template_visit_time}`
      : plan.template_visit_date,
    plan.template_location,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

function RecurringPlanActionsMenu({
  planId,
  busy,
  canPause,
  canResume,
  canCancel,
  onEdit,
  onDelete,
  onBackfill,
  onReconcile,
  onPause,
  onResume,
  onCancel,
}: {
  planId: string;
  busy: boolean;
  canPause: boolean;
  canResume: boolean;
  canCancel: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onBackfill: () => void;
  onReconcile: () => void;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
}) {
  if (busy) {
    return <Loader2 className="h-4 w-4 animate-spin text-slate-400" aria-label="Loading" />;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
          aria-label="Plan actions"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={onEdit} className="gap-2">
          <Pencil className="h-4 w-4 text-slate-500" />
          Edit plan
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {canPause && (
          <>
            <DropdownMenuItem onClick={onReconcile} className="gap-2">
              <Calendar className="h-4 w-4 text-violet-600" />
              Reconcile schedule
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onBackfill} className="gap-2">
              <RotateCcw className="h-4 w-4 text-slate-500" />
              Backfill visits
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onPause} className="gap-2 text-orange-700 focus:text-orange-700">
              <Pause className="h-4 w-4" />
              Pause plan
            </DropdownMenuItem>
          </>
        )}
        {canResume && (
          <>
            <DropdownMenuItem onClick={onReconcile} className="gap-2">
              <Calendar className="h-4 w-4 text-violet-600" />
              Reconcile schedule
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onResume} className="gap-2 text-emerald-700 focus:text-emerald-700">
              <PlayCircle className="h-4 w-4" />
              Resume plan
            </DropdownMenuItem>
          </>
        )}
        {canCancel && (
          <DropdownMenuItem onClick={onCancel} className="gap-2 text-red-600 focus:text-red-600">
            <XCircle className="h-4 w-4" />
            Cancel plan
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onDelete} className="gap-2 text-red-600 focus:text-red-600">
          <Trash2 className="h-4 w-4" />
          Delete plan
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link
            href={`/office/bookings?recurring_id=${encodeURIComponent(planId)}`}
            className="flex items-center gap-2"
          >
            <ExternalLink className="h-4 w-4 text-blue-600" />
            View bookings
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function RecurringPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | PlanStatus>("all");
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EditRecurringPlanTarget | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    variant: RecurringPlanConfirmVariant;
    planId: string;
  } | null>(null);

  useEffect(() => {
    const timer = globalThis.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => globalThis.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const timer = globalThis.setTimeout(() => setPage(1), 0);
    return () => globalThis.clearTimeout(timer);
  }, [debouncedSearch, statusFilter]);

  const { data, loading, error, refetch } = useAdminData<{ recurring: RecurringPlan[]; summary?: RecurringPageSummary }>(
    "/api/admin/recurring",
  );
  const { data: cronHealth, refetch: refetchCronHealth } = useAdminData<{ jobs?: CronHealthJob[] }>(
    "/api/admin/cron-health",
  );
  const cronWarning = generatorCronWarning(cronHealth?.jobs);
  const plans = data?.recurring ?? [];

  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    return plans
      .filter((p) => {
        const matchSearch =
          !q ||
          (p.customer_name ?? "").toLowerCase().includes(q) ||
          (p.customer_email ?? "").toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q) ||
          (p.template_location ?? "").toLowerCase().includes(q);
        const st = p.status.toLowerCase() as PlanStatus;
        const matchStatus = statusFilter === "all" || st === statusFilter;
        return matchSearch && matchStatus;
      })
      .sort((a, b) => (b.next_run_date ?? "").localeCompare(a.next_run_date ?? ""));
  }, [plans, debouncedSearch, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const activeCount = plans.filter((p) => p.status.toLowerCase() === "active").length;
  const pausedCount = plans.filter((p) => p.status.toLowerCase() === "paused").length;
  const cancelledCount = plans.filter((p) => p.status.toLowerCase() === "cancelled").length;
  const summary = data?.summary;
  const monthlyRevenue = summary?.estimated_monthly_revenue_zar ?? plans.reduce((s, p) => s + estimateMonthlyRevenue(p), 0);
  const draftMonthLabel = summary?.month_label ?? "This month";
  const draftTotalCents = summary?.current_month_draft_total_cents ?? 0;
  const draftInvoiceCount = summary?.current_month_draft_invoice_count ?? 0;
  const confirmPlan = confirmDialog ? (plans.find((p) => p.id === confirmDialog.planId) ?? null) : null;

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    globalThis.setTimeout(() => setToast(null), 3500);
  }

  async function handleAction(id: string, action: "pause" | "resume" | "cancel") {
    setActionLoading(id);
    const res = await adminFetch(`/api/admin/recurring/${id}/${action}`, { method: "POST" });
    setActionLoading(null);
    if (res.ok) {
      showToast(action === "cancel" ? "Plan cancelled" : action === "pause" ? "Plan paused" : "Plan resumed", true);
      void refetch();
    } else {
      showToast(res.error ?? `Failed to ${action}`, false);
    }
  }

  async function handleReconcile(id: string) {
    setActionLoading(id);
    try {
      const token = await getAdminToken();
      if (!token) {
        showToast("Not authenticated", false);
        return;
      }
      const res = await globalThis.fetch(
        `/api/admin/recurring/${encodeURIComponent(id)}/reconcile-schedule`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const json = (await res.json()) as {
        error?: string;
        propagation?: {
          bookings_cancelled?: number;
          bookings_created?: number;
          bookings_updated?: number;
          bookings_cancel_skipped?: number;
          bookings_cancel_skipped_locked_invoice?: number;
          bookings_cancel_skipped_locked_payout?: number;
          invoices_recomputed?: number;
          earnings_recomputed?: number;
          errors?: string[];
        };
      };
      if (!res.ok) {
        showToast(json.error ?? "Reconcile failed", false);
        return;
      }
      const p = json.propagation;
      const parts: string[] = [];
      if (p?.bookings_cancelled) parts.push(`${p.bookings_cancelled} removed`);
      if (p?.bookings_created) parts.push(`${p.bookings_created} added`);
      if (p?.bookings_updated) parts.push(`${p.bookings_updated} repriced`);
      if (p?.invoices_recomputed) parts.push(`${p.invoices_recomputed} invoice(s) updated`);
      showToast(
        parts.length > 0 ? `Reconciled: ${parts.join(", ")}` : "Schedule already aligned",
        true,
      );
      if (p?.bookings_cancel_skipped_locked_invoice) {
        showToast(
          `${p.bookings_cancel_skipped_locked_invoice} visit(s) on sent/paid invoices were not removed`,
          false,
        );
      }
      if (p?.bookings_cancel_skipped_locked_payout) {
        showToast(
          `${p.bookings_cancel_skipped_locked_payout} visit(s) could not be removed (cleaner payout already locked)`,
          false,
        );
      }
      if (
        p?.bookings_cancel_skipped &&
        !p.bookings_cancel_skipped_locked_invoice &&
        !p.bookings_cancel_skipped_locked_payout
      ) {
        showToast(`${p.bookings_cancel_skipped} visit(s) could not be removed`, false);
      }
      if (p?.errors?.length) {
        showToast(p.errors[0] ?? "Some rows could not be updated", false);
      }
      void refetch();
    } finally {
      setActionLoading(null);
    }
  }

  async function handleBackfill(id: string) {
    setActionLoading(id);
    try {
      const token = await getAdminToken();
      if (!token) {
        showToast("Not authenticated", false);
        return;
      }
      const res = await globalThis.fetch(`/api/admin/recurring/${encodeURIComponent(id)}/backfill-occurrences`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as {
        error?: string;
        generated?: number;
        skipped_duplicate?: number;
      };
      if (!res.ok) {
        showToast(json.error ?? "Backfill failed", false);
        return;
      }
      const g = json.generated ?? 0;
      const dup = json.skipped_duplicate ?? 0;
      showToast(`Backfill complete: +${g} created, ${dup} already existed`, true);
      void refetch();
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDelete(id: string) {
    setActionLoading(id);
    const res = await adminFetch(`/api/admin/recurring/${encodeURIComponent(id)}`, { method: "DELETE" });
    setActionLoading(null);
    if (res.ok) {
      showToast("Plan deleted", true);
      void refetch();
    } else {
      showToast(res.error ?? "Failed to delete plan", false);
    }
  }

  async function handleConfirmDialogAction() {
    if (!confirmDialog) return;
    const { variant, planId } = confirmDialog;
    if (variant === "cancel") {
      await handleAction(planId, "cancel");
    } else if (variant === "delete") {
      await handleDelete(planId);
    } else if (variant === "reconcile") {
      await handleReconcile(planId);
    } else {
      await handleBackfill(planId);
    }
    setConfirmDialog(null);
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
          <h1 className="text-2xl font-bold text-slate-900">Recurring Plans</h1>
          <p className="mt-0.5 text-sm text-slate-500">Manage customer recurring booking schedules.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" /> New plan
          </button>
          <button
            type="button"
            onClick={() => {
              void refetch();
              void refetchCronHealth();
            }}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 shadow-sm"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> Refresh
          </button>
        </div>
      </div>

      {cronWarning && (
        <div
          className={cn(
            "flex items-start gap-3 rounded-2xl border px-4 py-3",
            cronWarning.severity === "red"
              ? "border-red-200 bg-red-50"
              : "border-amber-200 bg-amber-50",
          )}
        >
          <AlertTriangle
            className={cn(
              "mt-0.5 h-5 w-5 shrink-0",
              cronWarning.severity === "red" ? "text-red-600" : "text-amber-600",
            )}
          />
          <div>
            <p
              className={cn(
                "text-sm font-semibold",
                cronWarning.severity === "red" ? "text-red-800" : "text-amber-900",
              )}
            >
              Recurring generator may be down
            </p>
            <p
              className={cn(
                "mt-0.5 text-sm",
                cronWarning.severity === "red" ? "text-red-700" : "text-amber-800",
              )}
            >
              {cronWarning.message}
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
          <p className="text-sm text-red-700">{error}</p>
          <button type="button" onClick={() => void refetch()} className="ml-auto text-xs font-semibold text-red-600 hover:underline">
            Retry
          </button>
        </div>
      )}

      <TooltipProvider delayDuration={200}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <RecurringStatCard
            label="Active plans"
            value={loading ? "—" : String(activeCount)}
            icon={Repeat}
            cls="bg-emerald-50 text-emerald-700"
          />
          <RecurringStatCard
            label="Paused"
            value={loading ? "—" : String(pausedCount)}
            icon={Pause}
            cls="bg-orange-50 text-orange-700"
          />
          <RecurringStatCard
            label="Cancelled"
            value={loading ? "—" : String(cancelledCount)}
            icon={XCircle}
            cls="bg-slate-50 text-slate-600"
          />
          <RecurringStatCard
            label="Est. monthly revenue"
            value={loading ? "—" : `R ${monthlyRevenue.toLocaleString("en-ZA")}`}
            icon={DollarSign}
            cls="bg-violet-50 text-violet-700"
            tooltip="Forward-looking estimate from active plans: visit price × (52÷12 × weekdays). Uses an average month length, not actual calendar visits."
          />
          <RecurringStatCard
            label={`${draftMonthLabel} draft`}
            value={loading ? "—" : formatCurrency(draftTotalCents, "ZAR")}
            icon={FileText}
            cls="bg-blue-50 text-blue-700"
            tooltip="Total on current-month draft invoices for active recurring customers. Compare with Outstanding on /office/invoices when all drafts are unpaid."
            hint={loading || draftInvoiceCount === 0 ? undefined : `${draftInvoiceCount} draft invoice${draftInvoiceCount === 1 ? "" : "s"}`}
            href="/office/invoices"
          />
        </div>
      </TooltipProvider>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            placeholder="Search customers, email, location…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-4 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        <div className="flex items-center gap-1">
          {(["all", "active", "paused", "cancelled"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-semibold transition",
                statusFilter === s
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
              )}
            >
              {s === "all" ? "All" : (STATUS_MAP[s as PlanStatus]?.label ?? s)}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center gap-3 py-20 text-sm text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading plans…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <Repeat className="mb-3 h-10 w-10 text-slate-200" />
            <p className="font-semibold text-slate-600">No recurring plans found</p>
            <p className="mt-1 text-sm text-slate-400">
              {debouncedSearch || statusFilter !== "all" ? "Try adjusting your filters." : "Create your first recurring plan to get started."}
            </p>
            {!debouncedSearch && statusFilter === "all" && (
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="mt-4 flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" /> New plan
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    {["Customer", "Service", "Frequency", "Next visit", "Preview", "Price", "Status", "Actions"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {pageRows.map((plan) => {
                    const status = (plan.status.toLowerCase() as PlanStatus) ?? "active";
                    const sm = STATUS_MAP[status] ?? STATUS_MAP.active;
                    const customer = displayCustomer(plan);
                    const busy = actionLoading === plan.id;
                    const canPause = status === "active";
                    const canResume = status === "paused";
                    const canCancel = status === "active" || status === "paused";
                    const noWeekdays =
                      (plan.days_of_week?.length ?? 0) === 0 &&
                      ["weekly", "biweekly"].includes(plan.frequency.toLowerCase());

                    return (
                      <tr key={plan.id} className="transition-colors hover:bg-slate-50/50">
                        <td className="px-4 py-3 align-top">
                          <p className="font-semibold text-slate-800">{customer.primary}</p>
                          {customer.secondary && <p className="text-xs text-slate-400">{customer.secondary}</p>}
                          <p className="mt-0.5 font-mono text-[10px] text-slate-300">{plan.id.slice(0, 8)}…</p>
                        </td>
                        <td className="px-4 py-3 align-top text-slate-600">{plan.service_label ?? "Standard Cleaning"}</td>
                        <td className="px-4 py-3 align-top text-slate-600">
                          <div>{FREQ_LABELS[plan.frequency.toLowerCase()] ?? plan.frequency}</div>
                          <div className="text-xs text-slate-400">{formatDays(plan.days_of_week ?? [])}</div>
                          {noWeekdays && (
                            <div className="mt-0.5 text-[11px] text-amber-700">No weekdays set</div>
                          )}
                        </td>
                        <td className="px-4 py-3 align-top tabular-nums text-slate-600">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5 text-slate-400" />
                            {plan.next_run_date || "—"}
                          </div>
                          {plan.skip_next_occurrence_date && (
                            <div className="mt-0.5 text-xs text-amber-700">Skip: {plan.skip_next_occurrence_date}</div>
                          )}
                          {plan.last_generated_at && (
                            <div className="mt-0.5 text-[11px] text-slate-400">
                              Last gen: {formatIsoInJohannesburgYmd(plan.last_generated_at)}
                            </div>
                          )}
                        </td>
                        <td className="max-w-[220px] px-4 py-3 align-top text-xs text-slate-500">{previewText(plan)}</td>
                        <td className="px-4 py-3 align-top font-semibold tabular-nums text-slate-800">
                          R {Math.round(plan.price ?? 0).toLocaleString("en-ZA")}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold", sm.cls)}>{sm.label}</span>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <RecurringPlanActionsMenu
                            planId={plan.id}
                            busy={busy}
                            canPause={canPause}
                            canResume={canResume}
                            canCancel={canCancel}
                            onEdit={() => setEditTarget(plan)}
                            onDelete={() => setConfirmDialog({ variant: "delete", planId: plan.id })}
                            onBackfill={() => setConfirmDialog({ variant: "backfill", planId: plan.id })}
                            onReconcile={() => setConfirmDialog({ variant: "reconcile", planId: plan.id })}
                            onPause={() => void handleAction(plan.id, "pause")}
                            onResume={() => void handleAction(plan.id, "resume")}
                            onCancel={() => setConfirmDialog({ variant: "cancel", planId: plan.id })}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
                <p className="text-xs text-slate-500">
                  Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
                  {debouncedSearch || statusFilter !== "all" ? ` (filtered from ${plans.length})` : ""}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="px-2 text-xs font-semibold text-slate-600">
                    {safePage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <CreateRecurringPlanDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={() => void refetch()} />

      <EditRecurringPlanDialog
        open={editTarget != null}
        plan={editTarget}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
        onUpdated={() => {
          showToast("Plan updated", true);
          void refetch();
        }}
      />

      <OfficeRecurringPlanConfirmDialog
        open={confirmDialog != null}
        variant={confirmDialog?.variant ?? null}
        plan={confirmPlan}
        busy={confirmPlan != null && actionLoading === confirmPlan.id}
        onOpenChange={(open) => {
          if (!open && actionLoading == null) setConfirmDialog(null);
        }}
        onConfirm={() => void handleConfirmDialogAction()}
      />
    </div>
  );
}
