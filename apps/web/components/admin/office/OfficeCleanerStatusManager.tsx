"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { fetchCleaners, type AdminCleanerRow } from "@/lib/admin/dashboard";
import {
  CLEANER_STATUSES,
  CLEANER_STATUS_LABELS,
  normalizeCleanerStatus,
  type CleanerStatus,
} from "@/lib/cleaner/cleanerStatus";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { showToast } from "@/components/ui/notifications";
import { cn } from "@/lib/utils";

const MANUAL_STATUSES = CLEANER_STATUSES.filter((status) => status !== "busy");

type StatusFilter = "all" | CleanerStatus;

function effectiveStatus(row: AdminCleanerRow): CleanerStatus {
  const normalized = normalizeCleanerStatus(row.status);
  if (normalized) return normalized;
  return row.is_available === false ? "offline" : "available";
}

function badgeClass(status: CleanerStatus): string {
  switch (status) {
    case "available":
      return "bg-emerald-100 text-emerald-800";
    case "busy":
      return "bg-blue-100 text-blue-800";
    case "sick":
      return "bg-rose-100 text-rose-800";
    case "leave":
    case "day_off":
      return "bg-amber-100 text-amber-800";
    case "training":
      return "bg-violet-100 text-violet-800";
    case "suspended":
      return "bg-red-100 text-red-800";
    case "inactive":
      return "bg-slate-200 text-slate-800";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

async function patchCleanerStatus(cleanerId: string, status: CleanerStatus): Promise<void> {
  if (status === "busy") return;
  const sb = getSupabaseBrowser();
  const session = await sb?.auth.getSession();
  const token = session?.data.session?.access_token;
  if (!token) throw new Error("Please sign in again.");

  const response = await fetch(`/api/admin/cleaners/${encodeURIComponent(cleanerId)}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status }),
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "Could not update cleaner status.");
}

export function OfficeCleanerStatusManager() {
  const [rows, setRows] = useState<AdminCleanerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      setRows(await fetchCleaners());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load cleaner statuses.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const status = effectiveStatus(row);
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (!q) return true;
      return (
        String(row.full_name ?? "").toLowerCase().includes(q) ||
        String(row.email ?? "").toLowerCase().includes(q) ||
        String(row.phone ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, statusFilter]);

  const availableCount = useMemo(
    () => rows.filter((row) => effectiveStatus(row) === "available" && row.is_active !== false).length,
    [rows],
  );

  async function setStatus(row: AdminCleanerRow, next: CleanerStatus) {
    if (next === "busy") return;
    const current = effectiveStatus(row);
    if (current === next) return;

    try {
      setSavingId(row.id);
      await patchCleanerStatus(row.id, next);
      const isAvailable = next === "available";
      const isActive = next !== "inactive";
      setRows((prev) =>
        prev.map((item) =>
          item.id === row.id
            ? { ...item, status: next, is_available: isAvailable, is_active: isActive }
            : item,
        ),
      );
      showToast(`${row.full_name ?? "Cleaner"} marked ${CLEANER_STATUS_LABELS[next]}.`, "success");
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "Could not update cleaner status.", "error");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section className="mx-4 rounded-2xl border border-blue-100 bg-white p-4 shadow-sm sm:mx-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold text-slate-900">Cleaner operational status</h2>
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-blue-700">
              Canonical
            </span>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Management sets availability and workforce status here. Busy is automatic and is only shown while a cleaner has a booking in progress.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="rounded-lg bg-emerald-50 px-3 py-2 font-semibold text-emerald-800">
            {availableCount} available now
          </span>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-50"
            aria-label="Refresh cleaner statuses"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search cleaner, email or phone"
          className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"
        />
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
          className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"
        >
          <option value="all">All statuses</option>
          {CLEANER_STATUSES.map((status) => (
            <option key={status} value={status}>
              {CLEANER_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </div>

      {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-3">Cleaner</th>
              <th className="px-3 py-3">Current status</th>
              <th className="px-3 py-3">Set status</th>
              <th className="px-3 py-3">Dispatch</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={4} className="px-3 py-8 text-center text-slate-400">Loading cleaner statuses…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={4} className="px-3 py-8 text-center text-slate-400">No cleaners match this filter.</td></tr>
            ) : (
              filtered.map((row) => {
                const status = effectiveStatus(row);
                const saving = savingId === row.id;
                return (
                  <tr key={row.id}>
                    <td className="px-3 py-3">
                      <p className="font-semibold text-slate-900">{row.full_name ?? "—"}</p>
                      <p className="text-xs text-slate-400">{row.phone ?? row.email ?? "—"}</p>
                    </td>
                    <td className="px-3 py-3">
                      <span className={cn("inline-flex rounded-full px-2 py-1 text-xs font-bold", badgeClass(status))}>
                        {CLEANER_STATUS_LABELS[status]}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <select
                        value={status}
                        disabled={saving}
                        onChange={(event) => void setStatus(row, event.target.value as CleanerStatus)}
                        className="h-9 min-w-[230px] rounded-lg border border-slate-200 bg-white px-2 text-sm disabled:opacity-60"
                      >
                        {status === "busy" ? <option value="busy" disabled>Busy — automatic</option> : null}
                        {MANUAL_STATUSES.map((option) => (
                          <option key={option} value={option}>
                            {CLEANER_STATUS_LABELS[option]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-500">
                      {status === "available" ? "Can receive work" : status === "busy" ? "Working now" : "Blocked from new work"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
