"use client";

import Link from "next/link";
import { useState } from "react";
import { Search, MapPin, Download, RefreshCw, AlertCircle, Plus, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminData } from "@/hooks/useAdminData";
import { getSupabaseAccessToken } from "@/lib/supabase/browser";

type CustomerRow = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  location: string | null;
  suburb: string | null;
  total_bookings: number;
  total_spend_zar: number;
  last_booking_at: string | null;
  tier: string | null;
};

type CustomersResponse = {
  customers: Array<
    Partial<CustomerRow> & {
      email: string;
      totalBookings?: number;
      totalSpendZar?: number;
      lastBookingAt?: string | null;
      user_id?: string | null;
    }
  >;
};

function normalizeCustomer(
  c: CustomersResponse["customers"][number],
): CustomerRow {
  const email = c.email.trim().toLowerCase();
  const userId = c.user_id?.trim() || (c.id && /^[0-9a-f-]{36}$/i.test(c.id) ? c.id : null);
  return {
    id: userId ?? email,
    email,
    full_name: c.full_name ?? null,
    phone: c.phone ?? null,
    location: c.location ?? null,
    suburb: c.suburb ?? null,
    total_bookings: c.total_bookings ?? c.totalBookings ?? 0,
    total_spend_zar: c.total_spend_zar ?? c.totalSpendZar ?? 0,
    last_booking_at: c.last_booking_at ?? c.lastBookingAt ?? null,
    tier: c.tier ?? null,
  };
}

function formatZar(zar: number): string {
  return `R ${Math.round(zar).toLocaleString("en-ZA")}`;
}

function formatRelativeDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}

function getTierBadge(tier: string | null, totalBookings: number): { label: string; cls: string } {
  if (tier === "gold" || tier === "platinum" || totalBookings >= 10) {
    return { label: "VIP", cls: "bg-yellow-100 text-yellow-700" };
  }
  if (totalBookings >= 3) return { label: "Active", cls: "bg-emerald-100 text-emerald-700" };
  if (totalBookings === 0) return { label: "Inactive", cls: "bg-slate-100 text-slate-600" };
  return { label: "Active", cls: "bg-emerald-100 text-emerald-700" };
}

function getInitials(name: string | null, email: string): string {
  if (name) {
    return name
      .split(" ")
      .map((n) => n[0] ?? "")
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

function isDeletableCustomerId(id: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(id);
}

export default function CustomersPage() {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const { data, loading, error, refetch } = useAdminData<CustomersResponse>("/api/admin/customers");

  const customers = (data?.customers ?? []).map(normalizeCustomer);

  const filtered = customers.filter(
    (c) =>
      !search ||
      (c.full_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase()) ||
      (c.phone ?? "").includes(search) ||
      (c.suburb ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  const selectableFiltered = filtered.filter((c) => isDeletableCustomerId(c.id));
  const allFilteredSelected =
    selectableFiltered.length > 0 && selectableFiltered.every((c) => selectedIds.has(c.id));
  const someFilteredSelected = selectableFiltered.some((c) => selectedIds.has(c.id));

  function customerLabel(id: string): string {
    const c = customers.find((row) => row.id === id);
    return c?.full_name ?? c?.email ?? id.slice(0, 8);
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllFiltered() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        for (const c of selectableFiltered) next.delete(c.id);
      } else {
        for (const c of selectableFiltered) next.add(c.id);
      }
      return next;
    });
  }

  const vipCount = customers.filter((c) => c.total_bookings >= 10 || c.tier === "gold" || c.tier === "platinum").length;
  const activeCount = customers.filter((c) => c.total_bookings >= 1).length;
  const totalSpend = customers.reduce((s, c) => s + (c.total_spend_zar ?? 0), 0);

  async function deleteCustomer(c: CustomerRow) {
    if (!/^[0-9a-f-]{36}$/i.test(c.id)) return;
    const label = c.full_name ?? c.email;
    const ok = window.confirm(
      `Delete customer "${label}"?\n\nOnly accounts with no bookings, invoices, or recurring plans can be removed.`,
    );
    if (!ok) return;

    setActionError(null);
    setActionMessage(null);
    setDeletingId(c.id);
    try {
      const token = await getSupabaseAccessToken();
      if (!token) {
        setActionError("Not signed in.");
        return;
      }
      const res = await fetch(`/api/admin/customers/${encodeURIComponent(c.id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setActionError(json.error ?? "Delete failed.");
        return;
      }
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(c.id);
        return next;
      });
      await refetch();
    } finally {
      setDeletingId(null);
    }
  }

  async function bulkDeleteSelected() {
    const ids = [...selectedIds].filter(isDeletableCustomerId);
    if (ids.length === 0) return;

    const ok = window.confirm(
      `Delete ${ids.length} selected customer${ids.length === 1 ? "" : "s"}?\n\nOnly accounts with no bookings, invoices, or recurring plans can be removed. Others will be skipped with an error.`,
    );
    if (!ok) return;

    setActionError(null);
    setActionMessage(null);
    setBulkDeleting(true);
    try {
      const token = await getSupabaseAccessToken();
      if (!token) {
        setActionError("Not signed in.");
        return;
      }
      const res = await fetch("/api/admin/customers/bulk-delete", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ user_ids: ids }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        deleted?: string[];
        failed?: Array<{ user_id: string; error: string }>;
      };
      if (!res.ok) {
        setActionError(json.error ?? "Bulk delete failed.");
        return;
      }

      const deleted = json.deleted ?? [];
      const failed = json.failed ?? [];
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of deleted) next.delete(id);
        return next;
      });

      if (deleted.length > 0 && failed.length === 0) {
        setActionMessage(`Deleted ${deleted.length} customer${deleted.length === 1 ? "" : "s"}.`);
      } else if (deleted.length > 0) {
        setActionMessage(`Deleted ${deleted.length}. ${failed.length} could not be removed.`);
        setActionError(
          failed
            .slice(0, 8)
            .map((f) => `${customerLabel(f.user_id)}: ${f.error}`)
            .join(" · "),
        );
      } else {
        setActionError(
          failed.length > 0
            ? failed
                .slice(0, 8)
                .map((f) => `${customerLabel(f.user_id)}: ${f.error}`)
                .join(" · ")
            : "No customers could be deleted.",
        );
      }

      await refetch();
    } finally {
      setBulkDeleting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Customers</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Manage customer accounts, booking history and contact details.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/office/customers/create"
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 shadow-sm"
          >
            <Plus className="h-4 w-4" /> Add customer
          </Link>
          <button
            type="button"
            onClick={() => void refetch()}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 shadow-sm"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </button>
          <button
            type="button"
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 shadow-sm"
          >
            <Download className="h-4 w-4" /> Export
          </button>
        </div>
      </div>

      {actionMessage && (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <p className="text-sm text-emerald-700">{actionMessage}</p>
          <button type="button" onClick={() => setActionMessage(null)} className="ml-auto text-xs font-semibold text-emerald-600 hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {actionError && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
          <p className="text-sm text-red-700">{actionError}</p>
          <button type="button" onClick={() => setActionError(null)} className="ml-auto text-xs font-semibold text-red-600 hover:underline">
            Dismiss
          </button>
        </div>
      )}

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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total customers", value: loading ? "—" : customers.length,  color: "text-slate-800" },
          { label: "Active",          value: loading ? "—" : activeCount,        color: "text-emerald-600" },
          { label: "VIP",             value: loading ? "—" : vipCount,           color: "text-yellow-600" },
          { label: "Total revenue",   value: loading ? "—" : formatZar(totalSpend), color: "text-blue-600" },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl bg-white border border-slate-100 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k.label}</p>
            <p className={cn("mt-1 text-2xl font-bold", k.color)}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl bg-white border border-slate-100 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
          {selectedIds.size > 0 && (
            <button
              type="button"
              disabled={bulkDeleting}
              onClick={() => void bulkDeleteSelected()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              {bulkDeleting ? "Deleting…" : `Delete selected (${selectedIds.size})`}
            </button>
          )}
          {bulkDeleting && (
            <p className="text-xs text-slate-500">Removing accounts — this can take up to a minute.</p>
          )}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search customers…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-sm placeholder:text-slate-400 focus:outline-none focus:border-blue-300"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label="Select all customers"
                    checked={allFilteredSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someFilteredSelected && !allFilteredSelected;
                    }}
                    onChange={toggleSelectAllFiltered}
                    disabled={selectableFiltered.length === 0 || loading || bulkDeleting}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
                {["Customer", "Area", "Bookings", "Total spend", "Last booking", "Status", "Actions"].map((h) => (
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
                    <td colSpan={8} className="px-4 py-3">
                      <div className="h-5 animate-pulse rounded-lg bg-slate-100" />
                    </td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-sm text-slate-400">
                    {error ? "Failed to load customers." : "No customers found."}
                  </td>
                </tr>
              ) : (
                filtered.map((c) => {
                  const badge = getTierBadge(c.tier, c.total_bookings);
                  return (
                    <tr key={c.id} className={cn("group hover:bg-slate-50/50 transition-colors", selectedIds.has(c.id) && "bg-blue-50/40")}>
                      <td className="px-4 py-3">
                        {isDeletableCustomerId(c.id) ? (
                          <input
                            type="checkbox"
                            aria-label={`Select ${c.full_name ?? c.email}`}
                            checked={selectedIds.has(c.id)}
                            onChange={() => toggleSelected(c.id)}
                            disabled={bulkDeleting || deletingId === c.id}
                            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">
                            {getInitials(c.full_name, c.email)}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-800">
                              {c.full_name ?? c.email}
                            </p>
                            <p className="text-xs text-slate-400">{c.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 text-xs text-slate-500">
                          <MapPin className="h-3 w-3" />
                          {c.suburb ?? c.location ?? "—"}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-slate-700">
                        {c.total_bookings}
                      </td>
                      <td className="px-4 py-3 text-sm font-bold text-emerald-600">
                        {formatZar(c.total_spend_zar)}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {formatRelativeDate(c.last_booking_at)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold", badge.cls)}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {isDeletableCustomerId(c.id) ? (
                          <div className="flex flex-wrap items-center gap-1.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                            <Link
                              href={`/office/customers/${c.id}`}
                              className="rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-100 transition-colors"
                            >
                              View
                            </Link>
                            <Link
                              href={`/office/customers/${c.id}?edit=1`}
                              className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition-colors"
                            >
                              <Pencil className="h-3 w-3" /> Edit
                            </Link>
                            <button
                              type="button"
                              disabled={deletingId === c.id}
                              onClick={() => void deleteCustomer(c)}
                              className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50"
                            >
                              <Trash2 className="h-3 w-3" />
                              {deletingId === c.id ? "…" : "Delete"}
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">No account</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
          <p className="text-xs text-slate-400">
            {loading ? "Loading…" : `${filtered.length} of ${customers.length} customers`}
          </p>
        </div>
      </div>
    </div>
  );
}
