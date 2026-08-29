"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, Clock, UserCheck, Flag, Search, RefreshCw, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminData } from "@/hooks/useAdminData";
import { OfficeZohoPageHeader, OfficeZohoSecondaryButton } from "@/components/admin/office/OfficeZohoChrome";

type BreachRow = {
  id: string;
  customer_name: string | null;
  customer_email: string | null;
  service: string | null;
  date: string | null;
  time: string | null;
  cleaner_id: string | null;
  became_pending_at: string | null;
  created_at: string;
  status: string | null;
  dispatch_status: string | null;
  team_id: string | null;
  team?: { id: string; name: string | null } | null;
};

type BookingsResponse = {
  bookings: BreachRow[];
};

function minutesOverdue(row: BreachRow): number {
  const clock = row.became_pending_at ?? row.created_at;
  if (!clock) return 0;
  const diffMs = Date.now() - new Date(clock).getTime();
  return Math.floor(diffMs / 60_000);
}

function formatOverdue(mins: number): string {
  if (mins < 60) return `${mins}m overdue`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m overdue` : `${h}h overdue`;
}

function severityFromMinutes(mins: number): "critical" | "high" | "medium" {
  if (mins >= 120) return "critical";
  if (mins >= 30) return "high";
  return "medium";
}

const SEV_MAP = {
  critical: { label: "Critical", cls: "bg-red-100 text-red-700", dotColor: "bg-red-500" },
  high: { label: "High", cls: "bg-orange-100 text-orange-700", dotColor: "bg-orange-500" },
  medium: { label: "Medium", cls: "bg-yellow-100 text-yellow-700", dotColor: "bg-yellow-500" },
};

export default function SlaBreachesPage() {
  const [search, setSearch] = useState("");
  const [sevFilter, setSevFilter] = useState<"all" | "critical" | "high" | "medium">("all");

  const { data, loading, error, refetch } = useAdminData<BookingsResponse>("/api/admin/bookings", {
    params: { filter: "sla" },
  });

  const breaches = (data?.bookings ?? []).map((b) => ({
    ...b,
    overdueMinutes: minutesOverdue(b),
  }));

  const filtered = breaches.filter((b) => {
    const s =
      !search ||
      b.id.toLowerCase().includes(search.toLowerCase()) ||
      (b.customer_name ?? b.customer_email ?? "").toLowerCase().includes(search.toLowerCase());
    const sev = severityFromMinutes(b.overdueMinutes);
    const v = sevFilter === "all" || sev === sevFilter;
    return s && v;
  });

  const criticalCount = breaches.filter((b) => severityFromMinutes(b.overdueMinutes) === "critical").length;
  const highCount = breaches.filter((b) => severityFromMinutes(b.overdueMinutes) === "high").length;
  const unassignedCount = breaches.filter((b) => !b.cleaner_id && !b.team_id).length;
  const oldestMinutes = breaches.reduce((max, b) => Math.max(max, b.overdueMinutes), 0);

  return (
    <div className="space-y-5">
      <OfficeZohoPageHeader
        title="SLA Breaches"
        subtitle="Priority queue — act on the oldest items first."
        actions={
          <>
            <OfficeZohoSecondaryButton onClick={() => void refetch()} aria-label="Refresh SLA breaches">
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </OfficeZohoSecondaryButton>
            <Link
              href="/office/bookings"
              className="flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-red-700"
            >
              <UserCheck className="h-4 w-4" /> Assign all unassigned
            </Link>
          </>
        }
      />

      {error ? (
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
      ) : !loading && breaches.length > 0 ? (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" />
          <div className="flex-1">
            <p className="text-sm font-bold text-red-800">
              {breaches.length} active SLA {breaches.length === 1 ? "breach" : "breaches"}
            </p>
            <p className="text-xs text-red-600">
              Oldest breach: {formatOverdue(oldestMinutes)}. Immediate action required.
            </p>
          </div>
          <div className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-600">Priority queue</div>
        </div>
      ) : !loading && breaches.length === 0 ? (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-emerald-600" />
          <p className="text-sm font-bold text-emerald-800">All clear — no active SLA breaches.</p>
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Critical", count: loading ? "—" : criticalCount, color: "text-red-600", bg: "bg-red-50" },
          { label: "High", count: loading ? "—" : highCount, color: "text-orange-600", bg: "bg-orange-50" },
          { label: "Unassigned", count: loading ? "—" : unassignedCount, color: "text-slate-700", bg: "bg-slate-50" },
        ].map((k) => (
          <div key={k.label} className={cn("rounded-2xl border border-slate-100 p-4 shadow-sm", k.bg)}>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k.label}</p>
            <p className={cn("mt-1 text-3xl font-bold tabular-nums", k.color)}>{k.count}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search breaches…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-sm placeholder:text-slate-400 focus:border-blue-300 focus:outline-none"
            />
          </div>
          <div className="flex gap-1">
            {(["all", "critical", "high", "medium"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSevFilter(s)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors",
                  sevFilter === s ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-100",
                )}
              >
                {s === "all" ? "All" : SEV_MAP[s as "critical" | "high" | "medium"].label}
              </button>
            ))}
          </div>
        </div>

        <div className="divide-y divide-slate-50">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="px-5 py-4">
                <div className="h-16 animate-pulse rounded-xl bg-slate-100" />
              </div>
            ))
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">No SLA breaches match your filter.</div>
          ) : (
            filtered.map((b) => {
              const sev = severityFromMinutes(b.overdueMinutes);
              const s = SEV_MAP[sev];
              const isUnassigned = !b.cleaner_id && !b.team_id;
              const assignment = b.team?.name ?? (b.cleaner_id ? "Assigned" : "Unassigned");

              return (
                <div
                  key={b.id}
                  className="group flex items-start gap-4 px-5 py-4 transition-colors hover:bg-slate-50/50"
                >
                  <div
                    className={cn(
                      "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl",
                      sev === "critical" ? "bg-red-100" : sev === "high" ? "bg-orange-100" : "bg-yellow-100",
                    )}
                  >
                    <AlertTriangle
                      className={cn(
                        "h-4 w-4",
                        sev === "critical" ? "text-red-600" : sev === "high" ? "text-orange-600" : "text-yellow-600",
                      )}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-blue-600">{b.id.slice(0, 8).toUpperCase()}</span>
                      <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-bold", s.cls)}>{s.label}</span>
                    </div>
                    <p className="mt-0.5 text-sm font-semibold text-slate-800">
                      {b.customer_name ?? b.customer_email ?? "Unknown"} —{" "}
                      {(b.service ?? "Service").replace(/-/g, " ")}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      {b.date && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Booked: {b.date}
                          {b.time ? ` at ${b.time.slice(0, 5)}` : ""}
                        </span>
                      )}
                      <span className="flex items-center gap-1 font-bold text-red-600">
                        <Flag className="h-3 w-3" />
                        {formatOverdue(b.overdueMinutes)}
                      </span>
                      <span>
                        Assignment:{" "}
                        <span className={isUnassigned ? "font-bold text-orange-600" : "text-slate-700"}>{assignment}</span>
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row">
                    <a
                      href={`/office/bookings/${b.id}`}
                      className="whitespace-nowrap rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-blue-700"
                    >
                      <UserCheck className="mr-1 inline h-3.5 w-3.5" />
                      Assign now
                    </a>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
