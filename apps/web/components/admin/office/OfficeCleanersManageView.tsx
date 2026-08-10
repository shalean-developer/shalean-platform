"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, RefreshCw } from "lucide-react";
import { PasswordInput } from "@/components/ui/password-input";
import ActionMenu from "@/components/admin/ActionMenu";
import MetricsGrid from "@/components/admin/MetricsGrid";
import SlideOverPanel from "@/components/admin/SlideOverPanel";
import { AdminCleanerAvailabilityPanel } from "@/components/admin/AdminCleanerAvailabilityPanel";
import { AdminCleanerPreferencesPanel } from "@/components/admin/AdminCleanerPreferencesPanel";
import { AdminCleanerServiceAreasPanel } from "@/components/admin/AdminCleanerServiceAreasPanel";
import {
  approveCleanerChangeRequest,
  createAdminCleaner,
  fetchCleaners,
  fetchPendingCleanerChangeRequests,
  linkSupervisorCleanerAccount,
  rejectCleanerChangeRequest,
  requestCleanerRecoveryLink,
  resetCleanerPassword,
  runCleanerAuthBackfill,
  type AdminCleanerChangeRequest,
  type AdminCleanerRow,
  updateCleanerEmail,
  updateCleanerProfile,
} from "@/lib/admin/dashboard";
import {
  CLEANER_WEEKDAY_CODES,
  CLEANER_WEEKDAY_LABELS,
  normalizeCleanerAvailabilityWeekdays,
  parseCleanerAvailabilityWeekdaysStrict,
  type CleanerWeekdayCode,
} from "@/lib/cleaner/availabilityWeekdays";
import { cn } from "@/lib/utils";
import { showToast } from "@/components/ui/notifications";

type City = { id: string; name: string; slug: string };

type CleanerForm = {
  fullName: string;
  phone: string;
  email: string;
  password: string;
  cityId: string;
  location: string;
  availabilityStart: string;
  availabilityEnd: string;
  /** Admin-editable; cleaners see read-only in the app. */
  availabilityWeekdays: CleanerWeekdayCode[];
  isAvailable: boolean;
  status: "available" | "busy" | "offline";
};

const DEFAULT_FORM: CleanerForm = {
  fullName: "",
  phone: "",
  email: "",
  password: "",
  cityId: "",
  location: "",
  availabilityStart: "08:00",
  availabilityEnd: "17:00",
  availabilityWeekdays: [...CLEANER_WEEKDAY_CODES],
  isAvailable: true,
  status: "available",
};

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 50;

function statusLabel(row: AdminCleanerRow): string {
  const st = String(row.status ?? "").toLowerCase();
  if (st === "busy") return "Busy";
  if (st === "offline" || !row.is_available) return "Offline";
  return "Available";
}

function formatWeekdayList(days: string[]): string {
  return days.map((d) => CLEANER_WEEKDAY_LABELS[d as CleanerWeekdayCode] ?? d).join(" ");
}

function AuthLinkBadge({ linked }: { linked: boolean }) {
  if (linked) {
    return (
      <span className="inline-flex max-w-full items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900 dark:bg-emerald-950/80 dark:text-emerald-200">
        Auth Linked
      </span>
    );
  }
  return (
    <span className="inline-flex max-w-full items-center rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-900 dark:bg-rose-950/80 dark:text-rose-200">
      No Auth
    </span>
  );
}

export function OfficeCleanersManageView() {
  const router = useRouter();
  const [rows, setRows] = useState<AdminCleanerRow[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);
  const [backfillBusy, setBackfillBusy] = useState(false);
  const pushToast = useCallback((msg: string) => showToast(msg, "success"), []);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<"all" | "available" | "busy" | "offline">("all");
  const [cityFilter, setCityFilter] = useState("all");
  /** `all` | `__none__` (no location set) | trimmed location string (exact match, case-sensitive) */
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CleanerForm>(DEFAULT_FORM);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [selected, setSelected] = useState<AdminCleanerRow | null>(null);
  const [supervisorLinkEmail, setSupervisorLinkEmail] = useState("");
  const [supervisorLinkBusy, setSupervisorLinkBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<CleanerForm>(DEFAULT_FORM);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [resetOpen, setResetOpen] = useState(false);
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetRecoveryBusy, setResetRecoveryBusy] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const [changeRequests, setChangeRequests] = useState<AdminCleanerChangeRequest[]>([]);
  const [changeRequestBusy, setChangeRequestBusy] = useState<{ id: string; action: "approve" | "reject" } | null>(null);

  const searchBoot = useRef(false);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only full load; focus refetch uses `loadRef` for latest `load`
  }, []);

  useEffect(() => {
    if (!searchBoot.current) {
      searchBoot.current = true;
      return;
    }
    const handle = setTimeout(() => {
      void (async () => {
        try {
          const cleaners = await fetchCleaners(search.trim() || undefined);
          setRows(cleaners);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Failed to load cleaners.");
        }
      })();
    }, 350);
    return () => clearTimeout(handle);
  }, [search]);


  async function runAuthBackfill() {
    try {
      setBackfillBusy(true);
      setError(null);
      const r = await runCleanerAuthBackfill();
      const cleaners = await fetchCleaners(search.trim() || undefined);
      setRows(cleaners);
      const failNote = r.failed > 0 ? ` ${r.failed} row(s) failed (see server logs).` : "";
      pushToast(`Auth repair complete: linked ${r.linked} of ${r.missingAuth} that needed Auth.${failNote}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Auth backfill failed.");
    } finally {
      setBackfillBusy(false);
    }
  }

  async function load(opts?: { silent?: boolean }) {
    const silent = opts?.silent === true;
    try {
      if (!silent) setLoading(true);
      const [cleaners, cityRes, pendingCr] = await Promise.all([
        fetchCleaners(search.trim() || undefined),
        fetch("/api/cities").then(async (r) => {
          const j = (await r.json()) as { cities?: City[]; error?: string };
          if (!r.ok) throw new Error(j.error ?? "Failed to load cities.");
          return j.cities ?? [];
        }),
        fetchPendingCleanerChangeRequests().catch(() => [] as AdminCleanerChangeRequest[]),
      ]);
      setRows(cleaners);
      setCities(cityRes);
      setChangeRequests(pendingCr);
      if (!silent) setError(null);
    } catch (e) {
      if (!silent) {
        setError(
          e instanceof TypeError && e.message === "Failed to fetch"
            ? "Network error — check the dev server is running."
            : e instanceof Error
              ? e.message
              : "Failed to load cleaners.",
        );
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }

  const loadRef = useRef(load);
  loadRef.current = load;

  const refreshSelectedCleanerRow = useCallback(async () => {
    try {
      const cleaners = await fetchCleaners(search.trim() || undefined);
      setRows(cleaners);
      setSelected((prev) => (prev ? cleaners.find((c) => c.id === prev.id) ?? prev : null));
    } catch {
      /* ignore */
    }
  }, [search]);

  async function linkSupervisorLogin() {
    if (!selected || !supervisorLinkEmail.trim()) return;
    try {
      setSupervisorLinkBusy(true);
      await linkSupervisorCleanerAccount(selected.id, supervisorLinkEmail.trim());
      showToast("Supervisor login linked. They can now switch to their cleaner account.", "success");
      setSupervisorLinkEmail("");
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "Failed to link supervisor login.", "error");
    } finally {
      setSupervisorLinkBusy(false);
    }
  }

  const focusRefetchAt = useRef(0);
  useEffect(() => {
    const run = () => {
      const now = Date.now();
      if (now - focusRefetchAt.current < 400) return;
      focusRefetchAt.current = now;
      void loadRef.current({ silent: true });
    };
    const onFocus = () => run();
    const onVis = () => {
      if (document.visibilityState === "visible") run();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  async function approveChangeRequest(id: string) {
    setChangeRequestBusy({ id, action: "approve" });
    try {
      await approveCleanerChangeRequest(id);
      setChangeRequests((prev) => prev.filter((r) => r.id !== id));
      const cleaners = await fetchCleaners(search.trim() || undefined);
      setRows(cleaners);
      setSelected((prev) => (prev ? cleaners.find((c) => c.id === prev.id) ?? prev : null));
      pushToast("Request approved");
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Approve failed.");
    } finally {
      setChangeRequestBusy(null);
    }
  }

  async function rejectChangeRequest(id: string) {
    setChangeRequestBusy({ id, action: "reject" });
    try {
      await rejectCleanerChangeRequest(id);
      setChangeRequests((prev) => prev.filter((r) => r.id !== id));
      const cleaners = await fetchCleaners(search.trim() || undefined);
      setRows(cleaners);
      setSelected((prev) => (prev ? cleaners.find((c) => c.id === prev.id) ?? prev : null));
      pushToast("Request rejected");
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Reject failed.");
    } finally {
      setChangeRequestBusy(null);
    }
  }

  const locationOptions = useMemo(() => {
    const unique = new Set<string>();
    for (const r of rows) {
      const loc = (r.location ?? "").trim();
      if (!loc) continue;
      unique.add(loc);
    }
    return [...unique].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const statusMatch = statusFilter === "all" ? true : String(r.status ?? "").toLowerCase() === statusFilter;
      if (!statusMatch) return false;
      const cityMatch = cityFilter === "all" ? true : r.city_id === cityFilter;
      if (!cityMatch) return false;
      const locTrim = (r.location ?? "").trim();
      if (locationFilter === "all") {
        /* no-op */
      } else if (locationFilter === "__none__") {
        if (locTrim.length > 0) return false;
      } else if (locTrim !== locationFilter) {
        return false;
      }
      if (!q) return true;
      return (
        (r.full_name ?? "").toLowerCase().includes(q) ||
        (r.phone ?? "").toLowerCase().includes(q) ||
        (r.email ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, statusFilter, cityFilter, locationFilter]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, cityFilter, locationFilter, pageSize]);

  const pagination = useMemo(() => {
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    const end = Math.min(start + pageSize, total);
    return {
      page: safePage,
      pageSize,
      total,
      totalPages,
      from: total === 0 ? 0 : start + 1,
      to: end,
      hasPreviousPage: safePage > 1,
      hasNextPage: safePage < totalPages,
    };
  }, [filtered, page, pageSize]);

  useEffect(() => {
    if (page > pagination.totalPages) {
      setPage(pagination.totalPages);
    }
  }, [page, pagination.totalPages]);

  const paginatedRows = useMemo(
    () => filtered.slice((pagination.page - 1) * pageSize, pagination.page * pageSize),
    [filtered, pagination.page, pageSize],
  );

  const metrics = useMemo(() => {
    const totalCleaners = rows.length;
    const availableNow = rows.filter((c) => Boolean(c.is_available)).length;
    const active = rows.filter((r) => r.is_active !== false).length;
    const avgRating =
      rows.length > 0 ? rows.reduce((acc, c) => acc + (c.rating || 0), 0) / rows.length : NaN;
    return [
      { label: "Total cleaners", value: String(totalCleaners) },
      { label: "Available now", value: String(availableNow) },
      { label: "Active today", value: String(active) },
      { label: "Avg rating", value: Number.isFinite(avgRating) ? avgRating.toFixed(1) : "—" },
    ];
  }, [rows]);

  function validate(form: CleanerForm, requirePassword: boolean): string | null {
    if (!form.fullName.trim()) return "Full name is required.";
    if (!form.phone.trim()) return "Phone number is required.";
    const em = form.email.trim();
    if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return "Enter a valid email or leave it blank.";
    if (requirePassword && form.password.length < 6) return "Password must be at least 6 characters.";
    return null;
  }

  async function submitCreate() {
    const err = validate(createForm, true);
    if (err) {
      setCreateError(err);
      return;
    }
    try {
      setCreateBusy(true);
      setCreateError(null);
      await createAdminCleaner({
        fullName: createForm.fullName.trim(),
        phone: createForm.phone.trim(),
        email: createForm.email.trim() || undefined,
        password: createForm.password,
        cityId: createForm.cityId || null,
        location: createForm.location.trim() || undefined,
        availabilityStart: createForm.availabilityStart || null,
        availabilityEnd: createForm.availabilityEnd || null,
        isAvailable: createForm.isAvailable,
      });
      setCreateOpen(false);
      setCreateForm(DEFAULT_FORM);
      await load();
      pushToast("Cleaner created successfully");
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Could not create cleaner.");
    } finally {
      setCreateBusy(false);
    }
  }

  function openEdit(row: AdminCleanerRow) {
    setSelected(row);
    setEditForm({
      fullName: row.full_name ?? "",
      phone: row.phone ?? "",
      email: row.email ?? "",
      password: "",
      cityId: row.city_id ?? "",
      location: row.location ?? "",
      availabilityStart: row.availability_start ?? "08:00",
      availabilityEnd: row.availability_end ?? "17:00",
      availabilityWeekdays: normalizeCleanerAvailabilityWeekdays(row.availability_weekdays),
      isAvailable: Boolean(row.is_available),
      status: (String(row.status ?? "offline").toLowerCase() as CleanerForm["status"]) || "offline",
    });
    setEditError(null);
    setEditOpen(true);
  }

  async function submitEdit() {
    if (!selected) return;
    const err = validate(editForm, false);
    if (err) {
      setEditError(err);
      return;
    }
    try {
      setEditBusy(true);
      const nextEmail = editForm.email.trim();
      const prevEmail = (selected.email ?? "").trim();
      if (nextEmail.toLowerCase() !== prevEmail.toLowerCase()) {
        if (!nextEmail) {
          setEditError("Email cannot be empty once set. Use a valid address for cleaner login.");
          return;
        }
        await updateCleanerEmail(selected.id, nextEmail);
      }
      await updateCleanerProfile(selected.id, {
        full_name: editForm.fullName.trim(),
        phone: editForm.phone.trim(),
        availability_start: editForm.availabilityStart || null,
        availability_end: editForm.availabilityEnd || null,
        is_available: editForm.isAvailable,
        status: editForm.status,
      });
      setEditOpen(false);
      await load();
      pushToast("Cleaner updated");
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Could not update cleaner.");
    } finally {
      setEditBusy(false);
    }
  }

  async function toggleAvailability(row: AdminCleanerRow) {
    try {
      const isAvailable = !Boolean(row.is_available);
      await updateCleanerProfile(row.id, {
        is_available: isAvailable,
        status: isAvailable ? "available" : "offline",
      });
      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id ? { ...r, is_available: isAvailable, status: isAvailable ? "available" : "offline" } : r,
        ),
      );
      pushToast(isAvailable ? "Cleaner enabled" : "Cleaner disabled");
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Availability update failed.");
    }
  }

  async function toggleLifecycle(row: AdminCleanerRow) {
    const isActive = row.is_active === false;
    try {
      await updateCleanerProfile(row.id, { is_active: isActive });
      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? {
                ...r,
                is_active: isActive,
                ...(!isActive ? { is_available: false, status: "offline" } : {}),
              }
            : r,
        ),
      );
      setSelected((current) =>
        current?.id === row.id
          ? {
              ...current,
              is_active: isActive,
              ...(!isActive ? { is_available: false, status: "offline" } : {}),
            }
          : current,
      );
      pushToast(isActive ? "Cleaner restored to the active roster" : "Cleaner archived safely");
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Cleaner lifecycle update failed.");
    }
  }

  function openReset(row: AdminCleanerRow) {
    setSelected(row);
    setResetPasswordValue("");
    setResetError(null);
    setResetOpen(true);
  }

  async function submitResetPassword() {
    if (!selected) return;
    if (resetPasswordValue.length < 6) {
      setResetError("Password must be at least 6 characters.");
      return;
    }
    try {
      setResetBusy(true);
      await resetCleanerPassword(selected.id, resetPasswordValue);
      const cleaners = await fetchCleaners(search.trim() || undefined);
      setRows(cleaners);
      setSelected((s) => (s ? cleaners.find((c) => c.id === s.id) ?? s : null));
      setResetOpen(false);
      pushToast("Password updated successfully");
    } catch (e) {
      setResetError(e instanceof Error ? e.message : "Could not reset password.");
    } finally {
      setResetBusy(false);
    }
  }

  async function copyRecoveryLink() {
    if (!selected) return;
    try {
      setResetRecoveryBusy(true);
      setResetError(null);
      const link = await requestCleanerRecoveryLink(selected.id);
      await navigator.clipboard.writeText(link);
      pushToast("Recovery link copied to clipboard");
    } catch (e) {
      setResetError(e instanceof Error ? e.message : "Could not generate recovery link.");
    } finally {
      setResetRecoveryBusy(false);
    }
  }

  return (
    <div className="min-w-0 max-w-full space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Cleaners</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Manage profiles, availability, auth, ratings, and change requests.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => void load()}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm hover:bg-slate-50"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </button>
          <button
            type="button"
            disabled={backfillBusy || loading}
            onClick={() => void runAuthBackfill()}
            className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 disabled:opacity-50"
          >
            {backfillBusy ? "Repairing…" : "Fix missing auth"}
          </button>
          <button
            type="button"
            onClick={() => {
              setCreateForm(DEFAULT_FORM);
              setCreateError(null);
              setCreateOpen(true);
            }}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Add cleaner
          </button>
        </div>
      </div>

      <main className="grid min-w-0 max-w-full gap-6">
        {changeRequests.length > 0 ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/25">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Pending work-setting requests</h3>
            <ul className="mt-3 space-y-3">
              {changeRequests.map((req) => (
                <li
                  key={req.id}
                  className="rounded-xl border border-zinc-200 bg-white p-3 text-sm text-zinc-800 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                >
                  <p className="font-medium text-zinc-900 dark:text-zinc-50">Cleaner: {req.cleaner_name}</p>
                  <p className="mt-1 text-zinc-600 dark:text-zinc-300">
                    Current: {req.current_location} · {formatWeekdayList(req.current_days)}
                  </p>
                  <p className="mt-1 text-zinc-600 dark:text-zinc-300">
                    Requested: {req.requested_locations.length ? req.requested_locations.join(" · ") : "—"} ·{" "}
                    {formatWeekdayList(req.requested_days)}
                  </p>
                  {req.note ? (
                    <p className="mt-1 text-zinc-600 dark:text-zinc-300">
                      Note: <span className="font-medium">{req.note}</span>
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={changeRequestBusy != null}
                      onClick={() => void approveChangeRequest(req.id)}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {changeRequestBusy?.id === req.id && changeRequestBusy.action === "approve" ? "Approving…" : "Approve"}
                    </button>
                    <button
                      type="button"
                      disabled={changeRequestBusy != null}
                      onClick={() => void rejectChangeRequest(req.id)}
                      className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                    >
                      {changeRequestBusy?.id === req.id && changeRequestBusy.action === "reject" ? "Rejecting…" : "Reject"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <MetricsGrid items={metrics} />

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            >
              <option value="all">All statuses</option>
              <option value="available">Available</option>
              <option value="busy">Busy</option>
              <option value="offline">Offline</option>
            </select>
            <select
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            >
              <option value="all">All cities</option>
              {cities.map((city) => (
                <option key={city.id} value={city.id}>
                  {city.name}
                </option>
              ))}
            </select>
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="h-10 min-w-0 rounded-lg border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            >
              <option value="all">All locations</option>
              <option value="__none__">No location</option>
              {locationOptions.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name / phone"
              className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
          </div>
        </section>

        {error ? <p className="text-sm text-rose-700 dark:text-rose-400">{error}</p> : null}

        <div className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="hidden md:block">
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80">
                  {["Cleaner", "Stats", "Status", "Location", "Auth", ""].map((h, i) => (
                    <th
                      key={h || "actions"}
                      className={cn(
                        "px-3 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400",
                        i === 3 && "hidden lg:table-cell",
                        i === 4 && "hidden xl:table-cell",
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={6} className="px-3 py-4">
                        <div className="h-5 animate-pulse rounded-lg bg-slate-100" />
                      </td>
                    </tr>
                  ))
                ) : paginatedRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-10 text-center text-sm text-slate-400">
                      {error ? "Failed to load cleaners." : "No cleaners yet — add your first cleaner."}
                    </td>
                  </tr>
                ) : (
                  paginatedRows.map((row) => (
                    <tr
                      key={row.id}
                      className="cursor-pointer transition hover:bg-slate-50/80"
                      onClick={() => setSelected(row)}
                    >
                      <td className="px-3 py-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                            {(row.full_name ?? "?").slice(0, 1).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-slate-900">{row.full_name ?? "—"}</p>
                            <p className="truncate text-xs text-slate-400">{row.email ?? row.phone ?? "—"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-slate-700">
                        <p className="truncate tabular-nums">
                          {row.rating != null ? `${Number(row.rating).toFixed(1)} ★` : "—"}
                        </p>
                        <p className="truncate text-xs text-slate-400">{row.jobs_completed ?? 0} jobs</p>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold",
                            row.is_available ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600",
                          )}
                        >
                          {statusLabel(row)}
                        </span>
                      </td>
                      <td className="hidden truncate px-3 py-3 text-slate-600 lg:table-cell">{row.location ?? "—"}</td>
                      <td className="hidden px-3 py-3 xl:table-cell">
                        <AuthLinkBadge linked={Boolean(row.auth_user_id)} />
                      </td>
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <ActionMenu
                          items={[
                            { label: "View profile", onSelect: () => router.push(`/office/cleaners/${encodeURIComponent(row.id)}`) },
                            { label: "Quick edit", onSelect: () => router.push(`/office/cleaners/${encodeURIComponent(row.id)}?edit=1`) },
                            { label: "Details panel", onSelect: () => setSelected(row) },
                            {
                              label: "Payout history",
                              onSelect: () => {
                                router.push(`/admin/cleaners/${encodeURIComponent(row.id)}/payouts`);
                              },
                            },
                            { label: "Assign to booking", onSelect: () => pushToast("Assign flow ready to connect.") },
                            { label: "Edit", onSelect: () => openEdit(row) },
                            { label: "Reset password", onSelect: () => openReset(row) },
                            {
                              label: row.is_available ? "Disable availability" : "Enable availability",
                              onSelect: () => void toggleAvailability(row),
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 p-4 md:hidden">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
              ))
            ) : paginatedRows.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">
                {error ? "Failed to load cleaners." : "No cleaners found."}
              </p>
            ) : (
              paginatedRows.map((row) => (
                <article
                  key={row.id}
                  className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
                  onClick={() => setSelected(row)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">{row.full_name ?? "—"}</p>
                      <p className="truncate text-xs text-slate-500">{row.phone ?? row.email ?? "—"}</p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold",
                        row.is_available ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600",
                      )}
                    >
                      {statusLabel(row)}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <AuthLinkBadge linked={Boolean(row.auth_user_id)} />
                    {row.location ? <span className="truncate">{row.location}</span> : null}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                    <Link
                      href={`/office/cleaners/${encodeURIComponent(row.id)}`}
                      className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-center text-sm font-semibold text-blue-600 hover:bg-blue-50"
                    >
                      Profile
                    </Link>
                    <button
                      type="button"
                      onClick={() => setSelected(row)}
                      className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    >
                      Details
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(row)}
                      className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white"
                    >
                      Edit
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
            <p className="text-xs text-slate-400">
              {loading
                ? "Loading…"
                : filtered.length !== rows.length
                  ? `Showing ${pagination.from}-${pagination.to} of ${pagination.total} filtered (${rows.length} loaded from database)`
                  : `Showing ${pagination.from}-${pagination.to} of ${pagination.total} cleaners`}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-xs text-slate-500">
                Rows
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
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
      </main>

      <SlideOverPanel
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.full_name ?? "Cleaner details"}
        subtitle={selected?.email ?? selected?.phone ?? ""}
      >
        {selected ? (
          <>
            <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Profile</h3>
              <p className="mt-2 flex flex-wrap gap-3">
                <Link
                  href={`/office/cleaners/${encodeURIComponent(selected.id)}`}
                  className="text-sm font-medium text-blue-600 underline-offset-2 hover:underline"
                >
                  Open full profile
                </Link>
                <Link
                  href={`/admin/cleaners/${encodeURIComponent(selected.id)}/payouts`}
                  className="text-sm font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
                >
                  Payout history (audit)
                </Link>
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">Supabase Auth</span>
                <AuthLinkBadge linked={Boolean(selected.auth_user_id)} />
              </div>
              <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50/60 p-3">
                <p className="text-xs font-semibold text-blue-900">Link supervisor login</p>
                <p className="mt-1 text-xs text-blue-800">Keeps the cleaner’s existing login and allows the same supervisor login to open this cleaner profile.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <input
                    type="email"
                    value={supervisorLinkEmail}
                    onChange={(event) => setSupervisorLinkEmail(event.target.value)}
                    placeholder="supervisor@shalean.com"
                    className="min-w-0 flex-1 rounded-md border border-blue-200 bg-white px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    disabled={supervisorLinkBusy || !supervisorLinkEmail.trim()}
                    onClick={() => void linkSupervisorLogin()}
                    className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {supervisorLinkBusy ? "Linking…" : "Link account"}
                  </button>
                </div>
              </div>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">Phone: {selected.phone ?? "—"}</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-300">Location: {selected.location ?? "—"}</p>
            </section>
            <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Availability</h3>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                {selected.availability_start ?? "—"} - {selected.availability_end ?? "—"}
              </p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                Weekdays:{" "}
                {(() => {
                  const strict = parseCleanerAvailabilityWeekdaysStrict(selected.availability_weekdays);
                  if (strict.length === 0) {
                    return (
                      <span className="text-zinc-500 dark:text-zinc-400">
                        None set — use Weekly availability below or approve a change request.
                      </span>
                    );
                  }
                  return strict.map((d) => CLEANER_WEEKDAY_LABELS[d]).join(", ");
                })()}
              </p>
              <p className="text-sm text-zinc-600 dark:text-zinc-300">Status: {selected.status ?? "offline"}</p>
            </section>
            <AdminCleanerAvailabilityPanel
              key={selected.id}
              cleanerId={selected.id}
              availabilityWeekdaysSnapshot={selected.availability_weekdays ?? null}
              availabilityStartSnapshot={selected.availability_start ?? null}
              availabilityEndSnapshot={selected.availability_end ?? null}
              onToast={(msg) => pushToast(msg)}
              onSaved={() => void refreshSelectedCleanerRow()}
            />
            <AdminCleanerServiceAreasPanel
              cleanerId={selected.id}
              onToast={(msg) => pushToast(msg)}
              onCanonicalSaved={() => void refreshSelectedCleanerRow()}
            />
            <AdminCleanerPreferencesPanel cleanerId={selected.id} onToast={(msg) => pushToast(msg)} />
            <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Performance metrics</h3>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">Jobs completed: {selected.jobs_completed ?? 0}</p>
              <Link href="/office/cleaner-performance" className="mt-2 inline-block text-sm font-semibold text-blue-600 hover:underline">
                Open canonical performance
              </Link>
            </section>
            <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Assigned jobs</h3>
              <p className="mt-2 text-sm text-zinc-500">Open the full profile to view assignments from the canonical booking roster.</p>
            </section>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void toggleAvailability(selected)} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">
                {selected.is_available ? "Disable" : "Enable"}
              </button>
              <button type="button" onClick={() => void toggleLifecycle(selected)} className="rounded-lg border border-rose-300 px-3 py-2 text-sm text-rose-800 dark:border-rose-700 dark:text-rose-300">
                {selected.is_active === false ? "Restore cleaner" : "Archive cleaner"}
              </button>
              <button type="button" onClick={() => openReset(selected)} className="rounded-lg border border-amber-300 px-3 py-2 text-sm text-amber-800 dark:border-amber-700 dark:text-amber-300">
                Reset password
              </button>
            </div>
          </>
        ) : null}
      </SlideOverPanel>

      <CleanerFormModal
        open={createOpen}
        title="Add Cleaner"
        cities={cities}
        form={createForm}
        error={createError}
        busy={createBusy}
        submitLabel={createBusy ? "Creating..." : "Create Cleaner"}
        onClose={() => setCreateOpen(false)}
        onChange={setCreateForm}
        onSubmit={() => void submitCreate()}
        withPassword
      />

      <CleanerFormModal
        open={editOpen}
        title="Edit Cleaner"
        cities={cities}
        form={editForm}
        error={editError}
        busy={editBusy}
        submitLabel={editBusy ? "Saving..." : "Save changes"}
        onClose={() => setEditOpen(false)}
        onChange={setEditForm}
        onSubmit={() => void submitEdit()}
      />

      {resetOpen ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl dark:bg-zinc-900">
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Reset password</h3>
            <PasswordInput
              value={resetPasswordValue}
              onChange={(e) => setResetPasswordValue(e.target.value)}
              autoComplete="new-password"
              placeholder="New password"
              wrapperClassName="mt-3"
              className="h-10 rounded-lg border-zinc-300 px-3 text-sm dark:border-zinc-700"
            />
            {resetError ? <p className="mt-2 text-sm text-rose-700 dark:text-rose-400">{resetError}</p> : null}
            <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
              Or generate a Supabase recovery link (requires cleaner email and a linked auth account).
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void copyRecoveryLink()}
                disabled={resetRecoveryBusy || !selected}
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 disabled:opacity-60"
              >
                {resetRecoveryBusy ? "Generating…" : "Copy recovery link"}
              </button>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setResetOpen(false)} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">
                Cancel
              </button>
              <button type="button" onClick={() => void submitResetPassword()} disabled={resetBusy} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
                {resetBusy ? "Saving..." : "Reset Password"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
}

function CleanerFormModal({
  open,
  title,
  cities,
  form,
  error,
  busy,
  submitLabel,
  onClose,
  onChange,
  onSubmit,
  withPassword = false,
}: {
  open: boolean;
  title: string;
  cities: City[];
  form: CleanerForm;
  error: string | null;
  busy: boolean;
  submitLabel: string;
  onClose: () => void;
  onChange: (next: CleanerForm) => void;
  onSubmit: () => void;
  withPassword?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 px-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl dark:bg-zinc-900">
        <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Input label="Full Name" value={form.fullName} onChange={(v) => onChange({ ...form, fullName: v })} />
          <Input label="Phone Number" value={form.phone} onChange={(v) => onChange({ ...form, phone: v })} />
          <Input label="Email (optional)" value={form.email} onChange={(v) => onChange({ ...form, email: v })} />
          {withPassword ? (
            <label className="block text-sm text-zinc-700 dark:text-zinc-200">
              <span className="mb-1 block">Password</span>
              <PasswordInput
                value={form.password}
                onChange={(e) => onChange({ ...form, password: e.target.value })}
                autoComplete="new-password"
                className="h-10 rounded-lg border-zinc-300 px-3 dark:border-zinc-700"
              />
            </label>
          ) : null}
          <label className="text-sm text-zinc-700 dark:text-zinc-200">
            <span className="mb-1 block">City</span>
            <select value={form.cityId} onChange={(e) => onChange({ ...form, cityId: e.target.value })} className="h-10 w-full rounded-lg border border-zinc-300 px-3 dark:border-zinc-700 dark:bg-zinc-950">
              <option value="">Select city</option>
              {cities.map((city) => (
                <option key={city.id} value={city.id}>
                  {city.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-zinc-700 dark:text-zinc-200">
            <span className="mb-1 block">Area label (derived)</span>
            <p className="min-h-10 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-3 py-2 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100">
              {form.location.trim() || "—"}
            </p>
            <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">
              Edited via Working areas + Weekly availability panels below.
            </span>
          </label>
          <Input label="Availability Start" type="time" value={form.availabilityStart} onChange={(v) => onChange({ ...form, availabilityStart: v })} />
          <Input label="Availability End" type="time" value={form.availabilityEnd} onChange={(v) => onChange({ ...form, availabilityEnd: v })} />
        </div>
        <div className="mt-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-700">
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">Working weekdays (derived)</p>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            Synced from the Weekly availability calendar. Shown read-only in the cleaner app.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {CLEANER_WEEKDAY_CODES.map((code) => {
              const active = form.availabilityWeekdays.includes(code);
              return (
                <span
                  key={code}
                  className={`rounded-lg border px-2.5 py-1.5 text-sm ${
                    active
                      ? "border-emerald-600 bg-emerald-50 font-medium text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-100"
                      : "border-zinc-200 bg-zinc-100 text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-500"
                  }`}
                >
                  {CLEANER_WEEKDAY_LABELS[code]}
                </span>
              );
            })}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
            <input type="checkbox" checked={form.isAvailable} onChange={(e) => onChange({ ...form, isAvailable: e.target.checked })} />
            Available now
          </label>
          <label className="text-sm text-zinc-700 dark:text-zinc-200">
            <span className="mr-2">Status</span>
            <select value={form.status} onChange={(e) => onChange({ ...form, status: e.target.value as CleanerForm["status"] })} className="h-9 rounded-lg border border-zinc-300 px-2 dark:border-zinc-700 dark:bg-zinc-950">
              <option value="available">Available</option>
              <option value="busy">Busy</option>
              <option value="offline">Offline</option>
            </select>
          </label>
        </div>
        {error ? <p className="mt-2 text-sm text-rose-700 dark:text-rose-400">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">
            Cancel
          </button>
          <button type="button" onClick={onSubmit} disabled={busy} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="text-sm text-zinc-700 dark:text-zinc-200">
      <span className="mb-1 block">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-lg border border-zinc-300 px-3 dark:border-zinc-700 dark:bg-zinc-950"
      />
    </label>
  );
}
