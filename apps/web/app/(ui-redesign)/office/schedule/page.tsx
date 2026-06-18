"use client";

import { useState } from "react";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  UserCheck,
  AlertTriangle,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminData } from "@/hooks/useAdminData";

type JobStatus = "completed" | "in_progress" | "assigned" | "confirmed" | "pending" | "cancelled" | string;

const STATUS_MAP: Record<string, { label: string; dot: string; cls: string }> = {
  completed:   { label: "Completed",   dot: "bg-emerald-500", cls: "bg-emerald-100 text-emerald-700" },
  in_progress: { label: "In Progress", dot: "bg-violet-500",  cls: "bg-violet-100 text-violet-700" },
  assigned:    { label: "Assigned",    dot: "bg-blue-500",    cls: "bg-blue-100 text-blue-700" },
  confirmed:   { label: "Confirmed",   dot: "bg-sky-500",     cls: "bg-sky-100 text-sky-700" },
  pending:     { label: "Unassigned",  dot: "bg-orange-500",  cls: "bg-orange-100 text-orange-700" },
  cancelled:   { label: "Cancelled",   dot: "bg-slate-400",   cls: "bg-slate-100 text-slate-500" },
};

type BookingRow = {
  id: string;
  date: string | null;
  time: string | null;
  status: string | null;
  cleaner_id: string | null;
  selected_cleaner_id: string | null;
  customer_name: string | null;
  service: string | null;
  location: string | null;
  dispatch_status: string | null;
};

type ScheduleResponse = {
  bookings: BookingRow[];
  cleaners?: Array<{ id: string; full_name: string | null; is_available: boolean | null }>;
};

function toYmd(d: Date): string {
  return d.toISOString().split("T")[0]!;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatDateLabel(ymd: string): string {
  const d = new Date(ymd + "T00:00:00");
  return d.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" });
}

export default function SchedulePage() {
  const [selectedDate, setSelectedDate] = useState(() => toYmd(new Date()));
  const [view, setView] = useState<"list" | "timeline">("list");

  const { data, loading, error, refetch } = useAdminData<ScheduleResponse>(
    "/api/admin/schedule/day",
    { params: { date: selectedDate } },
  );

  const bookings = data?.bookings ?? [];

  const statusCounts = {
    total: bookings.length,
    completed: bookings.filter((b) => b.status === "completed").length,
    inProgress: bookings.filter((b) => b.status === "in_progress").length,
    upcoming: bookings.filter((b) => b.status === "assigned" || b.status === "confirmed").length,
    unassigned: bookings.filter((b) => !b.cleaner_id && !b.selected_cleaner_id && b.status !== "cancelled").length,
  };

  function getStatusInfo(row: BookingRow) {
    const key = (row.status ?? "pending").toLowerCase();
    return STATUS_MAP[key] ?? { label: key, dot: "bg-slate-400", cls: "bg-slate-100 text-slate-600" };
  }

  const HOURS = ["07:00", "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Schedule</h1>
          <p className="mt-0.5 text-sm text-slate-500">Day view for all bookings and cleaner assignments.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void refetch()}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 shadow-sm"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </button>
          {(["list", "timeline"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn(
                "rounded-xl border px-3 py-2 text-sm font-medium capitalize transition-colors",
                view === v ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Date navigator */}
      <div className="flex items-center gap-3 rounded-2xl bg-white border border-slate-100 p-4 shadow-sm">
        <button
          type="button"
          onClick={() => setSelectedDate(toYmd(addDays(new Date(selectedDate + "T00:00:00"), -1)))}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2 flex-1 justify-center">
          <Calendar className="h-4 w-4 text-blue-600" />
          <p className="text-sm font-semibold text-slate-800">{formatDateLabel(selectedDate)}</p>
          {selectedDate === toYmd(new Date()) && (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">TODAY</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setSelectedDate(toYmd(addDays(new Date(selectedDate + "T00:00:00"), 1)))}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
          <p className="text-sm text-red-700">{error}</p>
          <button type="button" onClick={() => void refetch()} className="ml-auto text-xs font-semibold text-red-600 hover:underline">Retry</button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-5 gap-2">
        {[
          { label: "Total",        value: loading ? "—" : statusCounts.total,      alert: false },
          { label: "Completed",    value: loading ? "—" : statusCounts.completed,  alert: false },
          { label: "In Progress",  value: loading ? "—" : statusCounts.inProgress, alert: false },
          { label: "Upcoming",     value: loading ? "—" : statusCounts.upcoming,   alert: false },
          { label: "Unassigned",   value: loading ? "—" : statusCounts.unassigned, alert: (statusCounts.unassigned > 0) },
        ].map((s) => (
          <div key={s.label} className="rounded-xl bg-white border border-slate-100 p-2.5 text-center shadow-sm">
            <p className={cn("text-lg font-bold tabular-nums", s.alert ? "text-red-600" : "text-slate-800")}>
              {s.value}
            </p>
            <p className="text-[10px] text-slate-500 leading-tight">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Bookings list */}
      <div className="rounded-2xl bg-white border border-slate-100 shadow-sm">
        <div className="border-b border-slate-100 px-5 py-3">
          <p className="text-sm font-bold text-slate-800">Bookings for {formatDateLabel(selectedDate)}</p>
        </div>

        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : bookings.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">
            No bookings scheduled for this day.
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {bookings.map((b) => {
              const info = getStatusInfo(b);
              const isUnassigned = !b.cleaner_id && !b.selected_cleaner_id && b.status !== "cancelled";
              return (
                <div
                  key={b.id}
                  className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50/50 transition-colors group"
                >
                  <span className="w-14 shrink-0 text-xs font-bold text-slate-600">
                    {b.time?.slice(0, 5) ?? "—:—"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800">
                      {(b.service ?? "Service").replace(/-/g, " ")}
                    </p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <MapPin className="h-3 w-3 text-slate-400 shrink-0" />
                      <p className="text-xs text-slate-400 truncate">{b.location ?? "—"}</p>
                    </div>
                    <p className="text-xs text-slate-500">{b.customer_name ?? "Customer"}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isUnassigned && (
                      <span className="flex items-center gap-1 text-xs font-semibold text-orange-600">
                        <AlertTriangle className="h-3.5 w-3.5" /> Unassigned
                      </span>
                    )}
                    <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold", info.cls)}>
                      {info.label}
                    </span>
                    <a
                                href={`/office/bookings/${b.id}`}
                      className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-100 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <UserCheck className="h-3.5 w-3.5 inline mr-1" />
                      Assign
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
