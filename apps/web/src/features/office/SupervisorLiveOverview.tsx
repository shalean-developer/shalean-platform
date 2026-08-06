"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseSession } from "@/lib/supabase/browser";

type WorkItem = { priority?: string };
type ScheduleResponse = {
  bookings?: Array<{ status?: string | null }>;
  summary?: { total?: number; completed?: number; inProgress?: number; unassigned?: number };
};

function johannesburgToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function SupervisorLiveOverview({ teamCount }: { teamCount: number }) {
  const [schedule, setSchedule] = useState<ScheduleResponse | null>(null);
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const session = await getSupabaseSession();
      const token = session?.access_token;
      if (!token) {
        if (!cancelled) { setError("Office session unavailable."); setLoading(false); }
        return;
      }
      const headers = { Authorization: `Bearer ${token}` };
      try {
        const [scheduleResponse, workResponse] = await Promise.all([
          fetch(`/api/admin/schedule/day?date=${encodeURIComponent(johannesburgToday())}`, { headers, cache: "no-store" }),
          fetch("/api/admin/my-work", { headers, cache: "no-store" }),
        ]);
        if (!scheduleResponse.ok) throw new Error("Could not load your team schedule.");
        const schedulePayload = (await scheduleResponse.json().catch(() => ({}))) as ScheduleResponse;
        const workPayload = workResponse.ok ? ((await workResponse.json().catch(() => ({}))) as { items?: WorkItem[] }) : {};
        if (!cancelled) { setSchedule(schedulePayload); setWorkItems(workPayload.items ?? []); }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load Supervisor overview.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const stats = useMemo(() => {
    const bookings = schedule?.bookings ?? [];
    const summary = schedule?.summary;
    const statuses = bookings.map((booking) => String(booking.status ?? "").toLowerCase());
    return {
      total: summary?.total ?? bookings.length,
      completed: summary?.completed ?? statuses.filter((status) => status === "completed").length,
      inProgress: summary?.inProgress ?? statuses.filter((status) => status === "in_progress").length,
      unassigned: summary?.unassigned ?? statuses.filter((status) => status === "pending" || status === "unassigned").length,
      urgent: workItems.filter((item) => item.priority === "critical" || item.priority === "high").length,
    };
  }, [schedule, workItems]);

  const cards = [
    { label: "Bookings today", value: stats.total, note: `${stats.completed} completed · ${stats.inProgress} in progress`, href: "/office/schedule" },
    { label: "Needs allocation", value: stats.unassigned, note: "Within your permitted scope", href: "/office/bookings" },
    { label: "Urgent actions", value: stats.urgent, note: "Critical and high-priority items", href: "/office" },
    { label: "Assigned teams", value: teamCount, note: "Linked to your Supervisor role", href: "/office/teams" },
  ];

  return (
    <section className="space-y-4" aria-label="Supervisor live overview">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-950">Today&apos;s team overview</h2>
          <p className="text-sm text-slate-500">Live, permission-scoped bookings and actions for your assigned team.</p>
        </div>
        {error ? <p className="text-xs text-amber-700">{error}</p> : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Link key={card.label} href={card.href} className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:border-blue-200">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{card.label}</p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-slate-950">{loading ? "…" : card.value}</p>
            <p className="mt-1 text-xs text-slate-500">{card.note}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
