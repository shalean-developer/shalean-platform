"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { todayYmdJohannesburg } from "@/lib/booking/dateInJohannesburg";

type BookingRow = {
  id: string;
  customer_email: string | null;
  service: string | null;
  date: string | null;
  time: string | null;
  location: string | null;
  total_paid_zar: number | null;
  amount_paid_cents: number | null;
  status: string | null;
  user_id: string | null;
  cleaner_id: string | null;
  assigned_at: string | null;
  en_route_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  paystack_reference: string;
};

type CleanerOption = { id: string; full_name: string; status: string | null };

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
};

function zar(r: BookingRow): number {
  if (typeof r.total_paid_zar === "number") return r.total_paid_zar;
  return Math.round((r.amount_paid_cents ?? 0) / 100);
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

function AdminAssignForm({
  bookingId,
  cleaners,
  onDone,
}: {
  bookingId: string;
  cleaners: CleanerOption[];
  onDone: () => void;
}) {
  const [cleanerId, setCleanerId] = useState("");
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!cleanerId.trim()) {
      setMsg("Pick a cleaner.");
      return;
    }
    setBusy(true);
    setMsg(null);
    const sb = getSupabaseBrowser();
    const { data: sessionData } = await sb?.auth.getSession() ?? { data: { session: null } };
    const token = sessionData.session?.access_token;
    if (!token) {
      setMsg("Session expired.");
      setBusy(false);
      return;
    }
    const res = await fetch(`/api/admin/bookings/${encodeURIComponent(bookingId)}/assign`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ cleanerId: cleanerId.trim(), force }),
    });
    const j = (await res.json()) as { error?: string };
    if (!res.ok) {
      setMsg(j.error ?? "Assign failed.");
      setBusy(false);
      return;
    }
    onDone();
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="mt-2 space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-900/80">
      <select
        value={cleanerId}
        onChange={(e) => setCleanerId(e.target.value)}
        className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs dark:border-zinc-600 dark:bg-zinc-900"
      >
        <option value="">Select cleaner…</option>
        {cleaners.map((c) => (
          <option key={c.id} value={c.id}>
            {c.full_name} ({c.status ?? "?"})
          </option>
        ))}
      </select>
      <label className="flex items-center gap-2 text-[11px] text-zinc-600 dark:text-zinc-400">
        <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
        Override availability
      </label>
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-md bg-emerald-600 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
      >
        {busy ? "Saving…" : "Apply assignment"}
      </button>
      {msg ? <p className="text-[11px] text-red-600 dark:text-red-400">{msg}</p> : null}
    </form>
  );
}

export default function AdminBookingsPage() {
  const [filter, setFilter] = useState<"all" | "today" | "upcoming" | "completed">("all");
  const [rows, setRows] = useState<BookingRow[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [failedJobs, setFailedJobs] = useState<FailedJob[]>([]);
  const [cleaners, setCleaners] = useState<CleanerOption[]>([]);
  const [assignBookingId, setAssignBookingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const today = useMemo(() => todayYmdJohannesburg(), []);

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

    const q = filter === "all" ? "" : `?filter=${encodeURIComponent(filter)}`;
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
      error?: string;
    };

    setError(null);
    setRows(json.bookings ?? []);
    setMetrics(json.metrics ?? null);
    setFailedJobs(json.failedJobs ?? []);

    const cr = await fetch("/api/admin/cleaners", { headers: { Authorization: `Bearer ${token}` } });
    if (cr.ok) {
      const cj = (await cr.json()) as { cleaners?: CleanerOption[] };
      setCleaners(cj.cleaners ?? []);
    }

    setLoading(false);
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

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
    <div className="min-h-dvh bg-zinc-100 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Admin</p>
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Bookings</h1>
          </div>
          <Link href="/" className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
            Home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {metrics ? (
          <>
            <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
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
            <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
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
            <strong>{metrics?.failedJobsCount ?? failedJobs.length}</strong> failed job(s) in queue
          </span>
        </div>

        {failedJobs.length > 0 ? (
          <div className="mb-6 overflow-hidden rounded-xl border border-red-200 bg-white dark:border-red-900/50 dark:bg-zinc-900">
            <div className="border-b border-red-100 bg-red-50 px-4 py-2 dark:border-red-900/40 dark:bg-red-950/50">
              <h2 className="text-sm font-semibold text-red-900 dark:text-red-100">Failed booking inserts</h2>
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

        <div className="mb-4 flex flex-wrap gap-2">
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
              onClick={() => setFilter(k)}
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
                <th className="px-3 py-3">Location</th>
                <th className="px-3 py-3">Price</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Cleaner</th>
                <th className="px-3 py-3">Flags</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {rows.map((r) => {
                const f = adminRowFlags(r, today);
                const tags: string[] = [];
                if (r.user_id == null) tags.push("no user");
                if (f.paymentMissing) tags.push("no payment");
                if (f.statusInconsistent) tags.push("stale active job");
                if (f.missingEmail) tags.push("no email");
                if (!tags.length) tags.push("ok");
                return (
                  <tr key={r.id} className={rowHighlightClass(r, today)}>
                    <td className="max-w-[180px] truncate px-3 py-2 text-zinc-800 dark:text-zinc-200">
                      {r.customer_email ?? "—"}
                    </td>
                    <td className="px-3 py-2">{r.service ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2">{formatWhen(r.date, r.time)}</td>
                    <td className="max-w-[200px] truncate px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {r.location ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-medium tabular-nums">R {zar(r).toLocaleString("en-ZA")}</td>
                    <td className="px-3 py-2 text-xs uppercase">{r.status ?? "—"}</td>
                    <td className="max-w-[200px] px-3 py-2 align-top text-xs">
                      <p className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
                        {r.cleaner_id ? `${r.cleaner_id.slice(0, 8)}…` : "—"}
                      </p>
                      <button
                        type="button"
                        className="mt-1 text-left font-semibold text-emerald-700 dark:text-emerald-400"
                        onClick={() => setAssignBookingId((id) => (id === r.id ? null : r.id))}
                      >
                        {assignBookingId === r.id ? "Close" : "Assign"}
                      </button>
                      {assignBookingId === r.id ? (
                        <AdminAssignForm
                          bookingId={r.id}
                          cleaners={cleaners}
                          onDone={() => {
                            setAssignBookingId(null);
                            void load();
                          }}
                        />
                      ) : null}
                    </td>
                    <td className="max-w-[220px] px-3 py-2 text-[11px] leading-snug text-zinc-600 dark:text-zinc-400">
                      {tags.join(" · ")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-zinc-500">No rows for this filter.</p>
          ) : null}
        </div>
      </main>
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
