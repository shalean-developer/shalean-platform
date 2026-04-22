"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

type Application = {
  id: string;
  name: string;
  phone: string;
  location: string;
  experience: string | null;
  availability: string[] | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
};

type Stats = {
  pendingCount: number;
  approvedToday: number;
  totalCleaners: number;
};

function pill(status: Application["status"]) {
  if (status === "approved") return "bg-emerald-100 text-emerald-800";
  if (status === "rejected") return "bg-rose-100 text-rose-800";
  return "bg-amber-100 text-amber-800";
}

export default function AdminCleanerApplicationsPage() {
  const [rows, setRows] = useState<Application[]>([]);
  const [stats, setStats] = useState<Stats>({ pendingCount: 0, approvedToday: 0, totalCleaners: 0 });
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let active = true;
    const run = async () => {
      const sb = getSupabaseBrowser();
      const session = await sb?.auth.getSession();
      const token = session?.data.session?.access_token;
      if (!token) {
        if (active) {
          setToast("Please sign in as admin.");
          setLoading(false);
        }
        return;
      }
      const res = await fetch("/api/admin/cleaner-applications", { headers: { Authorization: `Bearer ${token}` } });
      const json = (await res.json()) as { applications?: Application[]; stats?: Stats; error?: string };
      if (!active) return;
      if (!res.ok) {
        setToast(json.error ?? "Failed to load applications.");
        setLoading(false);
        return;
      }
      setRows(json.applications ?? []);
      setStats(json.stats ?? { pendingCount: 0, approvedToday: 0, totalCleaners: 0 });
      setLoading(false);
    };
    void run();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  async function review(id: string, action: "approve" | "reject") {
    setWorkingId(id);
    const sb = getSupabaseBrowser();
    const session = await sb?.auth.getSession();
    const token = session?.data.session?.access_token;
    if (!token) {
      setToast("Please sign in as admin.");
      setWorkingId(null);
      return;
    }
    const res = await fetch(`/api/admin/cleaner-applications/${id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action }),
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) {
      setToast(json.error ?? "Update failed.");
      setWorkingId(null);
      return;
    }
    setRows((cur) => cur.map((r) => (r.id === id ? { ...r, status: action === "approve" ? "approved" : "rejected" } : r)));
    setStats((cur) => ({
      ...cur,
      pendingCount: Math.max(0, cur.pendingCount - 1),
      totalCleaners: action === "approve" ? cur.totalCleaners + 1 : cur.totalCleaners,
      approvedToday: action === "approve" ? cur.approvedToday + 1 : cur.approvedToday,
    }));
    setToast(action === "approve" ? "Application approved." : "Application rejected.");
    setWorkingId(null);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (tab !== "all" && row.status !== tab) return false;
      if (!q) return true;
      return row.name.toLowerCase().includes(q) || row.phone.toLowerCase().includes(q);
    });
  }, [rows, search, tab]);

  return (
    <main className="mx-auto max-w-7xl space-y-5 px-4 py-6 md:px-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Cleaner Applications</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Apply → Approve → Receive jobs → Earn</p>
        </div>
        <Link href="/admin" className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
          Back to Overview
        </Link>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Pending applications" value={String(stats.pendingCount)} />
        <StatCard label="Approved today" value={String(stats.approvedToday)} />
        <StatCard label="Total cleaners" value={String(stats.totalCleaners)} />
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <p className="font-medium text-zinc-900 dark:text-zinc-50">Acquisition message</p>
        <p className="mt-1 text-zinc-600 dark:text-zinc-300">Earn up to R500/day</p>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {(["all", "pending", "approved", "rejected"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
              className={[
                "h-10 rounded-full px-4 text-sm font-medium",
                tab === item
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "bg-white text-zinc-700 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-700",
              ].join(" ")}
            >
              {item[0].toUpperCase() + item.slice(1)}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or phone"
          className="h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </section>

      <section className="grid gap-3 md:hidden">
        {loading ? (
          <p className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-500">Loading applications...</p>
        ) : filtered.length === 0 ? (
          <p className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-500">No applications found.</p>
        ) : (
          filtered.map((row) => (
            <article key={row.id} className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-zinc-900 dark:text-zinc-50">{row.name}</p>
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">{row.phone}</p>
                </div>
                <span className={["rounded-full px-2 py-0.5 text-xs font-semibold", pill(row.status)].join(" ")}>{row.status}</span>
              </div>
              <p className="text-sm text-zinc-600 dark:text-zinc-300">Location: {row.location}</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-300">Experience: {row.experience ?? "None"}</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-300">Availability: {(row.availability ?? []).join(", ") || "Not specified"}</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={row.status !== "pending" || workingId === row.id}
                  onClick={() => void review(row.id, "approve")}
                  className="min-h-12 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={row.status !== "pending" || workingId === row.id}
                  onClick={() => void review(row.id, "reject")}
                  className="min-h-12 rounded-lg bg-rose-600 px-3 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            </article>
          ))
        )}
      </section>

      <section className="hidden overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900 md:block">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/50">
            <tr>
              <th className="px-3 py-3">Name</th>
              <th className="px-3 py-3">Phone</th>
              <th className="px-3 py-3">Location</th>
              <th className="px-3 py-3">Experience</th>
              <th className="px-3 py-3">Availability</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {loading ? (
              <tr><td colSpan={7} className="px-3 py-6 text-zinc-500">Loading applications...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-6 text-zinc-500">No applications found.</td></tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2 font-medium">{row.name}</td>
                  <td className="px-3 py-2">{row.phone}</td>
                  <td className="px-3 py-2">{row.location}</td>
                  <td className="px-3 py-2">{row.experience ?? "None"}</td>
                  <td className="px-3 py-2">{(row.availability ?? []).join(", ") || "—"}</td>
                  <td className="px-3 py-2">
                    <span className={["rounded-full px-2 py-0.5 text-xs font-semibold", pill(row.status)].join(" ")}>{row.status}</span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={row.status !== "pending" || workingId === row.id}
                        onClick={() => void review(row.id, "approve")}
                        className="h-10 rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={row.status !== "pending" || workingId === row.id}
                        onClick={() => void review(row.id, "reject")}
                        className="h-10 rounded-md bg-rose-600 px-3 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {toast ? (
        <div className="fixed bottom-4 right-4 z-50 rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900">
          {toast}
        </div>
      ) : null}
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-zinc-900 dark:text-zinc-50">{value}</p>
    </div>
  );
}
