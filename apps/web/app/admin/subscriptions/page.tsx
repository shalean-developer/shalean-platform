"use client";

import { useEffect, useMemo, useState } from "react";
import ActionMenu from "@/components/admin/ActionMenu";
import DataTable from "@/components/admin/DataTable";
import MetricsGrid from "@/components/admin/MetricsGrid";
import SlideOverPanel from "@/components/admin/SlideOverPanel";
import StatusBadge from "@/components/admin/StatusBadge";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

type SubscriptionRow = {
  id: string;
  user_id: string;
  service_type: string;
  frequency: "weekly" | "biweekly" | "monthly";
  time_slot: string;
  address: string;
  price_per_visit: number;
  status: "active" | "paused" | "cancelled";
  next_booking_date: string;
  payment_status: "pending" | "success" | "failed";
  retry_count: number;
  last_payment_error: string | null;
  last_charge_reference: string | null;
  last_payment_date: string | null;
};

function money(v: number): string {
  return `R ${Number(v || 0).toLocaleString("en-ZA")}`;
}

function tone(status: string): "green" | "amber" | "red" | "zinc" {
  if (status === "active") return "green";
  if (status === "paused") return "amber";
  if (status === "cancelled") return "red";
  return "zinc";
}

export default function AdminSubscriptionsPage() {
  const [rows, setRows] = useState<SubscriptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "paused" | "cancelled">("all");
  const [planFilter, setPlanFilter] = useState<"all" | "weekly" | "biweekly" | "monthly">("all");
  const [search, setSearch] = useState("");

  const [selected, setSelected] = useState<SubscriptionRow | null>(null);

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  async function load() {
    let active = true;
    try {
      setLoading(true);
      const sb = getSupabaseBrowser();
      const session = await sb?.auth.getSession();
      const token = session?.data.session?.access_token;
      if (!token) {
        if (active) {
          setError("Please sign in as admin.");
          setLoading(false);
        }
        return;
      }
      const res = await fetch("/api/admin/subscriptions", { headers: { Authorization: `Bearer ${token}` } });
      const json = (await res.json()) as { subscriptions?: SubscriptionRow[]; error?: string };
      if (!active) return;
      if (!res.ok) {
        setError(json.error ?? "Failed to load subscriptions.");
        setLoading(false);
        return;
      }
      setRows(json.subscriptions ?? []);
      setError(null);
      setLoading(false);
    } catch (e) {
      if (active) {
        setError(e instanceof Error ? e.message : "Failed to load subscriptions.");
        setLoading(false);
      }
    }
    return () => {
      active = false;
    };
  }

  async function patchSubscription(id: string, patch: { status?: "active" | "paused" | "cancelled"; next_booking_date?: string | null }) {
    const sb = getSupabaseBrowser();
    const session = await sb?.auth.getSession();
    const token = session?.data.session?.access_token;
    if (!token) throw new Error("Session expired.");
    const res = await fetch("/api/admin/subscriptions", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) throw new Error(json.error ?? "Update failed.");
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (planFilter !== "all" && r.frequency !== planFilter) return false;
      if (!q) return true;
      return r.user_id.toLowerCase().includes(q) || r.address.toLowerCase().includes(q) || r.service_type.toLowerCase().includes(q);
    });
  }, [rows, search, statusFilter, planFilter]);

  const metrics = useMemo(() => {
    const activeCount = rows.filter((r) => r.status === "active").length;
    const monthlyRevenue = rows.filter((r) => r.status === "active").reduce((sum, r) => {
      const multiplier = r.frequency === "weekly" ? 4 : r.frequency === "biweekly" ? 2 : 1;
      return sum + Number(r.price_per_visit || 0) * multiplier;
    }, 0);
    const churnRate = rows.length ? Math.round((rows.filter((r) => r.status === "cancelled").length / rows.length) * 100) : 0;
    const avgPlanValue = rows.length
      ? Math.round(rows.reduce((sum, r) => sum + Number(r.price_per_visit || 0), 0) / rows.length)
      : 0;
    return [
      { label: "Active subscriptions", value: String(activeCount) },
      { label: "Monthly revenue", value: money(monthlyRevenue) },
      { label: "Churn rate", value: `${churnRate}%` },
      { label: "Avg plan value", value: money(avgPlanValue) },
    ];
  }, [rows]);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Subscriptions</h2>
        <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">Recurring cleaning plans and revenue</p>
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
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <select
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value as typeof planFilter)}
              className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            >
              <option value="all">All plan types</option>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Bi-weekly</option>
              <option value="monthly">Monthly</option>
            </select>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customer"
              className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
          </div>
        </section>

        {error ? <p className="text-sm text-rose-700 dark:text-rose-400">{error}</p> : null}

        <DataTable
          headers={["Customer", "Plan", "Frequency", "Next clean", "Status", "Revenue", "Actions"]}
          loading={loading}
          hasRows={filtered.length > 0}
          emptyMessage="No subscriptions yet."
        >
          {filtered.map((r) => (
            <tr key={r.id} className="cursor-pointer transition hover:bg-zinc-50 dark:hover:bg-zinc-800/50" onClick={() => setSelected(r)}>
              <td className="px-3 py-3">
                <p className="font-mono text-xs text-zinc-700 dark:text-zinc-200">{r.user_id.slice(0, 8)}...</p>
                <p className="text-xs text-zinc-500">{r.address}</p>
              </td>
              <td className="px-3 py-3">{r.service_type}</td>
              <td className="px-3 py-3 capitalize">{r.frequency}</td>
              <td className="px-3 py-3">
                {r.next_booking_date} {r.time_slot}
              </td>
              <td className="px-3 py-3">
                <StatusBadge label={r.status} tone={tone(r.status)} />
              </td>
              <td className="px-3 py-3">{money(r.price_per_visit)}</td>
              <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                <ActionMenu
                  items={[
                    { label: "View details", onSelect: () => setSelected(r) },
                    { label: "Pause", onSelect: () => void patchSubscription(r.id, { status: "paused" }).then(() => load()).then(() => setToast("Subscription paused")) },
                    { label: "Cancel", onSelect: () => void patchSubscription(r.id, { status: "cancelled" }).then(() => load()).then(() => setToast("Subscription cancelled")), tone: "danger" },
                    { label: "Reschedule next clean", onSelect: () => {
                      const date = window.prompt("Next booking date (YYYY-MM-DD):", r.next_booking_date);
                      if (!date) return;
                      void patchSubscription(r.id, { next_booking_date: date }).then(() => load()).then(() => setToast("Next clean updated"));
                    } },
                  ]}
                />
              </td>
            </tr>
          ))}
        </DataTable>

        <section className="grid gap-3 md:hidden">
          {filtered.map((r) => (
            <article key={r.id} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-zinc-900 dark:text-zinc-100">{r.service_type}</p>
                <StatusBadge label={r.status} tone={tone(r.status)} />
              </div>
              <p className="mt-1 text-xs text-zinc-500">{r.user_id.slice(0, 8)}...</p>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">Next: {r.next_booking_date} {r.time_slot}</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-300">Revenue: {money(r.price_per_visit)}</p>
              <button type="button" onClick={() => setSelected(r)} className="mt-3 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">
                View details
              </button>
            </article>
          ))}
        </section>
      </main>

      <SlideOverPanel
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.service_type ?? "Subscription details"}
        subtitle={selected ? `${selected.frequency} · ${selected.time_slot}` : ""}
      >
        {selected ? (
          <>
            <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Customer info</h3>
              <p className="mt-2 font-mono text-xs text-zinc-600 dark:text-zinc-300">{selected.user_id}</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-300">{selected.address}</p>
            </section>
            <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Schedule</h3>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">Frequency: {selected.frequency}</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-300">Next clean: {selected.next_booking_date} {selected.time_slot}</p>
            </section>
            <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Payment history</h3>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">Last payment: {selected.last_payment_date ?? "—"}</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-300">Charge ref: {selected.last_charge_reference ?? "—"}</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-300">Payment status: {selected.payment_status}</p>
              {selected.last_payment_error ? <p className="mt-1 text-sm text-rose-700 dark:text-rose-300">{selected.last_payment_error}</p> : null}
            </section>
            <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Upcoming bookings</h3>
              <p className="mt-2 text-sm text-zinc-500">Next booking is scheduled for {selected.next_booking_date}.</p>
            </section>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void patchSubscription(selected.id, { status: "paused" }).then(() => load()).then(() => setToast("Subscription paused"))}
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
              >
                Pause
              </button>
              <button
                type="button"
                onClick={() => void patchSubscription(selected.id, { status: "cancelled" }).then(() => load()).then(() => setToast("Subscription cancelled"))}
                className="rounded-lg border border-rose-300 px-3 py-2 text-sm text-rose-700 dark:border-rose-700 dark:text-rose-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const date = window.prompt("Next booking date (YYYY-MM-DD):", selected.next_booking_date);
                  if (!date) return;
                  void patchSubscription(selected.id, { next_booking_date: date }).then(() => load()).then(() => setToast("Next clean updated"));
                }}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white"
              >
                Reschedule
              </button>
            </div>
          </>
        ) : null}
      </SlideOverPanel>

      {toast ? (
        <div className="fixed bottom-4 right-4 z-[80] rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
