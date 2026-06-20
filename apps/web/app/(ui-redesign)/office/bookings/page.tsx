"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Search,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  UserCheck,
  Users,
  XCircle,
  RefreshCw,
  Loader2,
  AlertCircle,
  Trash2,
  X,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminData, adminFetch } from "@/hooks/useAdminData";
import { AdminDashboardActionError, deleteBookingAdmin } from "@/lib/admin/dashboard";
import {
  canHardDeleteBooking,
  hardDeleteBlockReason,
} from "@/lib/admin/bookingHardDeleteClient";
import { OfficeDeleteBookingDialog } from "@/components/admin/office/OfficeDeleteBookingDialog";
import { OfficeAssignTeamDialog } from "@/components/admin/office/OfficeAssignTeamDialog";
import { adminBookingAssignmentDisplay } from "@/lib/admin/adminBookingAssignmentDisplay";
import { isTeamService } from "@/lib/dispatch/teamServiceDetection";

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  confirmed:       { label: "Confirmed",       className: "bg-blue-100 text-blue-700" },
  assigned:        { label: "Assigned",        className: "bg-indigo-100 text-indigo-700" },
  in_progress:     { label: "In Progress",     className: "bg-violet-100 text-violet-700" },
  completed:       { label: "Completed",       className: "bg-emerald-100 text-emerald-700" },
  cancelled:       { label: "Cancelled",       className: "bg-slate-100 text-slate-600" },
  pending_payment: { label: "Awaiting Payment",className: "bg-amber-100 text-amber-700" },
  pending:         { label: "Pending",         className: "bg-orange-100 text-orange-700" },
};

type BookingRow = {
  id: string;
  customer_name: string | null;
  customer_email: string | null;
  service: string | null;
  service_slug: string | null;
  date: string | null;
  time: string | null;
  location: string | null;
  total_paid_zar: number | null;
  amount_paid_cents: number | null;
  status: string | null;
  cleaner_id: string | null;
  team_id: string | null;
  payment_status: string | null;
  payment_completed_at?: string | null;
  paid_at?: string | null;
  monthly_invoice_id?: string | null;
  payout_id?: string | null;
  payout_status?: string | null;
  payout_frozen_cents?: number | null;
  display_earnings_cents?: number | null;
  team?: { id: string; name: string | null } | null;
  booking_cleaners?: Array<{ cleaner_id: string; full_name: string | null; role: string }>;
};

type AdminBookingsResponse = {
  bookings: BookingRow[];
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    from: number;
    to: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  statusCounts?: Record<string, number> & {
    all: number;
    completedToday: number;
  };
  metrics?: {
    totalBookingsToday: number;
    revenueTodayZar: number;
  };
  attention?: {
    unassigned: number;
    slaBreaches: number;
    startingSoon: number;
  };
};

const ALL_STATUSES = ["confirmed", "assigned", "in_progress", "completed", "cancelled", "pending_payment", "pending"] as const;

type DateScope = "all" | "today" | "upcoming" | "completed";
type OpsQuick = "" | "monthly_only" | "awaiting_payment" | "today" | "tomorrow";
type AttentionFilter = "all" | "sla" | "follow_up" | "unassigned" | "unassignable" | "starting_soon";
type ServiceFilter = "all" | "standard" | "deep" | "move" | "airbnb" | "carpet";

type CityOption = { id: string; name: string };

const DATE_SCOPE_OPTIONS: { key: DateScope; label: string }[] = [
  { key: "all", label: "All dates" },
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "completed", label: "Past / done" },
];

const OPS_QUICK_OPTIONS: { key: Exclude<OpsQuick, "">; label: string }[] = [
  { key: "awaiting_payment", label: "Awaiting payment" },
  { key: "monthly_only", label: "Monthly billing" },
  { key: "today", label: "Today (visit date)" },
  { key: "tomorrow", label: "Tomorrow" },
];

const SERVICE_OPTIONS: { key: ServiceFilter; label: string }[] = [
  { key: "all", label: "All services" },
  { key: "standard", label: "Standard" },
  { key: "deep", label: "Deep clean" },
  { key: "move", label: "Move in/out" },
  { key: "airbnb", label: "Airbnb" },
  { key: "carpet", label: "Carpet" },
];

function buildListFilter(dateScope: DateScope, attentionFilter: AttentionFilter): string {
  if (attentionFilter === "sla") return "sla";
  if (attentionFilter === "follow_up") return "follow-up";
  if (attentionFilter === "unassigned") return "unassigned";
  if (attentionFilter === "unassignable") return "unassignable";
  if (attentionFilter === "starting_soon") return "starting-soon";
  if (dateScope !== "all") return dateScope;
  return "all";
}

function scrollToBookingsTable() {
  globalThis.requestAnimationFrame(() => {
    document.getElementById("bookings-table")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
      {label}
      <button type="button" onClick={onClear} className="rounded-full p-0.5 hover:bg-blue-100" aria-label={`Clear ${label}`}>
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function formatZar(cents: number | null, zar: number | null): string {
  const val = zar ?? (cents != null ? cents / 100 : null);
  if (val == null) return "—";
  return `R ${Math.round(val).toLocaleString("en-ZA")}`;
}

function getAssignment(row: BookingRow): { label: string; title?: string; needsTeam: boolean } {
  return adminBookingAssignmentDisplay(row);
}

function bookingSupportsTeamAssign(row: BookingRow): boolean {
  if (!isTeamService({ service: row.service, service_slug: row.service_slug })) return false;
  const st = (row.status ?? "").toLowerCase();
  return st !== "cancelled" && st !== "pending_payment" && st !== "payment_expired";
}

function LoadingRows() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <tr key={i}>
          <td colSpan={8} className="px-4 py-3">
            <div className="h-5 w-full animate-pulse rounded-lg bg-slate-100" />
          </td>
        </tr>
      ))}
    </>
  );
}

export default function BookingsPage() {
  const searchParams = useSearchParams();
  const recurringIdFilter = (searchParams.get("recurring_id") ?? searchParams.get("recurringId") ?? "").trim();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [dateScope, setDateScope] = useState<DateScope>("all");
  const [attentionFilter, setAttentionFilter] = useState<AttentionFilter>("all");
  const [opsQuick, setOpsQuick] = useState<OpsQuick>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [serviceFilter, setServiceFilter] = useState<ServiceFilter>("all");
  const [cityId, setCityId] = useState("all");
  const [cities, setCities] = useState<CityOption[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [actionLoading, setActionLoading] = useState<{ id: string; action: "cancel" | "delete" } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BookingRow | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pendingRemovals, setPendingRemovals] = useState<BookingRow[]>([]);
  const [teamAssignTarget, setTeamAssignTarget] = useState<BookingRow | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  useEffect(() => {
    const f = (searchParams.get("filter") ?? "").trim().toLowerCase();
    if (!f) return;
    if (f === "unassignable") setAttentionFilter("unassignable");
    else if (f === "starting-soon") setAttentionFilter("starting_soon");
    else if (f === "sla") setAttentionFilter("sla");
    else if (f === "unassigned") setAttentionFilter("unassigned");
    else if (f === "follow-up") setAttentionFilter("follow_up");
    else if (f === "today") setDateScope("today");
    else if (f === "upcoming") setDateScope("upcoming");
    else if (f === "completed") setDateScope("completed");
  }, [searchParams]);

  useEffect(() => {
    const timer = globalThis.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 300);
    return () => globalThis.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const timer = globalThis.setTimeout(() => setPage(1), 0);
    return () => globalThis.clearTimeout(timer);
  }, [
    debouncedSearch,
    activeFilter,
    pageSize,
    recurringIdFilter,
    dateScope,
    attentionFilter,
    opsQuick,
    dateFrom,
    dateTo,
    serviceFilter,
    cityId,
  ]);

  useEffect(() => {
    let cancelled = false;
    void globalThis.fetch("/api/cities")
      .then((r) => r.json())
      .then((j: { cities?: CityOption[] }) => {
        if (!cancelled) setCities((j.cities ?? []).filter((c) => c.id && c.name));
      })
      .catch(() => {
        if (!cancelled) setCities([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const listFilter = buildListFilter(dateScope, attentionFilter);
  const hasExtraFilters =
    !recurringIdFilter &&
    (dateScope !== "all" ||
      attentionFilter !== "all" ||
      opsQuick !== "" ||
      dateFrom !== "" ||
      dateTo !== "" ||
      serviceFilter !== "all" ||
      cityId !== "all");

  const activeFilterChips = useMemo(() => {
    if (recurringIdFilter) return [];
    const chips: { key: string; label: string; clear: () => void }[] = [];
    if (attentionFilter === "sla") {
      chips.push({ key: "sla", label: "SLA breaches", clear: () => setAttentionFilter("all") });
    } else if (attentionFilter === "follow_up") {
      chips.push({ key: "follow_up", label: "Payment follow-up", clear: () => setAttentionFilter("all") });
    } else if (attentionFilter === "unassigned") {
      chips.push({ key: "unassigned", label: "Unassigned", clear: () => setAttentionFilter("all") });
    } else if (attentionFilter === "unassignable") {
      chips.push({ key: "unassignable", label: "Unassignable", clear: () => setAttentionFilter("all") });
    } else if (attentionFilter === "starting_soon") {
      chips.push({ key: "starting_soon", label: "Starting soon", clear: () => setAttentionFilter("all") });
    } else if (dateScope !== "all") {
      const label = DATE_SCOPE_OPTIONS.find((o) => o.key === dateScope)?.label ?? dateScope;
      chips.push({ key: "dateScope", label, clear: () => setDateScope("all") });
    }
    if (opsQuick) {
      const label = OPS_QUICK_OPTIONS.find((o) => o.key === opsQuick)?.label ?? opsQuick;
      chips.push({ key: "opsQuick", label, clear: () => setOpsQuick("") });
    }
    if (dateFrom) chips.push({ key: "from", label: `From ${dateFrom}`, clear: () => setDateFrom("") });
    if (dateTo) chips.push({ key: "to", label: `To ${dateTo}`, clear: () => setDateTo("") });
    if (serviceFilter !== "all") {
      const label = SERVICE_OPTIONS.find((o) => o.key === serviceFilter)?.label ?? serviceFilter;
      chips.push({ key: "service", label, clear: () => setServiceFilter("all") });
    }
    if (cityId !== "all") {
      const label = cities.find((c) => c.id === cityId)?.name ?? "City";
      chips.push({ key: "city", label, clear: () => setCityId("all") });
    }
    return chips;
  }, [attentionFilter, cities, cityId, dateFrom, dateScope, dateTo, opsQuick, recurringIdFilter, serviceFilter]);

  function clearAllFilters() {
    setDateScope("all");
    setAttentionFilter("all");
    setOpsQuick("");
    setDateFrom("");
    setDateTo("");
    setServiceFilter("all");
    setCityId("all");
    setActiveFilter("all");
    setSearch("");
  }

  function selectDateScope(next: DateScope) {
    setDateScope(next);
    setAttentionFilter("all");
  }

  function selectAttentionFilter(next: AttentionFilter) {
    setAttentionFilter(next);
    if (next !== "all") setDateScope("all");
  }

  function applyTotalBookingsView() {
    if (hasExtraFilters || activeFilter !== "all" || debouncedSearch) {
      clearAllFilters();
    }
    scrollToBookingsTable();
  }

  function applyUnassignedView() {
    if (attentionFilter === "unassigned") {
      setAttentionFilter("all");
    } else {
      setAttentionFilter("unassigned");
      setDateScope("all");
      setOpsQuick("");
      setActiveFilter("all");
    }
    scrollToBookingsTable();
  }

  function applySlaView() {
    if (attentionFilter === "sla") {
      setAttentionFilter("all");
    } else {
      setAttentionFilter("sla");
      setDateScope("all");
      setOpsQuick("");
      setActiveFilter("all");
    }
    scrollToBookingsTable();
  }

  function applyCompletedTodayView() {
    if (dateScope === "today" && activeFilter === "completed" && attentionFilter === "all" && opsQuick === "") {
      setDateScope("all");
      setActiveFilter("all");
    } else {
      setAttentionFilter("all");
      setDateScope("today");
      setActiveFilter("completed");
      setOpsQuick("");
    }
    scrollToBookingsTable();
  }

  const totalBookingsActive =
    !recurringIdFilter && !hasExtraFilters && activeFilter === "all" && !debouncedSearch;

  const { data, loading, error, refetch } = useAdminData<AdminBookingsResponse>(
    "/api/admin/bookings",
    {
      params: {
        filter: recurringIdFilter ? "all" : listFilter,
        page: String(page),
        pageSize: String(pageSize),
        ...(activeFilter !== "all" ? { bookingStatus: activeFilter } : {}),
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
        ...(recurringIdFilter ? { recurring_id: recurringIdFilter } : {}),
        ...(!recurringIdFilter && opsQuick ? { opsQuick } : {}),
        ...(!recurringIdFilter && dateFrom ? { from: dateFrom } : {}),
        ...(!recurringIdFilter && dateTo ? { to: dateTo } : {}),
        ...(!recurringIdFilter && serviceFilter !== "all" ? { serviceSlug: serviceFilter } : {}),
        ...(!recurringIdFilter && cityId !== "all" ? { cityId } : {}),
      },
    },
  );

  const serverBookings = data?.bookings ?? [];
  const removedIds = useMemo(() => new Set(pendingRemovals.map((b) => b.id)), [pendingRemovals]);
  const bookings = useMemo(
    () => serverBookings.filter((b) => !removedIds.has(b.id)),
    [removedIds, serverBookings],
  );
  const pagination = data?.pagination ?? {
    page,
    pageSize,
    total: bookings.length,
    totalPages: 1,
    from: bookings.length > 0 ? 1 : 0,
    to: bookings.length,
    hasNextPage: false,
    hasPreviousPage: false,
  };
  const adjustedPagination = useMemo(() => {
    const removed = pendingRemovals.length;
    if (removed === 0) return pagination;
    const total = Math.max(0, pagination.total - removed);
    const totalPages = Math.max(1, Math.ceil(total / pagination.pageSize));
    const from = total === 0 ? 0 : Math.min(pagination.from, total);
    const to = total === 0 ? 0 : Math.min(Math.max(from, pagination.to - removed), total);
    return {
      ...pagination,
      total,
      totalPages,
      from,
      to,
      hasNextPage: pagination.page < totalPages,
      hasPreviousPage: pagination.page > 1,
    };
  }, [pagination, pendingRemovals.length]);
  const counts: Record<string, number> = useMemo(() => {
    const base = data?.statusCounts;
    const next: Record<string, number> = {
      all: base?.all ?? adjustedPagination.total,
    };
    for (const s of ALL_STATUSES) next[s] = base?.[s] ?? 0;
    for (const removed of pendingRemovals) {
      next.all = Math.max(0, next.all - 1);
      const st = (removed.status ?? "pending").toLowerCase();
      if (st in next) next[st] = Math.max(0, next[st] - 1);
    }
    if (base?.completedToday != null) next.completedToday = base.completedToday;
    return next;
  }, [adjustedPagination.total, data?.statusCounts, pendingRemovals]);

  useEffect(() => {
    if (data?.pagination && page > data.pagination.totalPages) {
      const timer = globalThis.setTimeout(() => setPage(Math.max(1, data.pagination!.totalPages)), 0);
      return () => globalThis.clearTimeout(timer);
    }
  }, [data?.pagination, page]);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  async function handleCancel(bookingId: string) {
    setActionLoading({ id: bookingId, action: "cancel" });
    const res = await adminFetch(`/api/admin/bookings/${bookingId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "cancelled" }),
    });
    setActionLoading(null);
    if (res.ok) {
      showToast("Booking cancelled", true);
      if (bookings.length === 1 && page > 1) {
        setPage((p) => Math.max(1, p - 1));
      } else {
        void refetch();
      }
    } else {
      showToast(res.error ?? "Failed to cancel", false);
    }
  }

  async function confirmDeleteBooking(): Promise<boolean> {
    if (!deleteTarget) return false;

    const target = deleteTarget;
    const blockReason = hardDeleteBlockReason(target);
    if (blockReason) {
      setDeleteError(blockReason);
      showToast(blockReason, false);
      return false;
    }

    setDeleteError(null);
    setActionLoading({ id: target.id, action: "delete" });
    try {
      await deleteBookingAdmin(target.id);
      setPendingRemovals((prev) => [...prev, target]);
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
      showToast("Booking deleted", true);

      const wasLastOnPage = serverBookings.length === 1;
      if (wasLastOnPage && page > 1) {
        setPage((p) => Math.max(1, p - 1));
      }
      await refetch();
      setPendingRemovals((prev) => prev.filter((b) => b.id !== target.id));
      return true;
    } catch (e) {
      const message =
        e instanceof AdminDashboardActionError || e instanceof Error
          ? e.message
          : "Failed to delete booking";
      setDeleteError(message);
      showToast(message, false);
      return false;
    } finally {
      setActionLoading(null);
    }
  }

  function openDeleteDialog(booking: BookingRow) {
    const blockReason = hardDeleteBlockReason(booking);
    if (blockReason) {
      showToast(blockReason, false);
      return;
    }
    setDeleteTarget(booking);
    setDeleteError(null);
    setDeleteDialogOpen(true);
  }

  function closeDeleteDialog() {
    setDeleteDialogOpen(false);
    setDeleteTarget(null);
    setDeleteError(null);
  }

  const unassignedCount = data?.attention?.unassigned ?? 0;
  const overdueCount = data?.attention?.slaBreaches ?? 0;
  const completedTodayCount = data?.statusCounts?.completedToday ?? 0;

  return (
    <div className="space-y-5">
      <OfficeDeleteBookingDialog
        open={deleteDialogOpen}
        booking={deleteTarget}
        errorMessage={deleteError}
        busy={deleteTarget != null && actionLoading?.id === deleteTarget.id && actionLoading.action === "delete"}
        onOpenChange={(open) => {
          if (!open) closeDeleteDialog();
          else setDeleteDialogOpen(true);
        }}
        onConfirm={confirmDeleteBooking}
      />

      <OfficeAssignTeamDialog
        open={teamAssignTarget != null}
        bookingId={teamAssignTarget?.id ?? null}
        bookingLabel={
          teamAssignTarget
            ? `${teamAssignTarget.id.slice(0, 8).toUpperCase()} · ${teamAssignTarget.customer_name ?? teamAssignTarget.customer_email ?? "Booking"}`
            : null
        }
        currentTeamId={teamAssignTarget?.team_id ?? null}
        onOpenChange={(open) => {
          if (!open) setTeamAssignTarget(null);
        }}
        onAssigned={() => void refetch()}
      />

      {/* Toast */}
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

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Bookings</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Manage all customer bookings, assignments and actions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void refetch()}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 shadow-sm"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Refresh
          </button>
          <button
            type="button"
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 shadow-sm"
          >
            <Download className="h-4 w-4" /> Export
          </button>
        </div>
      </div>

      {recurringIdFilter && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-sm text-blue-800">
            Showing bookings for recurring plan{" "}
            <span className="font-mono text-xs">{recurringIdFilter.slice(0, 8)}…</span>
          </p>
          <Link
            href="/office/bookings"
            className="ml-auto text-xs font-semibold text-blue-700 hover:underline"
          >
            Clear filter
          </Link>
          <Link
            href="/office/recurring"
            className="text-xs font-semibold text-blue-700 hover:underline"
          >
            Back to plans
          </Link>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
          <p className="text-sm text-red-700">{error}</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="ml-auto text-xs font-semibold text-red-600 hover:underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          {
            label: "Total bookings",
            value: loading ? "—" : counts.all,
            sub: "Matching filters",
            color: "text-slate-800",
            onClick: applyTotalBookingsView,
            active: totalBookingsActive,
          },
          {
            label: "Unassigned",
            value: loading ? "—" : unassignedCount,
            sub: "Need attention",
            color: "text-orange-600",
            onClick: applyUnassignedView,
            active: attentionFilter === "unassigned",
          },
          {
            label: "SLA breaches",
            value: loading ? "—" : overdueCount,
            sub: "Overdue dispatch",
            color: overdueCount > 0 ? "text-red-600" : "text-slate-400",
            onClick: applySlaView,
            active: attentionFilter === "sla",
          },
          {
            label: "Completed (today)",
            value: loading ? "—" : completedTodayCount,
            sub: "Successfully done",
            color: "text-emerald-600",
            onClick: applyCompletedTodayView,
            active: dateScope === "today" && activeFilter === "completed" && attentionFilter === "all",
          },
        ].map((k) => (
          <button
            key={k.label}
            type="button"
            onClick={k.onClick}
            className={cn(
              "rounded-2xl border bg-white p-4 text-left shadow-sm transition cursor-pointer",
              "hover:border-blue-200 hover:bg-blue-50/30",
              k.active ? "border-blue-300 ring-2 ring-blue-100" : "border-slate-100",
            )}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k.label}</p>
            <p className={cn("mt-1 text-2xl font-bold tabular-nums", k.color)}>{k.value}</p>
            <p className="text-xs text-slate-400">{k.sub}</p>
          </button>
        ))}
      </div>

      {/* Table card */}
      <div id="bookings-table" className="rounded-2xl bg-white border border-slate-100 shadow-sm scroll-mt-4">
        {/* Search + filters */}
        <div className="space-y-3 border-b border-slate-100 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by ID, customer, address…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="hidden h-4 w-4 text-slate-400 sm:block" />
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                disabled={Boolean(recurringIdFilter)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 disabled:opacity-50"
                aria-label="From date"
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                disabled={Boolean(recurringIdFilter)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 disabled:opacity-50"
                aria-label="To date"
              />
            </div>
          </div>

          {!recurringIdFilter && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  <Filter className="h-3.5 w-3.5" /> When
                </span>
                {DATE_SCOPE_OPTIONS.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => selectDateScope(key)}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                      dateScope === key && attentionFilter === "all"
                        ? "bg-blue-600 text-white"
                        : "text-slate-500 hover:bg-slate-100",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Quick</span>
                {OPS_QUICK_OPTIONS.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setOpsQuick((cur) => (cur === key ? "" : key))}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                      opsQuick === key ? "bg-violet-600 text-white" : "text-slate-500 hover:bg-slate-100",
                    )}
                  >
                    {label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => selectAttentionFilter(attentionFilter === "follow_up" ? "all" : "follow_up")}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                    attentionFilter === "follow_up" ? "bg-amber-600 text-white" : "text-slate-500 hover:bg-slate-100",
                  )}
                >
                  Payment follow-up
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={serviceFilter}
                  onChange={(e) => setServiceFilter(e.target.value as ServiceFilter)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                  aria-label="Service type"
                >
                  {SERVICE_OPTIONS.map(({ key, label }) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
                <select
                  value={cityId}
                  onChange={(e) => setCityId(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                  aria-label="City"
                >
                  <option value="all">All cities</option>
                  {cities.map((city) => (
                    <option key={city.id} value={city.id}>
                      {city.name}
                    </option>
                  ))}
                </select>
                {hasExtraFilters ? (
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Clear filters
                  </button>
                ) : null}
              </div>

              {activeFilterChips.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  {activeFilterChips.map((chip) => (
                    <FilterChip key={chip.key} label={chip.label} onClear={chip.clear} />
                  ))}
                </div>
              ) : null}
            </>
          )}
        </div>

        {/* Status tabs */}
        <div className="flex flex-wrap gap-1 border-b border-slate-100 px-4 py-2">
          {(["all", ...ALL_STATUSES] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setActiveFilter(s)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                activeFilter === s
                  ? "bg-blue-600 text-white"
                  : "text-slate-500 hover:bg-slate-100",
              )}
            >
              {s === "all" ? "All" : (STATUS_MAP[s]?.label ?? s)}
              <span
                className={cn(
                  "ml-1.5 rounded-full px-1.5 py-0.5 text-[10px]",
                  activeFilter === s ? "bg-blue-500 text-blue-100" : "bg-slate-100 text-slate-500",
                )}
              >
                {counts[s] ?? 0}
              </span>
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                {["Booking", "Customer", "Service", "Date/Time", "Assignment", "Amount", "Status", "Actions"].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <LoadingRows />
              ) : bookings.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-sm text-slate-400">
                    {error ? "Failed to load bookings." : "No bookings match your search."}
                  </td>
                </tr>
              ) : (
                bookings.map((b) => {
                  const statusKey = (b.status ?? "pending").toLowerCase();
                  const s = STATUS_MAP[statusKey] ?? { label: b.status ?? "—", className: "bg-slate-100 text-slate-600" };
                  const assignment = getAssignment(b);
                  const isActing = actionLoading?.id === b.id;
                  const isCancelling = isActing && actionLoading?.action === "cancel";
                  const isDeleting = isActing && actionLoading?.action === "delete";
                  const teamAssignable = bookingSupportsTeamAssign(b);

                  return (
                    <tr key={b.id} className="group hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="text-xs font-mono font-bold text-blue-600">
                          {b.id.slice(0, 8).toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold text-slate-800">
                          {b.customer_name ?? b.customer_email ?? "—"}
                        </p>
                        <p className="text-xs text-slate-400 truncate max-w-[180px]">
                          {b.location ?? "—"}
                        </p>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-sm text-slate-700 capitalize">
                          {(b.service_slug ?? b.service ?? "—").replace(/-/g, " ")}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className="block min-w-[92px] text-xs text-slate-600">
                          {b.date ?? "—"}{b.time ? ` · ${b.time.slice(0, 5)}` : ""}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex max-w-[180px] flex-col gap-1">
                          <span
                            className={cn(
                              "block truncate text-xs font-medium",
                              assignment.needsTeam || assignment.label === "—"
                                ? "text-orange-600"
                                : "text-slate-700",
                            )}
                            title={assignment.title ?? assignment.label}
                          >
                            {assignment.label}
                          </span>
                          {teamAssignable ? (
                            <button
                              type="button"
                              onClick={() => setTeamAssignTarget(b)}
                              className="w-fit text-left text-[11px] font-semibold text-blue-600 hover:underline"
                            >
                              {b.team_id || b.team?.name ? "Change team" : "Assign team"}
                            </button>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-semibold text-slate-800">
                          {formatZar(b.amount_paid_cents, b.total_paid_zar)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-1 text-[11px] font-bold",
                            s.className,
                          )}
                        >
                          {s.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <a
                            href={`/office/bookings/${b.id}`}
                            title="View"
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </a>
                          {teamAssignable ? (
                            <button
                              type="button"
                              title={b.team_id || b.team?.name ? "Change team" : "Assign team"}
                              onClick={() => setTeamAssignTarget(b)}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                            >
                              <Users className="h-3.5 w-3.5" />
                            </button>
                          ) : (
                            <a
                              href={`/office/bookings/${b.id}?action=assign`}
                              title="Assign cleaner"
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
                            >
                              <UserCheck className="h-3.5 w-3.5" />
                            </a>
                          )}
                          <button
                            type="button"
                            title="Cancel"
                            disabled={isActing || b.status === "cancelled" || b.status === "completed"}
                            onClick={() => void handleCancel(b.id)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-30"
                          >
                            {isCancelling ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <XCircle className="h-3.5 w-3.5" />
                            )}
                          </button>
                          {canHardDeleteBooking(b) ? (
                            <button
                              type="button"
                              title="Delete permanently (draft / unpaid only)"
                              disabled={isActing}
                              onClick={() => openDeleteDialog(b)}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-700 transition-colors disabled:opacity-30"
                            >
                              {isDeleting ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
          <p className="text-xs text-slate-400">
            {loading
              ? "Loading…"
              : `Showing ${adjustedPagination.from}-${adjustedPagination.to} of ${adjustedPagination.total} bookings`}
          </p>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-slate-500">
              Rows
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
              >
                {[10, 25, 50, 100].map((size) => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </label>
            <span className="text-xs font-medium text-slate-500">
              Page {adjustedPagination.page} of {adjustedPagination.totalPages}
            </span>
            <button
              type="button"
              disabled={loading || !adjustedPagination.hasPreviousPage}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Prev
            </button>
            <button
              type="button"
              disabled={loading || !adjustedPagination.hasNextPage}
              onClick={() => setPage((p) => p + 1)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
