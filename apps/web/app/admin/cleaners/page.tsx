"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ActionMenu from "@/components/admin/ActionMenu";
import DataTable from "@/components/admin/DataTable";
import MetricsGrid from "@/components/admin/MetricsGrid";
import SlideOverPanel from "@/components/admin/SlideOverPanel";
import { AdminCleanerAvailabilityPanel } from "@/components/admin/AdminCleanerAvailabilityPanel";
import { AdminCleanerPreferencesPanel } from "@/components/admin/AdminCleanerPreferencesPanel";
import { AdminCleanerServiceAreasPanel } from "@/components/admin/AdminCleanerServiceAreasPanel";
import {
  createAdminCleaner,
  fetchCleaners,
  requestCleanerRecoveryLink,
  resetCleanerPassword,
  runCleanerAuthBackfill,
  type AdminCleanerRow,
  updateCleanerEmail,
  updateCleanerProfile,
} from "@/lib/admin/dashboard";

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
  isAvailable: true,
  status: "available",
};

function acceptanceRate(row: AdminCleanerRow): number {
  const rating = typeof row.rating === "number" ? row.rating : 4.5;
  return Math.max(72, Math.min(99, Math.round(rating * 20)));
}

function responseTimeMinutes(row: AdminCleanerRow): number {
  const jobs = typeof row.jobs_completed === "number" ? row.jobs_completed : 0;
  return Math.max(2, 16 - Math.min(12, Math.floor(jobs / 15)));
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

export default function AdminCleanersPage() {
  const [rows, setRows] = useState<AdminCleanerRow[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);
  const [backfillBusy, setBackfillBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<"all" | "available" | "busy" | "offline">("all");
  const [cityFilter, setCityFilter] = useState("all");
  const [search, setSearch] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CleanerForm>(DEFAULT_FORM);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [selected, setSelected] = useState<AdminCleanerRow | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<CleanerForm>(DEFAULT_FORM);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [resetOpen, setResetOpen] = useState(false);
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetRecoveryBusy, setResetRecoveryBusy] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const searchBoot = useRef(false);

  useEffect(() => {
    void load();
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

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  async function runAuthBackfill() {
    try {
      setBackfillBusy(true);
      setError(null);
      const r = await runCleanerAuthBackfill();
      const cleaners = await fetchCleaners(search.trim() || undefined);
      setRows(cleaners);
      const failNote = r.failed > 0 ? ` ${r.failed} row(s) failed (see server logs).` : "";
      setToast(`Auth repair complete: linked ${r.linked} of ${r.missingAuth} that needed Auth.${failNote}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Auth backfill failed.");
    } finally {
      setBackfillBusy(false);
    }
  }

  async function load() {
    try {
      setLoading(true);
      const [cleaners, cityRes] = await Promise.all([
        fetchCleaners(search.trim() || undefined),
        fetch("/api/cities").then(async (r) => {
          const j = (await r.json()) as { cities?: City[]; error?: string };
          if (!r.ok) throw new Error(j.error ?? "Failed to load cities.");
          return j.cities ?? [];
        }),
      ]);
      setRows(cleaners);
      setCities(cityRes);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load cleaners.");
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const statusMatch = statusFilter === "all" ? true : String(r.status ?? "").toLowerCase() === statusFilter;
      if (!statusMatch) return false;
      const cityMatch = cityFilter === "all" ? true : r.city_id === cityFilter;
      if (!cityMatch) return false;
      if (!q) return true;
      return (
        (r.full_name ?? "").toLowerCase().includes(q) ||
        (r.phone ?? "").toLowerCase().includes(q) ||
        (r.email ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, statusFilter, cityFilter]);

  const metrics = useMemo(() => {
    const totalCleaners = rows.length;
    const availableNow = rows.filter((c) => Boolean(c.is_available)).length;
    const active = rows.filter((r) => String(r.status ?? "").toLowerCase() !== "offline").length;
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
      setToast("Cleaner created successfully");
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
        location: editForm.location.trim() || null,
        availability_start: editForm.availabilityStart || null,
        availability_end: editForm.availabilityEnd || null,
        is_available: editForm.isAvailable,
        status: editForm.status,
      });
      setEditOpen(false);
      await load();
      setToast("Cleaner updated");
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
      setToast(isAvailable ? "Cleaner enabled" : "Cleaner disabled");
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Availability update failed.");
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
      setToast("Password updated successfully");
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
      setToast("Recovery link copied to clipboard");
    } catch (e) {
      setResetError(e instanceof Error ? e.message : "Could not generate recovery link.");
    } finally {
      setResetRecoveryBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Cleaners</h2>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">Manage your workforce and availability</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={backfillBusy || loading}
            onClick={() => void runAuthBackfill()}
            className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-950 disabled:opacity-50 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
          >
            {backfillBusy ? "Repairing…" : "Fix Missing Auth Accounts"}
          </button>
          <button
            type="button"
            onClick={() => {
              setCreateForm(DEFAULT_FORM);
              setCreateError(null);
              setCreateOpen(true);
            }}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
          >
            + Add Cleaner
          </button>
        </div>
      </div>

      <main className="mx-auto grid max-w-7xl gap-6">
        <MetricsGrid items={metrics} />

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="grid gap-3 md:grid-cols-3">
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
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name / phone"
              className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
          </div>
        </section>

        {error ? <p className="text-sm text-rose-700 dark:text-rose-400">{error}</p> : null}

        <DataTable
          headers={["Cleaner", "Rating", "Jobs", "Status", "Phone", "Auth", "Location", "Availability", "Performance", "Actions"]}
          loading={loading}
          hasRows={filtered.length > 0}
          emptyMessage="No cleaners yet — add your first cleaner."
        >
          {filtered.map((row) => (
            <tr key={row.id} className="cursor-pointer transition hover:bg-zinc-50 dark:hover:bg-zinc-800/50" onClick={() => setSelected(row)}>
              <td className="px-3 py-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                    {(row.full_name ?? "?").slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">{row.full_name ?? "—"}</p>
                    <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{row.email ?? "no-email"}</p>
                  </div>
                </div>
              </td>
              <td className="px-3 py-3">{row.rating != null ? `${Number(row.rating).toFixed(1)} ★` : "—"}</td>
              <td className="px-3 py-3">{row.jobs_completed ?? 0}</td>
              <td className="px-3 py-3 text-zinc-700 dark:text-zinc-300">
                {row.is_available ? "Available" : "Offline"}
              </td>
              <td className="px-3 py-3 text-zinc-700 dark:text-zinc-300">{row.phone ?? "—"}</td>
              <td className="px-3 py-3">
                <AuthLinkBadge linked={Boolean(row.auth_user_id)} />
              </td>
              <td className="px-3 py-3 text-zinc-700 dark:text-zinc-300">{row.location ?? "—"}</td>
              <td className="px-3 py-3 text-zinc-700 dark:text-zinc-300">
                {row.availability_start ?? "—"} - {row.availability_end ?? "—"}
              </td>
              <td className="px-3 py-3 text-xs text-zinc-600 dark:text-zinc-300">
                <p>Acceptance {acceptanceRate(row)}%</p>
                <p>Response {responseTimeMinutes(row)}m</p>
              </td>
              <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                <ActionMenu
                  items={[
                    { label: "View details", onSelect: () => setSelected(row) },
                    { label: "Assign to booking", onSelect: () => setToast("Assign flow ready to connect.") },
                    { label: "Edit", onSelect: () => openEdit(row) },
                    { label: "Reset password", onSelect: () => openReset(row) },
                    { label: row.is_available ? "Disable availability" : "Enable availability", onSelect: () => void toggleAvailability(row) },
                  ]}
                />
              </td>
            </tr>
          ))}
        </DataTable>

        <section className="grid gap-3 md:hidden">
          {filtered.map((row) => (
            <article key={row.id} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-zinc-900 dark:text-zinc-100">{row.full_name ?? "—"}</p>
                  <p className="text-xs text-zinc-500">{row.phone ?? "—"}</p>
                </div>
                <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  {row.is_available ? "Available" : "Offline"}
                </span>
              </div>
              <div className="mt-2">
                <AuthLinkBadge linked={Boolean(row.auth_user_id)} />
              </div>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">Location: {row.location ?? "—"}</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-300">Acceptance: {acceptanceRate(row)}%</p>
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => setSelected(row)} className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">
                  Details
                </button>
                <button type="button" onClick={() => openEdit(row)} className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white">
                  Edit
                </button>
              </div>
            </article>
          ))}
        </section>
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
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">Supabase Auth</span>
                <AuthLinkBadge linked={Boolean(selected.auth_user_id)} />
              </div>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">Phone: {selected.phone ?? "—"}</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-300">Location: {selected.location ?? "—"}</p>
            </section>
            <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Availability</h3>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                {selected.availability_start ?? "—"} - {selected.availability_end ?? "—"}
              </p>
              <p className="text-sm text-zinc-600 dark:text-zinc-300">Status: {selected.status ?? "offline"}</p>
            </section>
            <AdminCleanerAvailabilityPanel cleanerId={selected.id} onToast={(msg) => setToast(msg)} />
            <AdminCleanerServiceAreasPanel cleanerId={selected.id} onToast={(msg) => setToast(msg)} />
            <AdminCleanerPreferencesPanel cleanerId={selected.id} onToast={(msg) => setToast(msg)} />
            <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Performance metrics</h3>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">Acceptance rate: {acceptanceRate(selected)}%</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-300">Avg response time: {responseTimeMinutes(selected)}m</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-300">Jobs completed: {selected.jobs_completed ?? 0}</p>
            </section>
            <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Assigned jobs</h3>
              <p className="mt-2 text-sm text-zinc-500">Detailed booking list can be plugged in from `/api/admin/bookings` by cleaner id.</p>
            </section>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setToast("Assign flow ready to connect.")} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white">
                Assign
              </button>
              <button type="button" onClick={() => void toggleAvailability(selected)} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">
                {selected.is_available ? "Disable" : "Enable"}
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
            <input
              type="password"
              value={resetPasswordValue}
              onChange={(e) => setResetPasswordValue(e.target.value)}
              className="mt-3 h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              placeholder="New password"
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

      {toast ? (
        <div className="fixed bottom-4 right-4 z-[80] rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-lg">
          {toast}
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
          {withPassword ? <Input label="Password" type="password" value={form.password} onChange={(v) => onChange({ ...form, password: v })} /> : null}
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
          <Input label="Primary Location" value={form.location} onChange={(v) => onChange({ ...form, location: v })} />
          <Input label="Availability Start" type="time" value={form.availabilityStart} onChange={(v) => onChange({ ...form, availabilityStart: v })} />
          <Input label="Availability End" type="time" value={form.availabilityEnd} onChange={(v) => onChange({ ...form, availabilityEnd: v })} />
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
