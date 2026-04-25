"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Navigation, Route } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";
import { getCleanerIdHeaders } from "@/lib/cleaner/cleanerClientHeaders";
import { bookingRowToMobileView, ymdLocal } from "@/lib/cleaner/cleanerMobileBookingMap";
import { teamJobAssignmentHeadline } from "@/lib/cleaner/teamJobUiCopy";

type RouteStop = {
  id: string;
  time: string;
  service: string | null;
  locationLabel: string | null;
  sequence: number;
  travelMinutesFromPrev: number;
};

type RouteSchedule = {
  jobs: RouteStop[];
  metrics?: { travelTimeSavedMinutes?: number; totalTravelMinutes?: number };
};

function statusBadge(row: CleanerBookingRow) {
  const st = String(row.status ?? "").toLowerCase();
  if (st === "completed") return <Badge variant="outline">Completed</Badge>;
  if (st === "in_progress") return <Badge variant="default">In progress</Badge>;
  if (st === "assigned" || st === "pending") {
    if (row.en_route_at) return <Badge variant="default">On the way</Badge>;
    return <Badge variant="outline">Booked</Badge>;
  }
  return <Badge variant="outline">{st || "—"}</Badge>;
}

function formatDuration(hours: number) {
  if (hours % 1 === 0) return `${hours}h`;
  return `${hours}h`;
}

function OptimizedRouteToday({ dateYmd, jobSignature }: { dateYmd: string; jobSignature: string }) {
  const [route, setRoute] = useState<RouteSchedule | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);

  useEffect(() => {
    const headers = getCleanerIdHeaders();
    if (!headers) return;
    let cancelled = false;
    setRouteLoading(true);
    void fetch(`/api/cleaner/route?date=${encodeURIComponent(dateYmd)}`, { headers })
      .then((r) => r.json() as Promise<{ route?: RouteSchedule; error?: string }>)
      .then((j) => {
        if (!cancelled) setRoute(j.route ?? null);
      })
      .catch(() => {
        if (!cancelled) setRoute(null);
      })
      .finally(() => {
        if (!cancelled) setRouteLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dateYmd, jobSignature]);

  if (routeLoading) {
    return (
      <div className="mb-6 h-32 animate-pulse rounded-2xl bg-zinc-200/80 dark:bg-zinc-800/80" aria-hidden />
    );
  }

  const jobs = route?.jobs ?? [];
  if (jobs.length < 2) return null;

  const saved = route?.metrics?.travelTimeSavedMinutes ?? 0;

  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center gap-2">
        <Route className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden />
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Optimized route (today)</h2>
      </div>
      <Card className="rounded-2xl border-blue-100 shadow-sm dark:border-blue-900/40">
        <CardContent className="space-y-3 p-4">
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            Suggested stop order from your assigned jobs — uses distance and time windows.
            {saved > 0 ? ` About ${saved} min less driving vs naive ordering.` : null}
          </p>
          <ol className="space-y-2">
            {jobs.map((stop) => (
              <li
                key={stop.id}
                className="flex items-start justify-between gap-2 rounded-xl bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-800/60"
              >
                <div>
                  <span className="font-semibold text-blue-700 dark:text-blue-300">#{stop.sequence}</span>{" "}
                  <span className="font-medium text-zinc-900 dark:text-zinc-50">{stop.time}</span>
                  <p className="text-xs text-zinc-600 dark:text-zinc-300">{stop.service ?? "Cleaning"}</p>
                  <p className="text-xs text-zinc-500">{stop.locationLabel ?? "—"}</p>
                </div>
                <div className="shrink-0 text-right text-[11px] text-zinc-500">
                  {stop.travelMinutesFromPrev > 0 ? <span>+{stop.travelMinutesFromPrev} min drive</span> : <span>Start</span>}
                </div>
              </li>
            ))}
          </ol>
          <p className="text-[11px] text-zinc-500">Open each job for turn-by-turn maps.</p>
        </CardContent>
      </Card>
    </section>
  );
}

export function CleanerScheduleTab({
  rows,
  now,
  loading,
}: {
  rows: CleanerBookingRow[];
  now: Date;
  loading?: boolean;
}) {
  const todayYmd = ymdLocal(now);
  const jobSignature = rows.map((r) => r.id).join(",");

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map((k) => (
          <div key={k} className="h-24 animate-pulse rounded-2xl bg-zinc-200/80 dark:bg-zinc-800/80" />
        ))}
      </div>
    );
  }

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowYmd = ymdLocal(tomorrow);

  const sorted = [...rows].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || (a.time ?? "").localeCompare(b.time ?? ""));

  const groups: { title: string; items: CleanerBookingRow[] }[] = [];
  const push = (title: string, items: CleanerBookingRow[]) => {
    if (items.length) groups.push({ title, items });
  };

  push(
    "Today",
    sorted.filter((j) => (j.date ?? "").slice(0, 10) === todayYmd),
  );
  push(
    "Tomorrow",
    sorted.filter((j) => (j.date ?? "").slice(0, 10) === tomorrowYmd),
  );
  push(
    "Upcoming",
    sorted.filter((j) => {
      const d = (j.date ?? "").slice(0, 10);
      return d && d !== todayYmd && d !== tomorrowYmd;
    }),
  );

  if (groups.length === 0) {
    return (
      <div className="space-y-4">
        <OptimizedRouteToday dateYmd={todayYmd} jobSignature={jobSignature} />
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-6 text-center text-sm text-zinc-600 dark:text-zinc-400">Nothing on your calendar.</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <OptimizedRouteToday dateYmd={todayYmd} jobSignature={jobSignature} />

      {groups.map(({ title, items }) => (
        <section key={title}>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</h2>
          <ul className="space-y-3">
            {items.map((row) => {
              const v = bookingRowToMobileView(row);
              const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v.address)}`;
              return (
                <li key={row.id}>
                  <Card className="rounded-2xl shadow-sm">
                    <CardContent className="flex flex-col gap-3 p-4">
                      <Link href={`/cleaner/job/${row.id}`} className="block">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{v.time}</p>
                          {statusBadge(row)}
                        </div>
                        <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{v.areaLabel}</p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          {v.service} · {formatDuration(v.durationHours)}
                        </p>
                        {row.is_team_job === true ? (
                          <p className="mt-2 text-xs font-medium leading-snug text-blue-800 dark:text-blue-200">
                            {teamJobAssignmentHeadline(
                              typeof row.teamMemberCount === "number" ? row.teamMemberCount : null,
                            )}
                          </p>
                        ) : null}
                      </Link>
                      <a
                        href={mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-200 py-2 text-sm font-medium text-blue-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-blue-300 dark:hover:bg-zinc-800/80"
                      >
                        <Navigation className="h-4 w-4" aria-hidden />
                        Maps
                      </a>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
