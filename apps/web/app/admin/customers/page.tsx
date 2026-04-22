"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fetchCustomers, type AdminCustomerRow } from "@/lib/admin/dashboard";

export default function AdminCustomersPage() {
  const [customers, setCustomers] = useState<AdminCustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setCustomers(await fetchCustomers());
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load customers.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const stats = useMemo(() => {
    const total = customers.length;
    const repeat = customers.filter((c) => c.totalBookings >= 2).length;
    const repeatRate = total > 0 ? Math.round((repeat / total) * 1000) / 10 : 0;
    const totalSpend = customers.reduce((s, c) => s + c.totalSpendZar, 0);
    const avgSpend = total > 0 ? Math.round(totalSpend / total) : 0;
    return { total, repeatRate, avgSpend };
  }, [customers]);

  return (
    <div className="min-h-dvh bg-zinc-100 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-500">Admin</p>
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Customers</h1>
          </div>
          <Link href="/admin/bookings" className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Bookings</Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
          <StatCard label="Total customers" value={String(stats.total)} />
          <StatCard label="Repeat rate" value={`${stats.repeatRate}%`} />
          <StatCard label="Avg spend" value={`R ${stats.avgSpend.toLocaleString("en-ZA")}`} />
        </div>

        {error ? <p className="mb-4 text-sm text-rose-700">{error}</p> : null}
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/80 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-3">Email</th>
                <th className="px-3 py-3">Total bookings</th>
                <th className="px-3 py-3">Total spend</th>
                <th className="px-3 py-3">Last booking</th>
                <th className="px-3 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {loading ? (
                <tr><td colSpan={5} className="px-3 py-8 text-sm text-zinc-500">Loading customers…</td></tr>
              ) : customers.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-8 text-sm text-zinc-500">No customers found.</td></tr>
              ) : (
                customers.map((c) => (
                  <tr key={c.email}>
                    <td className="px-3 py-2 font-medium">{c.email}</td>
                    <td className="px-3 py-2">{c.totalBookings}</td>
                    <td className="px-3 py-2">R {c.totalSpendZar.toLocaleString("en-ZA")}</td>
                    <td className="px-3 py-2">{c.lastBookingAt ? new Date(c.lastBookingAt).toLocaleDateString("en-ZA") : "—"}</td>
                    <td className="px-3 py-2">
                      <span
                        className={[
                          "rounded-full px-2 py-0.5 text-xs font-semibold",
                          c.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-zinc-100 text-zinc-700",
                        ].join(" ")}
                      >
                        {c.status === "active" ? "Active" : "Inactive"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">{value}</p>
    </div>
  );
}
