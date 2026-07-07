"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Search,
  Calendar,
  CalendarDays,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  UserCheck,
  Users,
  UserX,
  XCircle,
  RefreshCw,
  Loader2,
  AlertCircle,
  Trash2,
  X,
  Filter,
  Plus,
} from "lucide-react";
import {
  OfficeZohoMetricCard,
  OfficeZohoMetricsRow,
  OfficeZohoPageHeader,
  OfficeZohoPillTabs,
  OfficeZohoSecondaryButton,
  OfficeZohoSegmentTabs,
  OfficeZohoTableShell,
  OfficeZohoToggle,
} from "@/components/admin/office/OfficeZohoChrome";
import { cn } from "@/lib/utils";
import { showToast as pushAppToast } from "@/components/ui/notifications";
import { useAdminData, adminFetch } from "@/hooks/useAdminData";
import {
  buildOfficeBookingsListCsv,
  downloadOfficeBookingsCsv,
  fetchAllOfficeBookingsForExport,
} from "@/lib/admin/officeBookingsListExport";
import { AdminDashboardActionError, deleteBookingAdmin } from "@/lib/admin/dashboard";
import {
  canHardDeleteBooking,
  hardDeleteBlockReason,
} from "@/lib/admin/bookingHardDeleteClient";
import { OfficeDeleteBookingDialog } from "@/components/admin/office/OfficeDeleteBookingDialog";
import { OfficeAssignTeamDialog } from "@/components/admin/office/OfficeAssignTeamDialog";
import { adminBookingAssignmentDisplay } from "@/lib/admin/adminBookingAssignmentDisplay";
import { johannesburgCalendarMonthDateRangeYmd } from "@/lib/dashboard/johannesburgMonth";
import { isTeamService } from "@/lib/dispatch/teamServiceDetection";
import { isAuthoritativeBookingCompleted } from "@/lib/booking/deriveBookingOperationalPhase";

function defaultBookingsMonthRange() {
  const { startYmd, endYmd } = johannesburgCalendarMonthDateRangeYmd();
  return { startYmd, endYmd };
}

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  confirmed:       { label: "Confirmed",       className: "bg-blue-100 text-blue-700" },
  assigned:        { label: "Assigned",        className: "bg-indigo-100 text-indigo-700" },
  in_progress:     { label: "In Progress",     className: "bg-violet-100 text-violet-700" },
  completed:       { label: "Completed",       className: "bg-emerald-100 text-emerald-700" },
  cancelled:       { label: "Cancelled",       className: "bg-slate-100 text-slate-600" },
  pending_payment: { label: "Awaiting Payment",className: "bg-amber-100 text-amber-700" },
  pending:         { label: "Pending",         className: "bg-orange-100 text-orange-700" },
  pending_assignment: { label: "Awaiting assign", className: "bg-sky-100 text-sky-800" },
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
  completed_at?: string | null;
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
type ViewSegment = "overview" | "attention" | "schedule";

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

export default function BookingsPage() {
  const searchParams = useSearchParams();
  const recurringIdFilter = (searchParams.get("recurring_id") ?? searchParams.get("recurringId") ?? "").trim();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [dateScope, setDateScope] = useState<DateScope>("all");
  const [attentionFilter, setAttentionFilter] = useState<AttentionFilter>("all");
  const [opsQuick, setOpsQuick] = useState<OpsQuick>("");
  const [dateFrom, setDateFrom] = useState(() => defaultBookingsMonthRange().startYmd);
  const [dateTo, setDateTo] = useState(() => defaultBookingsMonthRange().endYmd);
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
  const [exporting, setExporting] = useState(false);
  const [viewSegment, setViewSegment] = useState<ViewSegment>("overview");
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [restoringRecurring, setRestoringRecurring] = useState(false);

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

  const defaultMonthRange = useMemo(() => defaultBookingsMonthRange(), []);
  const hasCustomDateRange =
    dateFrom !== defaultMonthRange.startYmd || dateTo !== defaultMonthRange.endYmd;

  const listFilter = buildListFilter(dateScope, attentionFilter);
  const hasExtraFilters =
    !recurringIdFilter &&
    (dateScope !== "all" ||
      attentionFilter !== "all" ||
      opsQuick !== "" ||
      hasCustomDateRange ||
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
    if (dateFrom && dateFrom !== defaultMonthRange.startYmd) {
      chips.push({
        key: "from",
        label: `From ${dateFrom}`,
        clear: () => setDateFrom(defaultMonthRange.startYmd),
      });
    }
    if (dateTo && dateTo !== defaultMonthRange.endYmd) {
      chips.push({
        key: "to",
        label: `To ${dateTo}`,
        clear: () => setDateTo(defaultMonthRange.endYmd),
      });
    }
    if (serviceFilter !== "all") {
      const label = SERVICE_OPTIONS.find((o) => o.key === serviceFilter)?.label ?? serviceFilter;
      chips.push({ key: "service", label, clear: () => setServiceFilter("all") });
    }
    if (cityId !== "all") {
      const label = cities.find((c) => c.id === cityId)?.name ?? "City";
      chips.push({ key: "city", label, clear: () => setCityId("all") });
    }
    return chips;
  }, [attentionFilter, cities, cityId, dateFrom, dateScope, dateTo, defaultMonthRange, opsQuick, recurringIdFilter, serviceFilter]);

  function clearAllFilters() {
    const month = defaultBookingsMonthRange();
    setDateScope("all");
    setAttentionFilter("all");
    setOpsQuick("");
    setDateFrom(month.startYmd);
    setDateTo(month.endYmd);
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
    setViewSegment("overview");
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
    setViewSegment("attention");
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
    setViewSegment("attention");
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
    setViewSegment("schedule");
    scrollToBookingsTable();
  }

  function applyViewSegment(next: ViewSegment) {
    setViewSegment(next);
    if (next === "overview") {
      setAttentionFilter("all");
      setDateScope("all");
      setOpsQuick("");
    } else if (next === "attention") {
      setDateScope("all");
      setOpsQuick("");
      if (attentionFilter === "all") setAttentionFilter("unassigned");
    } else if (next === "schedule") {
      setAttentionFilter("all");
      setOpsQuick("");
      if (dateScope === "all") setDateScope("upcoming");
    }
    scrollToBookingsTable();
  }

  function toggleBookingSelection(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    setSelectedIds((prev) => {
      const allSelected = bookings.length > 0 && bookings.every((b) => prev.has(b.id));
      if (allSelected) return new Set();
      return new Set(bookings.map((b) => b.id));
    });
  }

  const totalBookingsActive =
    !recurringIdFilter && !hasExtraFilters && activeFilter === "all" && !debouncedSearch;

  const listQueryParams = useMemo(
    () => ({
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
    }),
    [
      activeFilter,
      cityId,
      dateFrom,
      dateTo,
      debouncedSearch,
      listFilter,
      opsQuick,
      page,
      pageSize,
      recurringIdFilter,
      serviceFilter,
    ],
  );

  const { data, loading, error, refetch } = useAdminData<AdminBookingsResponse>(
    "/api/admin/bookings",
    { params: listQueryParams },
  );

  useEffect(() => {
    if (!loading && data) setLastRefreshedAt(new Date());
  }, [loading, data]);

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
    pushAppToast(msg, ok ? "success" : "error");
  }

  async function handleRestoreRecurringAssignments() {
    if (restoringRecurring || loading) return;
    setRestoringRecurring(true);
    try {
      const res = await adminFetch<{
        ok?: boolean;
        updated?: number;
        skipped?: number;
        remaining?: number;
        plansUpdated?: number;
        error?: string;
      }>("/api/admin/bookings/restore-recurring-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok || !res.data?.ok) {
        showToast(res.data?.error ?? res.error ?? "Restore failed", false);
        return;
      }
      const updated = res.data.updated ?? 0;
      const remaining = res.data.remaining ?? 0;
      showToast(
        updated > 0
          ? `Assigned ${updated} recurring booking${updated === 1 ? "" : "s"}${remaining > 0 ? ` · ${remaining} still need a cleaner` : ""}`
          : remaining > 0
            ? `${remaining} recurring booking${remaining === 1 ? "" : "s"} still need a manual cleaner pick`
            : "All recurring bookings are assigned",
        updated > 0,
      );
      void refetch();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Restore failed", false);
    } finally {
      setRestoringRecurring(false);
    }
  }

  async function handleExport() {
    if (exporting || loading) return;
    setExporting(true);
    try {
      const { page: _page, ...exportParams } = listQueryParams;
      const rows = await fetchAllOfficeBookingsForExport(exportParams);
      if (rows.length === 0) {
        showToast("No bookings to export for the current filters", false);
        return;
      }
      const stamp = new Date().toISOString().slice(0, 10);
      downloadOfficeBookingsCsv(`bookings-${stamp}.csv`, buildOfficeBookingsListCsv(rows));
      showToast(`Exported ${rows.length} booking${rows.length === 1 ? "" : "s"}`, true);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Export failed", false);
    } finally {
      setExporting(false);
    }
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
  const attentionTotal = unassignedCount + overdueCount;
  const revenueTodayZar = data?.metrics?.revenueTodayZar ?? 0;

  const statusPillTabs = useMemo(
    () =>
      (["all", ...ALL_STATUSES] as const).map((s) => ({
        key: s,
        label: s === "all" ? "All" : (STATUS_MAP[s]?.label ?? s),
        count: counts[s] ?? 0,
      })),
    [counts],
  );

  const segmentTabs = useMemo(
    () =>
      [
        {
          key: "overview",
          title: "All bookings",
          subtitle: "Operations overview",
        },
        {
          key: "attention",
          title: attentionTotal === 1 ? "Needs attention" : "Need attention",
          subtitle: "Unassigned & SLA breaches",
          badge: attentionTotal > 0 ? attentionTotal : undefined,
          badgeTone: "warn" as const,
        },
        {
          key: "schedule",
          title: "Today & upcoming",
          subtitle: "By visit date",
        },
      ] satisfies Parameters<typeof OfficeZohoSegmentTabs>[0]["tabs"],
    [attentionTotal],
  );

  return (
    <div className="min-w-0 max-w-full space-y-5 overflow-x-hidden">
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

      {/* Header */}
      <OfficeZohoPageHeader
        title="Bookings"
        subtitle="Manage customer bookings, assignments, and dispatch."
        live
        actions={
          <>
            <Link
              href="/office/bookings/create"
              className="inline-flex items-center gap-2 rounded-md bg-[var(--sidebar-active)] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:brightness-95"
            >
              <Plus className="h-4 w-4" /> Create booking
            </Link>
            <OfficeZohoSecondaryButton disabled={exporting || loading} onClick={() => void handleExport()}>
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Export
            </OfficeZohoSecondaryButton>
            <OfficeZohoSecondaryButton onClick={() => void refetch()} disabled={loading}>
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              Refresh
            </OfficeZohoSecondaryButton>
          </>
        }
      />

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

      {/* Summary metrics — Zoho Books style */}
      <OfficeZohoMetricsRow
        meta={
          <>
            <p>
              List last refreshed
              {lastRefreshedAt
                ? ` on ${lastRefreshedAt.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}`
                : ""}
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="mt-1 font-semibold text-[--sidebar-active] hover:underline"
            >
              Refresh list
            </button>
          </>
        }
      >
        <OfficeZohoMetricCard
          icon={BookOpen}
          label="Total bookings"
          value={loading ? "—" : counts.all.toLocaleString("en-ZA")}
          onClick={applyTotalBookingsView}
          active={totalBookingsActive}
        />
        <OfficeZohoMetricCard
          icon={UserX}
          iconClassName="bg-orange-50 text-orange-600"
          label="Unassigned"
          value={loading ? "—" : unassignedCount.toLocaleString("en-ZA")}
          onClick={applyUnassignedView}
          active={attentionFilter === "unassigned"}
        />
        <OfficeZohoMetricCard
          icon={CalendarDays}
          iconClassName="bg-emerald-50 text-emerald-600"
          label="Completed today"
          value={loading ? "—" : completedTodayCount.toLocaleString("en-ZA")}
          onClick={applyCompletedTodayView}
          active={dateScope === "today" && activeFilter === "completed" && attentionFilter === "all"}
        />
      </OfficeZohoMetricsRow>

      {!loading && revenueTodayZar > 0 ? (
        <p className="text-xs text-slate-500">
          Revenue collected today:{" "}
          <span className="font-semibold tabular-nums text-slate-800">
            R {Math.round(revenueTodayZar).toLocaleString("en-ZA")}
          </span>
        </p>
      ) : null}

      {!loading && unassignedCount > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p>
            <span className="font-semibold">{unassignedCount.toLocaleString("en-ZA")} unassigned</span>
            {" — "}
            recurring visits often stall in <code className="rounded bg-amber-100 px-1 text-xs">pending_assignment</code> even
            when a continuity cleaner exists. Restore assigns them from plan history.
          </p>
          <OfficeZohoSecondaryButton
            disabled={restoringRecurring || loading}
            onClick={() => void handleRestoreRecurringAssignments()}
            className="shrink-0 border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
          >
            {restoringRecurring ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
            Assign recurring cleaners
          </OfficeZohoSecondaryButton>
        </div>
      ) : null}

      {/* Segment navigation */}
      <OfficeZohoSegmentTabs tabs={segmentTabs} activeKey={viewSegment} onChange={(k) => applyViewSegment(k as ViewSegment)} />

      {/* Status pill tabs + multi-select toggle */}
      <OfficeZohoPillTabs
        tabs={statusPillTabs}
        activeKey={activeFilter}
        onChange={setActiveFilter}
        trailing={
          <OfficeZohoToggle
            label="Multi-select"
            checked={multiSelectMode}
            onChange={(checked) => {
              setMultiSelectMode(checked);
              if (!checked) setSelectedIds(new Set());
            }}
          />
        }
      />

      {/* Table card */}
      <OfficeZohoTableShell>
        <div id="bookings-table" className="scroll-mt-4">
        {/* Search + filters */}
        <div className="space-y-3 border-b border-slate-200 bg-slate-50/40 px-4 py-3">
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
                <button
                  type="button"
                  onClick={() => void applySlaView()}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                    attentionFilter === "sla" ? "bg-red-600 text-white" : "text-slate-500 hover:bg-slate-100",
                  )}
                >
                  SLA breaches{overdueCount > 0 ? ` (${overdueCount})` : ""}
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

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                {multiSelectMode ? (
                  <th className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      checked={bookings.length > 0 && bookings.every((b) => selectedIds.has(b.id))}
                      onChange={toggleSelectAllVisible}
                      aria-label="Select all visible bookings"
                      className="h-4 w-4 rounded border-slate-300 text-[--sidebar-active] focus:ring-[--sidebar-active]"
                    />
                  </th>
                ) : null}
                {[
                  { label: "Booking", className: "" },
                  { label: "Customer", className: "" },
                  { label: "Service", className: "hidden md:table-cell" },
                  { label: "Date/Time", className: "" },
                  { label: "Assignment", className: "" },
                  { label: "Amount", className: "" },
                  { label: "Status", className: "" },
                  { label: "Actions", className: "" },
                ].map(({ label, className }) => (
                  <th
                    key={label}
                    className={cn(
                      "px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400",
                      className,
                    )}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <LoadingRows colSpan={multiSelectMode ? 9 : 8} />
              ) : bookings.length === 0 ? (
                <tr>
                  <td colSpan={multiSelectMode ? 9 : 8} className="py-12 text-center text-sm text-slate-400">
                    {error ? "Failed to load bookings." : "No bookings match your search."}
                  </td>
                </tr>
              ) : (
                bookings.map((b) => {
                  const statusKey = isAuthoritativeBookingCompleted({
                    status: b.status,
                    completed_at: b.completed_at,
                  })
                    ? "completed"
                    : (b.status ?? "pending").toLowerCase();
                  const s = STATUS_MAP[statusKey] ?? { label: b.status ?? "—", className: "bg-slate-100 text-slate-600" };
                  const assignment = getAssignment(b);
                  const isActing = actionLoading?.id === b.id;
                  const isCancelling = isActing && actionLoading?.action === "cancel";
                  const isDeleting = isActing && actionLoading?.action === "delete";
                  const teamAssignable = bookingSupportsTeamAssign(b);
                  const isSelected = selectedIds.has(b.id);

                  return (
                    <tr
                      key={b.id}
                      className={cn(
                        "group transition-colors hover:bg-slate-50/80",
                        isSelected && "bg-blue-50/40",
                      )}
                    >
                      {multiSelectMode ? (
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleBookingSelection(b.id)}
                            aria-label={`Select booking ${b.id.slice(0, 8)}`}
                            className="h-4 w-4 rounded border-slate-300 text-[--sidebar-active] focus:ring-[--sidebar-active]"
                          />
                        </td>
                      ) : null}
                      <td className="px-4 py-3">
                        <Link
                          href={`/office/bookings/${b.id}`}
                          className="text-xs font-mono font-bold text-blue-600 hover:underline"
                        >
                          {b.id.slice(0, 8).toUpperCase()}
                        </Link>
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
                        <div className="flex items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                          <Link
                            href={`/office/bookings/${b.id}`}
                            aria-label="View booking"
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Link>
                          {teamAssignable ? (
                            <button
                              type="button"
                              aria-label={b.team_id || b.team?.name ? "Change team" : "Assign team"}
                              onClick={() => setTeamAssignTarget(b)}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                            >
                              <Users className="h-3.5 w-3.5" />
                            </button>
                          ) : (
                            <Link
                              href={`/office/bookings/${b.id}?action=assign`}
                              aria-label="Assign cleaner"
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
                            >
                              <UserCheck className="h-3.5 w-3.5" />
                            </Link>
                          )}
                          <button
                            type="button"
                            aria-label="Cancel booking"
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
                              aria-label="Delete permanently"
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
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/40 px-4 py-3">
          <p className="text-xs text-slate-500">
            {loading
              ? "Loading…"
              : multiSelectMode && selectedIds.size > 0
                ? `${selectedIds.size} selected · Showing ${adjustedPagination.from}-${adjustedPagination.to} of ${adjustedPagination.total}`
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
      </OfficeZohoTableShell>
    </div>
  );
}
