"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, Fragment } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { persistLastOpsFilter, readLastOpsFilter } from "@/lib/admin/lastOpsFilter";
import { emitAdminToast } from "@/lib/admin/toastBus";
import { todayYmdJohannesburg } from "@/lib/booking/dateInJohannesburg";
import { AdminAssignForm, type CleanerOption } from "@/components/admin/AdminAssignForm";
import BookingActionsDropdown from "@/components/admin/BookingActionsDropdown";
import BookingDetailsSheet from "@/components/admin/BookingDetailsSheet";
import {
  rowMatchesAttentionFilter,
  sortRowsForAttentionQueue,
  type AttentionQueueFilter,
} from "@/lib/admin/opsSnapshot";
import { assignmentSourceLabel } from "@/lib/admin/assignmentDisplay";
import { metricAttemptBucket } from "@/lib/dispatch/dispatchMetricContext";

type BookingRow = {
  id: string;
  customer_name: string | null;
  customer_email: string | null;
  service: string | null;
  date: string | null;
  time: string | null;
  location: string | null;
  total_paid_zar: number | null;
  amount_paid_cents: number | null;
  cleaner_payout_cents?: number | null;
  cleaner_bonus_cents?: number | null;
  company_revenue_cents?: number | null;
  payout_percentage?: number | null;
  payout_type?: string | null;
  is_test?: boolean | null;
  status: string | null;
  dispatch_status: "searching" | "offered" | "assigned" | "failed" | "no_cleaner" | "unassignable" | null;
  surge_multiplier?: number | null;
  surge_reason?: string | null;
  user_id: string | null;
  cleaner_id: string | null;
  selected_cleaner_id?: string | null;
  assignment_type?: string | null;
  fallback_reason?: string | null;
  attempted_cleaner_id?: string | null;
  became_pending_at?: string | null;
  assigned_at: string | null;
  en_route_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  paystack_reference: string;
  duration_minutes?: number | null;
  dispatch_attempt_count?: number | null;
  payment_needs_follow_up?: boolean | null;
  payment_link_send_count?: number | null;
  payment_conversion_seconds?: number | null;
  payment_conversion_bucket?: string | null;
};

function dispatchStateLabel(dispatchStatus: BookingRow["dispatch_status"], status: string | null): string {
  const ds = String(dispatchStatus ?? "").toLowerCase();
  if (ds === "searching") return "Searching for cleaner...";
  if (ds === "offered") return "Dispatching to 3 cleaners...";
  if (ds === "assigned") return "Assigned";
  if (ds === "failed") return "Failed";
  if (ds === "no_cleaner") return "No cleaner (area)";
  if (ds === "unassignable") return "Unassignable — manual dispatch";
  const s = String(status ?? "").toLowerCase();
  if (s === "assigned") return "Assigned";
  return status ?? "—";
}

type ToastState = { kind: "success" | "error" | "info"; text: string } | null;
type CityOption = { id: string; name: string; is_active: boolean };

function cleanerDisplayName(cleanerId: string | null, cleaners: CleanerOption[]): string | null {
  if (!cleanerId) return null;
  const hit = cleaners.find((c) => c.id === cleanerId);
  return hit?.full_name ?? cleanerId;
}

function cleanerSelectEmptyLabel(r: BookingRow): string {
  const st = (r.status ?? "").toLowerCase();
  const ds = (r.dispatch_status ?? "").toLowerCase();
  if (!r.cleaner_id && st === "pending" && ds === "searching") return "Assigning…";
  return "Unassigned";
}

type FailedJob = {
  id: string;
  type: string;
  created_at: string;
  attempts: number | null;
  payload: unknown;
};

type Metrics = {
  totalBookingsToday: number;
  revenueTodayZar: number;
  averageOrderValueTodayZar: number;
  repeatCustomerPercent: number;
  repeatBookingRatePercent?: number;
  revenuePerCustomerZar?: number;
  missingUserIdCount: number;
  failedJobsCount: number;
  vipDistribution?: {
    regular: number;
    silver: number;
    gold: number;
    platinum: number;
  };
  topCustomers?: { email: string; spendZar: number; bookings: number }[];
  demandOpenBookings?: number;
  supplyAvailableCleaners?: number;
  liveSurgeMultiplier?: number;
  slaBreachMinutes?: number;
  paymentLinkChannelStats?: {
    sample_size: number;
    whatsapp_success_rate: number | null;
    sms_fallback_rate: number | null;
    email_only_rate: number | null;
  };
};

type AdminRouteStop = {
  id: string;
  time: string;
  service: string | null;
  locationLabel: string | null;
};

type AdminRouteRow = {
  cleaner: { id: string; fullName: string | null; isAvailable: boolean | null; status: string | null };
  schedule: {
    jobs: AdminRouteStop[];
  };
};

function zar(r: BookingRow): number {
  if (typeof r.total_paid_zar === "number") return r.total_paid_zar;
  return Math.round((r.amount_paid_cents ?? 0) / 100);
}

function centsToZar(cents: number | null | undefined): number | null {
  if (cents == null || !Number.isFinite(Number(cents))) return null;
  return Math.round(Number(cents) / 100);
}

function formatWhen(date: string | null, time: string | null): string {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return "—";
  const [y, m, d] = date.split("-").map(Number);
  const label = new Date(y, m - 1, d).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return time ? `${label} ${time}` : label;
}

function parseBookingDateTime(date: string | null, time: string | null): Date | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const safeTime = time && /^\d{2}:\d{2}/.test(time) ? `${time.slice(0, 5)}:00` : "00:00:00";
  return new Date(`${date}T${safeTime}+02:00`);
}

function startsInMinutes(date: string | null, time: string | null): number | null {
  const dt = parseBookingDateTime(date, time);
  if (!dt) return null;
  return Math.round((dt.getTime() - Date.now()) / (60 * 1000));
}

function formatStartsIn(mins: number | null): string {
  if (mins == null) return "—";
  if (mins < 0) {
    const a = Math.abs(mins);
    if (a < 60) return `${a}m ago`;
    return `${Math.floor(a / 60)}h ${a % 60}m ago`;
  }
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function startsInClass(mins: number | null): string {
  if (mins == null) return "text-zinc-600 dark:text-zinc-400";
  if (mins >= 0 && mins < 60) return "font-semibold text-red-700 dark:text-red-300";
  if (mins >= 0 && mins < 180) return "font-semibold text-orange-700 dark:text-orange-300";
  return "text-zinc-700 dark:text-zinc-300";
}

function attentionKeyFromAction(
  f:
    | "all"
    | "unassignable"
    | "sla"
    | "unassigned"
    | "payment_failed"
    | "starting_soon_without_cleaner"
    | "needs_follow_up",
): AttentionQueueFilter | null {
  if (f === "unassignable") return "unassignable";
  if (f === "sla") return "sla";
  if (f === "unassigned") return "unassigned";
  if (f === "starting_soon_without_cleaner") return "starting-soon";
  // `payment_failed`, `needs_follow_up`, `all` — custom row filters, not attention-queue keys
  return null;
}

function attentionUrlValue(key: AttentionQueueFilter): string {
  return key === "starting-soon" ? "starting-soon" : key;
}

function adminRowFlags(r: BookingRow, today: string) {
  const cents = r.amount_paid_cents ?? 0;
  const tzar = r.total_paid_zar ?? 0;
  const paymentMissing = cents <= 0 && tzar <= 0;
  const st = (r.status ?? "").toLowerCase();
  const d = r.date && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : null;
  const active = st === "pending" || st === "assigned" || st === "in_progress";
  const statusInconsistent = active && d !== null && d < today;
  const missingEmail = !r.customer_email?.trim();
  return { paymentMissing, statusInconsistent, missingEmail };
}

function rowHighlightClass(r: BookingRow, today: string): string {
  const f = adminRowFlags(r, today);
  if (f.paymentMissing) return "bg-red-50/90 dark:bg-red-950/30";
  if (f.statusInconsistent) return "bg-orange-50/85 dark:bg-orange-950/25";
  if (r.user_id == null) return "bg-amber-50/85 dark:bg-amber-950/25";
  if (f.missingEmail) return "bg-rose-50/80 dark:bg-rose-950/20";
  return "";
}

function VipDistributionCard({
  dist,
}: {
  dist?: Metrics["vipDistribution"];
}) {
  if (!dist) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-500 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        VIP distribution loads after migration (tier column).
      </div>
    );
  }
  const entries = [
    { key: "regular", label: "Regular", n: dist.regular, className: "bg-zinc-400" },
    { key: "silver", label: "Silver", n: dist.silver, className: "bg-zinc-500" },
    { key: "gold", label: "Gold", n: dist.gold, className: "bg-amber-500" },
    { key: "platinum", label: "Platinum", n: dist.platinum, className: "bg-violet-600" },
  ];
  const total = entries.reduce((s, e) => s + e.n, 0);
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">VIP tiers</p>
      <p className="mt-1 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
        Live from <code className="rounded bg-zinc-100 px-1 font-mono dark:bg-zinc-800">user_profiles.tier</code> — all
        profiles, not bookings. Clearing bookings does not change these counts.
      </p>
      <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        {total > 0
          ? entries.map((e) => (
              <div
                key={e.key}
                className={e.className}
                style={{ width: `${(e.n / total) * 100}%` }}
                title={`${e.label}: ${e.n}`}
              />
            ))
          : null}
      </div>
      <ul className="mt-3 space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
        {entries.map((e) => (
          <li key={e.key} className="flex justify-between gap-2">
            <span>{e.label}</span>
            <span className="tabular-nums font-medium text-zinc-900 dark:text-zinc-100">{e.n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function AdminBookingsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [filter, setFilter] = useState<"all" | "today" | "upcoming" | "completed">("all");
  const [actionFilter, setActionFilter] = useState<
    | "all"
    | "unassignable"
    | "sla"
    | "unassigned"
    | "payment_failed"
    | "starting_soon_without_cleaner"
    | "needs_follow_up"
  >("all");
  const [rows, setRows] = useState<BookingRow[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [failedJobs, setFailedJobs] = useState<FailedJob[]>([]);
  const [cleaners, setCleaners] = useState<CleanerOption[]>([]);
  const [assignBookingId, setAssignBookingId] = useState<string | null>(null);
  const [retryDispatchBookingId, setRetryDispatchBookingId] = useState<string | null>(null);
  const openAssignHandledRef = useRef<string | null>(null);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<ToastState>(null);
  const [cities, setCities] = useState<CityOption[]>([]);
  const [selectedCityId, setSelectedCityId] = useState<string>("all");
  const [routeRows, setRouteRows] = useState<AdminRouteRow[]>([]);
  const [routeMetrics, setRouteMetrics] = useState<{ travelTimeSavedMinutes: number; jobsPerCleanerPerDay: number } | null>(
    null,
  );
  const [bookingStatusFilter, setBookingStatusFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [clearingFailedJobs, setClearingFailedJobs] = useState(false);

  const today = useMemo(() => todayYmdJohannesburg(), []);

  const sortedCleaners = useMemo(
    () =>
      [...cleaners].sort((a, b) => {
        const activeA = (a.status ?? "").toLowerCase() === "available" ? 1 : 0;
        const activeB = (b.status ?? "").toLowerCase() === "available" ? 1 : 0;
        if (activeA !== activeB) return activeB - activeA;
        const ratingA = typeof a.rating === "number" ? a.rating : -1;
        const ratingB = typeof b.rating === "number" ? b.rating : -1;
        if (ratingA !== ratingB) return ratingB - ratingA;
        return (a.jobs_completed ?? 0) - (b.jobs_completed ?? 0);
      }),
    [cleaners],
  );

  const setOpsAttentionFilter = useCallback(
    (
      next:
        | "all"
        | "unassignable"
        | "sla"
        | "unassigned"
        | "payment_failed"
        | "starting_soon_without_cleaner"
        | "needs_follow_up",
    ) => {
      setActionFilter(next);
      const params = new URLSearchParams(searchParams.toString());
      params.delete("openAssign");
      const opsValues = new Set(["unassignable", "sla", "unassigned", "starting-soon", "follow-up"]);
      const cur = params.get("filter");

      if (next === "needs_follow_up") {
        params.set("filter", "follow-up");
        persistLastOpsFilter("follow-up");
      } else if (next === "all") {
        if (cur && opsValues.has(cur)) {
          params.delete("filter");
          persistLastOpsFilter(null);
        }
      } else {
        const key = attentionKeyFromAction(next);
        if (key) {
          const fv = attentionUrlValue(key);
          params.set("filter", fv);
          persistLastOpsFilter(fv);
        } else if (cur && opsValues.has(cur)) {
          params.delete("filter");
          persistLastOpsFilter(null);
        }
      }
      const q = params.toString();
      router.replace(q ? `${pathname}?${q}` : pathname);
    },
    [pathname, router, searchParams],
  );

  /** When URL has no `filter`, re-apply last ops queue filter (other query params preserved). */
  useEffect(() => {
    if (searchParams.has("filter")) return;
    const stored = readLastOpsFilter();
    if (!stored) return;
    const p = new URLSearchParams(searchParams.toString());
    p.set("filter", stored);
    const q = p.toString();
    router.replace(q ? `${pathname}?${q}` : pathname);
  }, [pathname, router, searchParams]);

  useEffect(() => {
    const f = searchParams.get("filter");
    if (!f) return;
    const ops = new Set(["unassignable", "sla", "unassigned", "starting-soon", "follow-up"]);
    const date = new Set(["today", "upcoming", "completed", "all"]);
    if (ops.has(f)) {
      if (f === "starting-soon") setActionFilter("starting_soon_without_cleaner");
      else if (f === "follow-up") setActionFilter("needs_follow_up");
      else setActionFilter(f as "unassignable" | "sla" | "unassigned");
      persistLastOpsFilter(f);
      return;
    }
    if (date.has(f)) {
      setFilter(f as "all" | "today" | "upcoming" | "completed");
    }
  }, [searchParams]);

  const load = useCallback(async () => {
    setLoading(true);
    const sb = getSupabaseBrowser();
    if (!sb) {
      setError("Supabase is not configured.");
      setLoading(false);
      return;
    }
    const {
      data: { user },
      error: userErr,
    } = await sb.auth.getUser();
    if (userErr || !user?.email) {
      setError("Please sign in as an admin.");
      setLoading(false);
      return;
    }

    const { data: sessionData } = await sb.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError("Please sign in as an admin.");
      setLoading(false);
      return;
    }

    const qs = new URLSearchParams();
    if (actionFilter === "needs_follow_up") qs.set("filter", "follow-up");
    else if (filter !== "all") qs.set("filter", filter);
    if (selectedCityId !== "all") qs.set("cityId", selectedCityId);
    if (bookingStatusFilter !== "all") qs.set("bookingStatus", bookingStatusFilter);
    if (dateFrom.trim()) qs.set("from", dateFrom.trim());
    if (dateTo.trim()) qs.set("to", dateTo.trim());
    const q = qs.toString() ? `?${qs.toString()}` : "";
    const res = await fetch(`/api/admin/bookings${q}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const ct = res.headers.get("content-type") ?? "";
    if (!res.ok) {
      let errMsg = "Could not load admin data.";
      if (ct.includes("application/json")) {
        try {
          const json = (await res.json()) as { error?: string };
          errMsg = json.error ?? errMsg;
        } catch {
          errMsg = res.status === 401 || res.status === 403 ? "Access denied." : errMsg;
        }
      } else {
        errMsg = (await res.text()) || errMsg;
      }
      setError(errMsg);
      setRows([]);
      setMetrics(null);
      setFailedJobs([]);
      setLoading(false);
      return;
    }

    const json = (await res.json()) as {
      bookings?: BookingRow[];
      metrics?: Metrics;
      failedJobs?: FailedJob[];
      cities?: CityOption[];
      selectedCityId?: string | null;
      error?: string;
    };

    setError(null);
    setRows(json.bookings ?? []);
    setMetrics(json.metrics ?? null);
    setFailedJobs(json.failedJobs ?? []);
    setCities(json.cities ?? []);
    if (json.selectedCityId && selectedCityId === "all") {
      setSelectedCityId(json.selectedCityId);
    }

    const cr = await fetch("/api/admin/cleaners", { headers: { Authorization: `Bearer ${token}` } });
    if (cr.ok) {
      const cj = (await cr.json()) as { cleaners?: CleanerOption[] };
      setCleaners(cj.cleaners ?? []);
    }
    const rrQs = new URLSearchParams({ date: today });
    if (selectedCityId !== "all") rrQs.set("cityId", selectedCityId);
    const rr = await fetch(`/api/admin/routes?${rrQs.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (rr.ok) {
      const rj = (await rr.json()) as {
        routes?: AdminRouteRow[];
        metrics?: { travelTimeSavedMinutes?: number; jobsPerCleanerPerDay?: number };
      };
      setRouteRows(rj.routes ?? []);
      setRouteMetrics({
        travelTimeSavedMinutes: Number(rj.metrics?.travelTimeSavedMinutes ?? 0),
        jobsPerCleanerPerDay: Number(rj.metrics?.jobsPerCleanerPerDay ?? 0),
      });
    }

    setLoading(false);
  }, [filter, actionFilter, today, selectedCityId, bookingStatusFilter, dateFrom, dateTo]);

  const retryDispatchFailed = useCallback(
    async (bookingId: string) => {
      setRetryDispatchBookingId(bookingId);
      try {
        const sb = getSupabaseBrowser();
        const token = (await sb?.auth.getSession())?.data.session?.access_token;
        if (!token) {
          emitAdminToast("Please sign in.", "error");
          return;
        }
        const res = await fetch(`/api/admin/bookings/${encodeURIComponent(bookingId)}/retry-dispatch`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          message?: string | null;
        };
        if (!res.ok) {
          emitAdminToast(json.error ?? "Retry dispatch failed.", "error");
          return;
        }
        if (json.ok) {
          emitAdminToast("Dispatch retried successfully.", "success");
        } else {
          emitAdminToast(json.message ?? json.error ?? "Dispatch could not complete.", "error");
        }
        await load();
      } finally {
        setRetryDispatchBookingId(null);
      }
    },
    [load],
  );

  const clearFailedInsertQueue = useCallback(async () => {
    const sb = getSupabaseBrowser();
    if (!sb) {
      setToast({ kind: "error", text: "Supabase is not configured." });
      return;
    }
    const { data: sessionData } = await sb.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setToast({ kind: "error", text: "Please sign in again." });
      return;
    }
    setClearingFailedJobs(true);
    try {
      const res = await fetch("/api/admin/cleanup-logs", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ targets: ["failed_jobs_booking_insert"] }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        deleted?: { failed_jobs_booking_insert?: number };
        errors?: Record<string, string>;
      };
      if (!res.ok) {
        setToast({ kind: "error", text: json.error ?? "Could not clear failed insert queue." });
        return;
      }
      if (json.errors?.failed_jobs_booking_insert) {
        setToast({ kind: "error", text: json.errors.failed_jobs_booking_insert });
        return;
      }
      const n = json.deleted?.failed_jobs_booking_insert ?? 0;
      setToast({ kind: "success", text: n > 0 ? `Removed ${n} failed insert row(s).` : "Queue was already empty." });
      await load();
    } finally {
      setClearingFailedJobs(false);
    }
  }, [load]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patchBookingStatus(id: string, nextStatus: string) {
    const sb = getSupabaseBrowser();
    const token = (await sb?.auth.getSession())?.data.session?.access_token;
    if (!token) {
      emitAdminToast("Session expired.", "error");
      return;
    }
    const bodyStatus = nextStatus === "confirmed" ? "assigned" : nextStatus;
    const res = await fetch(`/api/admin/bookings/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ status: bodyStatus }),
    });
    if (!res.ok) {
      const j = (await res.json()) as { error?: string };
      emitAdminToast(j.error ?? "Could not update status", "error");
      return;
    }
    emitAdminToast("Status updated", "success");
    setRows((cur) => cur.map((row) => (row.id === id ? { ...row, status: bodyStatus } : row)));
  }

  async function patchBookingCleaner(id: string, cleanerId: string | null) {
    const sb = getSupabaseBrowser();
    const token = (await sb?.auth.getSession())?.data.session?.access_token;
    if (!token) {
      emitAdminToast("Session expired.", "error");
      return;
    }
    const res = await fetch(`/api/admin/bookings/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ cleaner_id: cleanerId }),
    });
    if (!res.ok) {
      const j = (await res.json()) as { error?: string };
      emitAdminToast(j.error ?? "Could not assign cleaner", "error");
      return;
    }
    emitAdminToast("Cleaner updated", "success");
    setRows((cur) => cur.map((row) => (row.id === id ? { ...row, cleaner_id: cleanerId } : row)));
  }

  useEffect(() => {
    const bookingId = searchParams.get("bookingId");
    if (bookingId) setSelectedBookingId(bookingId);
  }, [searchParams]);

  useEffect(() => {
    const sb = getSupabaseBrowser();
    if (!sb) return;

    let bookingsChannel: ReturnType<typeof sb.channel> | null = null;
    let cleanersChannel: ReturnType<typeof sb.channel> | null = null;

    const connect = () => {
      bookingsChannel = sb
        .channel("admin-bookings-realtime")
        .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => {
          void load();
        })
        .subscribe();

      cleanersChannel = sb
        .channel("admin-cleaners-realtime")
        .on("postgres_changes", { event: "*", schema: "public", table: "cleaners" }, () => {
          void load();
        })
        .subscribe();
    };

    if (!document.hidden) {
      connect();
    }

    const onVisibility = () => {
      if (document.hidden) {
        if (bookingsChannel) void sb.removeChannel(bookingsChannel);
        if (cleanersChannel) void sb.removeChannel(cleanersChannel);
        bookingsChannel = null;
        cleanersChannel = null;
        return;
      }
      if (!bookingsChannel && !cleanersChannel) {
        connect();
        void load();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    const fallbackPoll = window.setInterval(() => {
      if (!document.hidden) void load();
    }, 15_000);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(fallbackPoll);
      if (bookingsChannel) void sb.removeChannel(bookingsChannel);
      if (cleanersChannel) void sb.removeChannel(cleanersChannel);
    };
  }, [load]);

  const openDetails = (id: string) => {
    setSelectedBookingId(id);
    const params = new URLSearchParams(searchParams.toString());
    params.set("bookingId", id);
    router.replace(`${pathname}?${params.toString()}`);
  };

  const closeDetails = () => {
    setSelectedBookingId(null);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("bookingId");
    const q = params.toString();
    router.replace(q ? `${pathname}?${q}` : pathname);
  };

  const actionRequiredCounts = useMemo(() => {
    const slaM = metrics?.slaBreachMinutes ?? 10;
    const now = Date.now();
    let unassignable = 0;
    let sla = 0;
    let unassigned = 0;
    let failedPayments = 0;
    let startingSoonWithoutCleaner = 0;
    let needsFollowUp = 0;
    for (const r of rows) {
      if (rowMatchesAttentionFilter(r, "unassignable", now, slaM)) unassignable++;
      if (rowMatchesAttentionFilter(r, "sla", now, slaM)) sla++;
      if (rowMatchesAttentionFilter(r, "unassigned", now, slaM)) unassigned++;
      if (rowMatchesAttentionFilter(r, "starting-soon", now, slaM)) startingSoonWithoutCleaner++;
      if (Boolean(r.payment_needs_follow_up)) needsFollowUp++;
      const f = adminRowFlags(r, today);
      if (f.paymentMissing) failedPayments++;
    }
    return { unassignable, sla, unassigned, failedPayments, startingSoonWithoutCleaner, needsFollowUp };
  }, [rows, today, metrics?.slaBreachMinutes]);

  const visibleRows = useMemo(() => {
    const slaM = metrics?.slaBreachMinutes ?? 10;
    const now = Date.now();
    const key = attentionKeyFromAction(actionFilter);
    if (key) {
      const filtered = rows.filter((r) => rowMatchesAttentionFilter(r, key, now, slaM));
      return sortRowsForAttentionQueue(filtered, key, now, slaM);
    }
    if (actionFilter === "payment_failed") {
      return rows.filter((r) => adminRowFlags(r, today).paymentMissing);
    }
    if (actionFilter === "needs_follow_up") {
      return rows;
    }
    return rows;
  }, [rows, actionFilter, today, metrics?.slaBreachMinutes]);

  const firstAttentionRowId = useMemo(() => {
    if (!attentionKeyFromAction(actionFilter)) return null;
    return visibleRows[0]?.id ?? null;
  }, [visibleRows, actionFilter]);

  useEffect(() => {
    if (searchParams.get("openAssign") !== "1") {
      openAssignHandledRef.current = null;
      return;
    }
    if (loading) return;

    const stripOpenAssign = () => {
      const p = new URLSearchParams(searchParams.toString());
      if (!p.has("openAssign")) return;
      p.delete("openAssign");
      const q = p.toString();
      router.replace(q ? `${pathname}?${q}` : pathname);
    };

    if (!firstAttentionRowId) {
      stripOpenAssign();
      return;
    }

    const dedupeKey = `${firstAttentionRowId}:${searchParams.get("filter") ?? ""}`;
    if (openAssignHandledRef.current === dedupeKey) return;
    openAssignHandledRef.current = dedupeKey;

    emitAdminToast("Opening assign…", "info");
    setAssignBookingId(firstAttentionRowId);
    stripOpenAssign();
    window.setTimeout(() => {
      emitAdminToast("Queue ready — pick a cleaner, then Apply", "success");
    }, 380);
  }, [loading, searchParams, firstAttentionRowId, pathname, router]);

  if (loading && !metrics) {
    return (
      <div className="min-h-dvh bg-zinc-100 px-4 py-10 dark:bg-zinc-950">
        <p className="text-center text-sm text-zinc-500">Loading admin…</p>
      </div>
    );
  }

  if (error) {
    const isForbidden =
      error.includes("Forbidden") || error.includes("Access denied") || error.includes("Unauthorized");
    return (
      <div className="min-h-dvh bg-zinc-100 px-4 py-10 dark:bg-zinc-950">
        <div className="mx-auto max-w-lg rounded-2xl border border-red-200 bg-white p-6 dark:border-red-900 dark:bg-zinc-900">
          {isForbidden ? (
            <>
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Admin access required</h2>
              <p className="mt-2 text-sm text-red-800 dark:text-red-200">{error}</p>
              <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
                Your signed-in email must be listed in{" "}
                <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">ADMIN_EMAILS</code>{" "}
                for this environment.
              </p>
            </>
          ) : (
            <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
          )}
          <Link href="/" className="mt-4 inline-block text-sm font-medium text-emerald-700 dark:text-emerald-400">
            Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <main className="mx-auto max-w-6xl">
        {metrics ? (
          <>
            <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <MetricCard label="Bookings today" value={String(metrics.totalBookingsToday)} />
              <MetricCard
                label="Revenue today"
                value={`R ${metrics.revenueTodayZar.toLocaleString("en-ZA")}`}
              />
              <MetricCard
                label="Avg order (today)"
                value={`R ${metrics.averageOrderValueTodayZar.toLocaleString("en-ZA")}`}
              />
              <MetricCard label="Repeat booking rate" value={`${metrics.repeatBookingRatePercent ?? metrics.repeatCustomerPercent}%`} />
            </div>
            {metrics.paymentLinkChannelStats && metrics.paymentLinkChannelStats.sample_size > 0 ? (
              <div className="mb-6 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Payment link channels</p>
                <p className="mt-1 text-xs tabular-nums">
                  <span className="font-mono">n={metrics.paymentLinkChannelStats.sample_size}</span>
                  {" · "}
                  WA success{" "}
                  {metrics.paymentLinkChannelStats.whatsapp_success_rate != null
                    ? `${(metrics.paymentLinkChannelStats.whatsapp_success_rate * 100).toFixed(1)}%`
                    : "—"}
                  {" · "}
                  SMS after WA fail{" "}
                  {metrics.paymentLinkChannelStats.sms_fallback_rate != null
                    ? `${(metrics.paymentLinkChannelStats.sms_fallback_rate * 100).toFixed(1)}%`
                    : "—"}
                  {" · "}
                  Email-only{" "}
                  {metrics.paymentLinkChannelStats.email_only_rate != null
                    ? `${(metrics.paymentLinkChannelStats.email_only_rate * 100).toFixed(1)}%`
                    : "—"}
                </p>
                <p className="mt-1 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                  Latest <code className="rounded bg-zinc-100 px-1 font-mono dark:bg-zinc-800">payment_link_delivery</code>{" "}
                  per booking in this fetch (not time-series).
                </p>
              </div>
            ) : null}
            <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Revenue / customer
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                  R {(metrics.revenuePerCustomerZar ?? 0).toLocaleString("en-ZA")}
                </p>
                <p className="mt-1 text-xs text-zinc-500">Mean spend per distinct customer email (loaded batch).</p>
              </div>
              <VipDistributionCard dist={metrics.vipDistribution} />
              <BookingFunnelCard />
            </div>
            <div className="mb-6 rounded-xl border border-zinc-200 bg-white p-4 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <p className="font-semibold text-zinc-900 dark:text-zinc-100">Demand vs Supply</p>
              <p className="mt-1 text-zinc-600 dark:text-zinc-300">
                Demand: <span className="font-medium">{metrics.demandOpenBookings ?? 0}</span>
                {" · "}
                Supply: <span className="font-medium">{metrics.supplyAvailableCleaners ?? 0}</span>
                {" · "}
                Live surge: <span className="font-medium">x{(metrics.liveSurgeMultiplier ?? 1).toFixed(1)}</span>
              </p>
            </div>
            {metrics.topCustomers && metrics.topCustomers.length > 0 ? (
              <div className="mb-6 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <div className="border-b border-zinc-100 bg-zinc-50 px-4 py-2 dark:border-zinc-800 dark:bg-zinc-900/80">
                  <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Top customers (by spend)</h2>
                </div>
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-zinc-100 text-xs uppercase text-zinc-500 dark:border-zinc-800">
                    <tr>
                      <th className="px-4 py-2">Email</th>
                      <th className="px-4 py-2">Bookings</th>
                      <th className="px-4 py-2">Spend</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {metrics.topCustomers.map((c) => (
                      <tr key={c.email}>
                        <td className="max-w-[220px] truncate px-4 py-2 font-mono text-xs text-zinc-800 dark:text-zinc-200">
                          {c.email}
                        </td>
                        <td className="px-4 py-2 tabular-nums">{c.bookings}</td>
                        <td className="px-4 py-2 font-medium tabular-nums">
                          R {c.spendZar.toLocaleString("en-ZA")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </>
        ) : null}

        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
          <span>
            <strong>{metrics?.missingUserIdCount ?? 0}</strong> bookings missing user link ·{" "}
            <strong>{metrics?.failedJobsCount ?? failedJobs.length}</strong> Paystack insert retry job(s) (
            <code className="rounded bg-amber-100/80 px-1 font-mono text-[11px] dark:bg-amber-900/50">failed_jobs</code>)
          </span>
        </div>

        {failedJobs.length > 0 ? (
          <div className="mb-6 overflow-hidden rounded-xl border border-red-200 bg-white dark:border-red-900/50 dark:bg-zinc-900">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-red-100 bg-red-50 px-4 py-2 dark:border-red-900/40 dark:bg-red-950/50">
              <h2 className="text-sm font-semibold text-red-900 dark:text-red-100">Failed booking inserts</h2>
              <button
                type="button"
                onClick={() => void clearFailedInsertQueue()}
                disabled={clearingFailedJobs}
                className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-900 shadow-sm hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100 dark:hover:bg-red-900/50"
              >
                {clearingFailedJobs ? "Clearing…" : "Clear queue"}
              </button>
            </div>
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {failedJobs.map((j) => (
                <li key={j.id} className="px-4 py-2 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                  {j.id} · attempts {j.attempts ?? 0} · {new Date(j.created_at).toLocaleString("en-ZA")}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mb-6 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Action Required</h2>
            {actionFilter !== "all" ? (
              <button
                type="button"
                onClick={() => setOpsAttentionFilter("all")}
                className="text-xs font-medium text-emerald-700 dark:text-emerald-400"
              >
                Clear filter
              </button>
            ) : null}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <ActionCard
              title="Unassignable"
              count={actionRequiredCounts.unassignable}
              tone="red"
              active={actionFilter === "unassignable"}
              onClick={() => setOpsAttentionFilter("unassignable")}
            />
            <ActionCard
              title="SLA breach"
              count={actionRequiredCounts.sla}
              tone="red"
              active={actionFilter === "sla"}
              onClick={() => setOpsAttentionFilter("sla")}
            />
            <ActionCard
              title="Unassigned (paid)"
              count={actionRequiredCounts.unassigned}
              tone="amber"
              active={actionFilter === "unassigned"}
              onClick={() => setOpsAttentionFilter("unassigned")}
            />
            <ActionCard
              title="Starts < 2h, no cleaner"
              count={actionRequiredCounts.startingSoonWithoutCleaner}
              tone="orange"
              active={actionFilter === "starting_soon_without_cleaner"}
              onClick={() => setOpsAttentionFilter("starting_soon_without_cleaner")}
            />
            <ActionCard
              title="Failed payments"
              count={actionRequiredCounts.failedPayments}
              tone="amber"
              active={actionFilter === "payment_failed"}
              onClick={() => setOpsAttentionFilter("payment_failed")}
            />
            <ActionCard
              title="Needs follow-up"
              count={actionRequiredCounts.needsFollowUp}
              tone="red"
              active={actionFilter === "needs_follow_up"}
              onClick={() => setOpsAttentionFilter("needs_follow_up")}
            />
          </div>
        </div>
        <div className="mb-6 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Cleaner routes today</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Travel time saved: {routeMetrics?.travelTimeSavedMinutes ?? 0}m · Jobs/cleaner/day:{" "}
              {routeMetrics?.jobsPerCleanerPerDay ?? 0}
            </p>
          </div>
          <div className="mt-3 space-y-3">
            {routeRows.length === 0 ? (
              <p className="text-sm text-zinc-500">No route data available yet.</p>
            ) : (
              routeRows.map((row) => (
                <article key={row.cleaner.id} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{row.cleaner.fullName ?? row.cleaner.id}</p>
                  <div className="mt-2 space-y-1 text-xs text-zinc-600 dark:text-zinc-300">
                    {row.schedule.jobs.length === 0 ? (
                      <p>No jobs scheduled.</p>
                    ) : (
                      row.schedule.jobs.map((job) => (
                        <p key={job.id}>
                          {job.time} {"->"} {job.service ?? "Cleaning"} {job.locationLabel ? `(${job.locationLabel})` : ""}
                        </p>
                      ))
                    )}
                  </div>
                </article>
              ))
            )}
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <select
            value={selectedCityId}
            onChange={(e) => setSelectedCityId(e.target.value)}
            className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="all">All cities</option>
            {cities.map((city) => (
              <option key={city.id} value={city.id}>
                {city.name}
              </option>
            ))}
          </select>
          {(
            [
              ["all", "All"],
              ["today", "Today"],
              ["upcoming", "Upcoming"],
              ["completed", "Completed"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setFilter(k);
                setActionFilter("all");
                const params = new URLSearchParams(searchParams.toString());
                const opsUrl = new Set(["unassignable", "sla", "unassigned", "starting-soon", "follow-up"]);
                if (opsUrl.has(params.get("filter") ?? "")) {
                  params.delete("filter");
                  persistLastOpsFilter(null);
                }
                const q = params.toString();
                router.replace(q ? `${pathname}?${q}` : pathname);
              }}
              className={[
                "rounded-full px-4 py-2 text-sm font-medium transition",
                filter === k
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "bg-white text-zinc-700 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-zinc-700",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div>
            <label className="block text-xs font-medium text-zinc-500">Booking status</label>
            <select
              value={bookingStatusFilter}
              onChange={(e) => setBookingStatusFilter(e.target.value)}
              className="mt-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
            >
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="assigned">Confirmed / assigned</option>
              <option value="in_progress">In progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="failed">Failed</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">From date</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="mt-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">To date</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="mt-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
            />
          </div>
        </div>

        <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
          Today ({today}) uses Africa/Johannesburg. Row tint: red = no payment, orange = past date but job still active
          (pending/assigned/in progress), amber = no user_id, rose = no email.
        </p>

        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/80 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-3">Customer</th>
                <th className="px-3 py-3">Service</th>
                <th className="px-3 py-3">When</th>
                <th className="px-3 py-3">Starts in</th>
                <th className="px-3 py-3">Price</th>
                <th className="px-3 py-3">Workflow</th>
                <th className="px-3 py-3">Cleaner</th>
                <th className="px-3 py-3">Quick actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {visibleRows.map((r, idx) => {
                const startMins = startsInMinutes(r.date, r.time);
                const assignSourceLine = assignmentSourceLabel(r);
                const cleanerPayoutZar = centsToZar(r.cleaner_payout_cents);
                const cleanerBonusZar = centsToZar(r.cleaner_bonus_cents) ?? 0;
                const cleanerTotalZar = cleanerPayoutZar == null ? null : cleanerPayoutZar + cleanerBonusZar;
                const companyRevenueZar = centsToZar(r.company_revenue_cents);
                return (
                  <Fragment key={r.id}>
                    <tr
                      className={[
                        rowHighlightClass(r, today),
                        idx % 2 === 0 ? "bg-white dark:bg-zinc-900" : "bg-zinc-50/60 dark:bg-zinc-900/70",
                        "cursor-pointer transition hover:bg-zinc-100 dark:hover:bg-zinc-800/80",
                      ].join(" ")}
                      onClick={() => openDetails(r.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openDetails(r.id);
                        }
                      }}
                      tabIndex={0}
                      role="link"
                      aria-label={`Open booking ${r.id}`}
                    >
                      <td className="max-w-[200px] truncate px-3 py-2 text-zinc-800 dark:text-zinc-200">
                        <span className="font-medium">{r.customer_name?.trim() || "—"}</span>
                        {r.is_test ? (
                          <span className="ml-2 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900 ring-1 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-100 dark:ring-amber-800">
                            TEST BOOKING
                          </span>
                        ) : null}
                        <span className="mt-0.5 block truncate text-xs text-zinc-500">{r.customer_email ?? ""}</span>
                      </td>
                      <td className="px-3 py-2">{r.service ?? "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2">{formatWhen(r.date, r.time)}</td>
                      <td className={["whitespace-nowrap px-3 py-2 tabular-nums", startsInClass(startMins)].join(" ")}>
                        {formatStartsIn(startMins)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                        <div className="font-medium">Customer R {zar(r).toLocaleString("en-ZA")}</div>
                        <div className="mt-0.5 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                          Cleaner{" "}
                          {cleanerTotalZar == null ? (
                            <span className="font-medium text-amber-700 dark:text-amber-300">Pending payout calculation</span>
                          ) : (
                            <span className="font-medium text-zinc-700 dark:text-zinc-200">
                              R {cleanerTotalZar.toLocaleString("en-ZA")}
                            </span>
                          )}
                        </div>
                        {cleanerPayoutZar != null ? (
                          <div className="text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
                            Payout R {cleanerPayoutZar.toLocaleString("en-ZA")}
                            {cleanerBonusZar > 0 ? ` + bonus R ${cleanerBonusZar.toLocaleString("en-ZA")}` : ""}
                            {companyRevenueZar != null ? ` · company R ${companyRevenueZar.toLocaleString("en-ZA")}` : ""}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-xs" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={(() => {
                            const st = (r.status ?? "pending").toLowerCase();
                            if (st === "assigned") return "confirmed";
                            const allowed = new Set(["pending", "in_progress", "completed", "cancelled", "failed"]);
                            return allowed.has(st) ? st : "pending";
                          })()}
                          onChange={(e) => {
                            const v = e.target.value;
                            void patchBookingStatus(r.id, v);
                          }}
                          className="mb-1 w-full max-w-[140px] rounded border border-zinc-200 bg-white px-1 py-1 text-[11px] dark:border-zinc-600 dark:bg-zinc-950"
                        >
                          <option value="pending">Pending</option>
                          <option value="confirmed">Confirmed</option>
                          <option value="in_progress">In progress</option>
                          <option value="completed">Completed</option>
                          <option value="cancelled">Cancelled</option>
                          <option value="failed">Failed</option>
                        </select>
                        <div className="text-[11px] text-zinc-500">
                          {dispatchStateLabel(r.dispatch_status, r.status)}
                          {typeof r.surge_multiplier === "number" && r.surge_multiplier > 1 ? (
                            <span className="ml-1 inline-flex rounded-full bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
                              Surge x{r.surge_multiplier.toFixed(1)}
                            </span>
                          ) : null}
                        </div>
                        {assignSourceLine ? (
                          <div className="mt-0.5 text-[10px] font-semibold leading-snug text-emerald-800 dark:text-emerald-300/90">
                            {assignSourceLine}
                          </div>
                        ) : null}
                        {(r.status ?? "").toLowerCase() === "pending" &&
                        !r.cleaner_id &&
                        (r.dispatch_status ?? "").toLowerCase() === "failed" ? (
                          <div
                            className="mt-1.5 flex flex-wrap items-center gap-1.5"
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                            role="group"
                            aria-label="Dispatch needs attention"
                          >
                            <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-900 dark:bg-rose-950/60 dark:text-rose-100">
                              Needs attention
                            </span>
                            <button
                              type="button"
                              className="rounded border border-zinc-300 bg-white px-2 py-0.5 text-[10px] font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                              onClick={() => setAssignBookingId((id) => (id === r.id ? null : r.id))}
                            >
                              Manually assign
                            </button>
                            <button
                              type="button"
                              disabled={retryDispatchBookingId === r.id}
                              className="rounded border border-emerald-600 bg-emerald-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50 dark:border-emerald-500 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                              onClick={() => void retryDispatchFailed(r.id)}
                            >
                              {retryDispatchBookingId === r.id ? "Retrying…" : "Retry now"}
                            </button>
                            <div className="w-full min-w-0 text-[10px] leading-snug text-zinc-600 dark:text-zinc-400">
                              <span className="font-medium text-zinc-700 dark:text-zinc-300">Attempts:</span>{" "}
                              {metricAttemptBucket(Number(r.dispatch_attempt_count ?? 0) || 0)}
                              <span className="mx-1.5 text-zinc-400">·</span>
                              <span className="font-medium text-zinc-700 dark:text-zinc-300">Fallback:</span>{" "}
                              <span className="break-words" title={r.fallback_reason ?? undefined}>
                                {r.fallback_reason?.trim() || "—"}
                              </span>
                            </div>
                          </div>
                        ) : null}
                        {r.attempted_cleaner_id?.trim() &&
                        r.attempted_cleaner_id.trim() !== (r.cleaner_id ?? "").trim() ? (
                          <div
                            className="mt-0.5 text-[10px] leading-snug text-zinc-600 dark:text-zinc-400"
                            title={r.attempted_cleaner_id}
                          >
                            Selected at checkout:{" "}
                            {cleanerDisplayName(r.attempted_cleaner_id.trim(), sortedCleaners) ??
                              `ID ${r.attempted_cleaner_id.slice(0, 8)}…`}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-xs" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={r.cleaner_id ?? ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            void patchBookingCleaner(r.id, v ? v : null);
                          }}
                          className="w-full max-w-[180px] rounded border border-zinc-200 bg-white px-1 py-1 text-[11px] dark:border-zinc-600 dark:bg-zinc-950"
                        >
                          <option value="">{cleanerSelectEmptyLabel(r)}</option>
                          {sortedCleaners.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.full_name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs" onClick={(e) => e.stopPropagation()}>
                        <BookingActionsDropdown
                          booking={r}
                          onAssign={(booking) => {
                            setAssignBookingId((id) => (id === booking.id ? null : booking.id));
                          }}
                          onReschedule={() => {
                            setToast({
                              kind: "info",
                              text: "Reschedule isn’t available here yet — use booking details to edit.",
                            });
                          }}
                          onCancel={() => {
                            setToast({
                              kind: "info",
                              text: "Cancel from booking details or your cancellation endpoint when wired.",
                            });
                          }}
                          onView={(booking) => {
                            openDetails(booking.id);
                          }}
                        />
                      </td>
                    </tr>
                    {assignBookingId === r.id ? (
                      <tr className="bg-zinc-50 dark:bg-zinc-900/80">
                        <td colSpan={8} className="px-3 py-2">
                          <div className="max-w-sm">
                            <AdminAssignForm
                              booking={r}
                              bookingId={r.id}
                              cleaners={cleaners}
                              onDone={({ cleanerId: _assignedCleanerId, assignAttempts }) => {
                                setRows((cur) =>
                                  cur.map((row) =>
                                    row.id === r.id
                                      ? {
                                          ...row,
                                          cleaner_id: null,
                                          status: "pending",
                                          dispatch_status: "offered",
                                          assigned_at: null,
                                        }
                                      : row,
                                  ),
                                );
                                setAssignBookingId(null);
                                emitAdminToast(
                                  typeof assignAttempts === "number" && assignAttempts > 1
                                    ? `Offer sent ✓ (after ${assignAttempts} tries)`
                                    : "Offer sent ✓",
                                  "success",
                                );
                              }}
                              onError={(message) => {
                                emitAdminToast(message || "Failed to assign cleaner", "error");
                              }}
                            />
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {visibleRows.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-zinc-500">No rows for this filter.</p>
          ) : null}
        </div>
      </main>
      <BookingDetailsSheet bookingId={selectedBookingId} onClose={closeDetails} />
      {toast ? (
        <Toast
          kind={toast.kind}
          text={toast.text}
          onClose={() => {
            setToast(null);
          }}
        />
      ) : null}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{value}</p>
    </div>
  );
}

function ActionCard({
  title,
  count,
  onClick,
  tone,
  active,
}: {
  title: string;
  count: number;
  onClick: () => void;
  tone: "red" | "orange" | "amber";
  active: boolean;
}) {
  const toneClass =
    tone === "red"
      ? "border-red-200 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-100"
      : tone === "orange"
        ? "border-orange-200 bg-orange-50 text-orange-900 dark:border-orange-900/60 dark:bg-orange-950/40 dark:text-orange-100"
        : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100";
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-lg border px-3 py-2 text-left transition",
        toneClass,
        active ? "ring-2 ring-zinc-900/20 dark:ring-zinc-100/20" : "hover:opacity-90",
      ].join(" ")}
    >
      <p className="text-xs font-medium uppercase tracking-wide opacity-80">{title}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{count}</p>
    </button>
  );
}

type BookingFunnelApi = {
  since?: string;
  sessions?: number;
  /** Sessions with at least one funnel `view` (matches other steps; `sessions` includes errors/next/exit). */
  sessionsWithFunnelView?: number;
  reachedPaymentSessions?: number;
  viewsByStep?: { step: string; views: number }[];
  message?: string;
  error?: string;
};

function BookingFunnelCard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [funnel, setFunnel] = useState<BookingFunnelApi | null>(null);
  const [clearing, setClearing] = useState(false);

  const loadFunnel = useCallback(async () => {
    const sb = getSupabaseBrowser();
    const token = (await sb?.auth.getSession())?.data.session?.access_token;
    if (!token) {
      setError("Sign in to load funnel.");
      setFunnel(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/booking-funnel", { headers: { Authorization: `Bearer ${token}` } });
    const json = (await res.json()) as BookingFunnelApi & { error?: string };
    if (!res.ok) {
      setError(json.error ?? "Could not load funnel.");
      setFunnel(null);
    } else {
      setFunnel(json);
      if (json.message) setError(json.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadFunnel();
  }, [loadFunnel]);

  const steps = useMemo(() => {
    if (!funnel || funnel.message) return [];
    const v = new Map((funnel.viewsByStep ?? []).map((r) => [r.step, r.views]));
    const started =
      typeof funnel.sessionsWithFunnelView === "number"
        ? funnel.sessionsWithFunnelView
        : typeof funnel.sessions === "number"
          ? funnel.sessions
          : 0;
    return [
      { label: "Started", count: started },
      { label: "Price viewed", count: v.get("quote") ?? 0 },
      { label: "Time selected", count: v.get("datetime") ?? 0 },
      { label: "Paid", count: typeof funnel.reachedPaymentSessions === "number" ? funnel.reachedPaymentSessions : 0 },
    ];
  }, [funnel]);

  const clearFunnelAnalytics = useCallback(async () => {
    if (!window.confirm("Delete all rows in booking_events? Funnel counts will reset (last 30 days in the API).")) {
      return;
    }
    const sb = getSupabaseBrowser();
    const token = (await sb?.auth.getSession())?.data.session?.access_token;
    if (!token) {
      emitAdminToast("Sign in again.", "error");
      return;
    }
    setClearing(true);
    try {
      const res = await fetch("/api/admin/cleanup-logs", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ targets: ["booking_events"] }),
      });
      const json = (await res.json()) as { error?: string; deleted?: { booking_events?: number }; errors?: Record<string, string> };
      if (!res.ok) {
        emitAdminToast(json.error ?? "Cleanup failed.", "error");
        return;
      }
      if (json.errors?.booking_events) {
        emitAdminToast(json.errors.booking_events, "error");
        return;
      }
      emitAdminToast(`Removed ${json.deleted?.booking_events ?? 0} funnel event row(s).`, "success");
      await loadFunnel();
    } finally {
      setClearing(false);
    }
  }, [loadFunnel]);

  const base = steps[0]?.count ? Math.max(steps[0].count, 1) : 1;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Booking funnel</p>
          <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
            From <code className="rounded bg-zinc-100 px-1 font-mono dark:bg-zinc-800">booking_events</code> · ~30 days ·
            Started = sessions with a funnel <span className="font-medium">view</span> (entry→payment), same basis as
            the steps below.
          </p>
        </div>
        {!loading && !error && funnel && !funnel.message ? (
          <button
            type="button"
            onClick={() => void clearFunnelAnalytics()}
            disabled={clearing}
            className="shrink-0 rounded-lg border border-zinc-200 px-2.5 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {clearing ? "…" : "Reset counts"}
          </button>
        ) : null}
      </div>
      {loading ? (
        <div className="mt-3 h-32 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
      ) : error ? (
        <p className="mt-3 text-xs text-amber-800 dark:text-amber-200">{error}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {steps.map((s, idx) => {
            const conversion = Math.round((s.count / base) * 100);
            return (
              <li key={s.label} className="rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-700">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    {idx + 1}. {s.label}
                  </p>
                  <p className="text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{s.count}</p>
                </div>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{conversion}% of started</p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Toast({ kind, text, onClose }: { kind: "success" | "error" | "info"; text: string; onClose: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onClose, 4000);
    return () => window.clearTimeout(t);
  }, [onClose]);

  const tone =
    kind === "success"
      ? "bg-emerald-600 text-white"
      : kind === "error"
        ? "bg-rose-600 text-white"
        : "bg-sky-700 text-white dark:bg-sky-600";

  return (
    <div className="fixed bottom-4 right-4 z-[60] max-w-sm">
      <div className={["rounded-lg px-4 py-3 text-sm font-medium shadow-lg", tone].join(" ")}>
        <p className="leading-snug">{text}</p>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 text-xs font-semibold underline opacity-90 hover:opacity-100"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
