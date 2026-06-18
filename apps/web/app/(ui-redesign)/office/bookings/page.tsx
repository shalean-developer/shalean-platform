"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Search,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  UserCheck,
  XCircle,
  RefreshCw,
  Loader2,
  AlertCircle,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminData, adminFetch } from "@/hooks/useAdminData";
import { AdminDashboardActionError, deleteBookingAdmin } from "@/lib/admin/dashboard";
import { OfficeDeleteBookingDialog } from "@/components/admin/office/OfficeDeleteBookingDialog";

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

function formatZar(cents: number | null, zar: number | null): string {
  const val = zar ?? (cents != null ? cents / 100 : null);
  if (val == null) return "—";
  return `R ${Math.round(val).toLocaleString("en-ZA")}`;
}

function getAssignment(row: BookingRow): string {
  if (row.team?.name) return row.team.name;
  if ((row.booking_cleaners ?? []).length > 0) {
    return row.booking_cleaners!.map((c) => c.full_name ?? "Cleaner").join(", ");
  }
  return "—";
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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [actionLoading, setActionLoading] = useState<{ id: string; action: "cancel" | "delete" } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BookingRow | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  useEffect(() => {
    const timer = globalThis.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 300);
    return () => globalThis.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const timer = globalThis.setTimeout(() => setPage(1), 0);
    return () => globalThis.clearTimeout(timer);
  }, [debouncedSearch, activeFilter, pageSize, recurringIdFilter]);

  const { data, loading, error, refetch } = useAdminData<AdminBookingsResponse>(
    "/api/admin/bookings",
    {
      params: {
        filter: "all",
        page: String(page),
        pageSize: String(pageSize),
        ...(activeFilter !== "all" ? { bookingStatus: activeFilter } : {}),
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
        ...(recurringIdFilter ? { recurring_id: recurringIdFilter } : {}),
      },
    },
  );

  const bookings = data?.bookings ?? [];
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
  const counts: Record<string, number> = { all: data?.statusCounts?.all ?? pagination.total };
  for (const s of ALL_STATUSES) counts[s] = data?.statusCounts?.[s] ?? 0;

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

  async function confirmDeleteBooking() {
    if (!deleteTarget) return;

    setActionLoading({ id: deleteTarget.id, action: "delete" });
    try {
      await deleteBookingAdmin(deleteTarget.id);
      setDeleteTarget(null);
      showToast("Booking deleted", true);
      if (bookings.length === 1 && page > 1) {
        setPage((p) => Math.max(1, p - 1));
      } else {
        void refetch();
      }
    } catch (e) {
      showToast(
        e instanceof AdminDashboardActionError || e instanceof Error
          ? e.message
          : "Failed to delete booking",
        false,
      );
    } finally {
      setActionLoading(null);
    }
  }

  const unassignedCount = data?.attention?.unassigned ?? 0;
  const overdueCount = data?.attention?.slaBreaches ?? 0;
  const completedTodayCount = data?.statusCounts?.completedToday ?? 0;

  return (
    <div className="space-y-5">
      <OfficeDeleteBookingDialog
        open={deleteTarget != null}
        booking={deleteTarget}
        busy={deleteTarget != null && actionLoading?.id === deleteTarget.id && actionLoading.action === "delete"}
        onOpenChange={(open) => {
          if (!open && !(deleteTarget && actionLoading?.id === deleteTarget.id && actionLoading.action === "delete")) {
            setDeleteTarget(null);
          }
        }}
        onConfirm={() => void confirmDeleteBooking()}
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
            sub: "All bookings",
            color: "text-slate-800",
          },
          {
            label: "Unassigned",
            value: loading ? "—" : unassignedCount,
            sub: "Need attention",
            color: "text-orange-600",
          },
          {
            label: "SLA breaches",
            value: loading ? "—" : overdueCount,
            sub: "Overdue dispatch",
            color: overdueCount > 0 ? "text-red-600" : "text-slate-400",
          },
          {
            label: "Completed (today)",
            value: loading ? "—" : completedTodayCount,
            sub: "Successfully done",
            color: "text-emerald-600",
          },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl bg-white border border-slate-100 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k.label}</p>
            <p className={cn("mt-1 text-2xl font-bold tabular-nums", k.color)}>{k.value}</p>
            <p className="text-xs text-slate-400">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Table card */}
      <div className="rounded-2xl bg-white border border-slate-100 shadow-sm">
        {/* Search + filters */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by ID, customer, address…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <button
            type="button"
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            <Calendar className="h-4 w-4" /> Date range
          </button>
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
                        <span
                          className={cn(
                            "block max-w-[150px] truncate text-xs font-medium",
                            assignment === "—" ? "text-orange-500" : "text-slate-700",
                          )}
                          title={assignment}
                        >
                          {assignment}
                        </span>
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
                          <a
                            href={`/office/bookings/${b.id}?action=assign`}
                            title="Assign cleaner"
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
                          >
                            <UserCheck className="h-3.5 w-3.5" />
                          </a>
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
                          <button
                            type="button"
                            title="Delete permanently"
                            disabled={isActing}
                            onClick={() => setDeleteTarget(b)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-700 transition-colors disabled:opacity-30"
                          >
                            {isDeleting ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </button>
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
              : `Showing ${pagination.from}-${pagination.to} of ${pagination.total} bookings`}
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
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <button
              type="button"
              disabled={loading || !pagination.hasPreviousPage}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Prev
            </button>
            <button
              type="button"
              disabled={loading || !pagination.hasNextPage}
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
