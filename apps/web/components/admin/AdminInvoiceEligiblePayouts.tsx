"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

type BookingLine = { booking_id: string; date: string | null; amount_cents: number };

type CleanerGroup = {
  cleaner_id: string;
  cleaner_name: string;
  cleaner_phone: string;
  total_cents: number;
  bookings: BookingLine[];
};

function zarFromCents(cents: number): string {
  return `R ${(cents / 100).toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildCsv(groups: CleanerGroup[]): string {
  const lines = ["Cleaner,Booking ID,Date,Amount (ZAR)"];
  for (const group of groups) {
    const cleaner = csvEscape(group.cleaner_name);
    for (const booking of group.bookings) {
      const zar = (booking.amount_cents / 100).toFixed(2);
      const date = (booking.date ?? "").slice(0, 10);
      lines.push([cleaner, csvEscape(booking.booking_id), csvEscape(date), zar].join(","));
    }
  }
  return lines.join("\n");
}

export function AdminInvoiceEligiblePayouts() {
  const [groups, setGroups] = useState<CleanerGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const getToken = useCallback(async () => {
    const sb = getSupabaseBrowser();
    const token = (await sb?.auth.getSession())?.data.session?.access_token;
    if (!token) throw new Error("Please sign in as an admin.");
    return token;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/payouts/eligible", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as { groups?: CleanerGroup[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not load eligible payouts.");
      setGroups(Array.isArray(json.groups) ? json.groups : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed.");
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exportCsv = () => {
    if (groups.length === 0) return;
    const blob = new Blob([buildCsv(groups)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `eligible-payouts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const grandTotal = useMemo(
    () => groups.reduce((sum, group) => sum + group.total_cents, 0),
    [groups],
  );

  if (loading) {
    return (
      <p className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900">
        Loading eligible bookings…
      </p>
    );
  }

  if (error) {
    return (
      <p className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-100">
        {error}
      </p>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <p className="font-medium text-zinc-900 dark:text-zinc-50">No payouts ready</p>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Bookings appear here when customer invoices are fully paid and payout eligibility is confirmed.
        </p>
      </div>
    );
  }

  return (
    <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Invoice-eligible earnings
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Read-only allocation view. Cleaner payments are settled through the governed monthly payout and bank-transfer workflow.
          </p>
          <p className="mt-2 text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
            Total eligible: {zarFromCents(grandTotal)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            Export CSV
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-100 dark:border-zinc-800">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950/50">
            <tr>
              <th className="px-3 py-2">Cleaner</th>
              <th className="px-3 py-2">Bookings</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2"> </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {groups.map((group) => {
              const open = expanded.has(group.cleaner_id);
              return (
                <Fragment key={group.cleaner_id}>
                  <tr className="align-top">
                    <td className="px-3 py-3">
                      <p className="font-medium text-zinc-900 dark:text-zinc-50">
                        {group.cleaner_name}
                      </p>
                      {group.cleaner_phone ? (
                        <p className="text-xs text-zinc-500">{group.cleaner_phone}</p>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 tabular-nums text-zinc-700 dark:text-zinc-300">
                      {group.bookings.length}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                      {zarFromCents(group.total_cents)}
                    </td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={() => toggleExpand(group.cleaner_id)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline dark:text-blue-400"
                      >
                        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        {open ? "Hide" : "Show"} bookings
                      </button>
                    </td>
                  </tr>
                  {open ? (
                    <tr className="bg-zinc-50/90 dark:bg-zinc-950/50">
                      <td colSpan={4} className="px-3 py-2">
                        <ul className="space-y-1 text-xs">
                          {group.bookings.map((booking) => (
                            <li
                              key={`${group.cleaner_id}:${booking.booking_id}`}
                              className="flex flex-wrap justify-between gap-2 font-mono text-zinc-700 dark:text-zinc-300"
                            >
                              <span>{booking.booking_id}</span>
                              <span>{(booking.date ?? "—").slice(0, 10)}</span>
                              <span className="font-semibold">
                                {zarFromCents(booking.amount_cents)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
