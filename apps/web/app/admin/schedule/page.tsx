"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { allStandardDaySlots, johannesburgTodayYmd } from "@/lib/dashboard/bookingSlotTimes";
import { normalizeTimeHm } from "@/lib/admin/validateAdminBookingSlot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const UNASSIGNED_COL = "__unassigned__";

type ScheduleBooking = {
  id: string;
  date: string | null;
  time: string | null;
  status: string | null;
  cleaner_id: string | null;
  selected_cleaner_id: string | null;
  customer_name: string | null;
  service: string | null;
  location: string | null;
  ignore_cleaner_conflict?: boolean | null;
  cleaner_slot_override_reason?: string | null;
  dispatch_status?: string | null;
};

type ScheduleCleaner = { id: string; full_name: string; phone: string | null; is_available: boolean | null };

type AvailRow = ScheduleCleaner & { conflicting_booking_id?: string };

function effectiveCleanerId(b: ScheduleBooking): string | null {
  const a = b.cleaner_id?.trim() ?? "";
  const s = b.selected_cleaner_id?.trim() ?? "";
  if (/^[0-9a-f-]{36}$/i.test(a)) return a;
  if (/^[0-9a-f-]{36}$/i.test(s)) return s;
  return null;
}

function slotKeyForBooking(b: ScheduleBooking): string | null {
  const t = b.time?.trim().slice(0, 5) ?? "";
  return /^\d{2}:\d{2}$/.test(t) ? t : null;
}

function isUnassigned(b: ScheduleBooking): boolean {
  return !effectiveCleanerId(b);
}

export default function AdminSchedulePage() {
  const [date, setDate] = useState(() => johannesburgTodayYmd());
  const [cleanerFilter, setCleanerFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookings, setBookings] = useState<ScheduleBooking[]>([]);
  const [cleaners, setCleaners] = useState<ScheduleCleaner[]>([]);

  const [assignBooking, setAssignBooking] = useState<ScheduleBooking | null>(null);
  const [assignCleanerId, setAssignCleanerId] = useState("");
  const [assignAvail, setAssignAvail] = useState<{ available: AvailRow[]; busy: AvailRow[] } | null>(null);
  const [assignAvailLoading, setAssignAvailLoading] = useState(false);
  const [assignConflictAck, setAssignConflictAck] = useState(false);
  const [assignOverrideReason, setAssignOverrideReason] = useState("");
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [assignApiError, setAssignApiError] = useState<string | null>(null);

  const slots = useMemo(() => allStandardDaySlots(), []);

  const hasUnassigned = useMemo(() => bookings.some(isUnassigned), [bookings]);

  const cleanerColumns = useMemo(() => {
    const ids = new Set<string>();
    for (const b of bookings) {
      const id = effectiveCleanerId(b);
      if (id) ids.add(id);
    }
    let list = cleaners.filter((c) => ids.has(c.id));
    if (list.length === 0 && bookings.length > 0) {
      list = bookings
        .map((b) => effectiveCleanerId(b))
        .filter((id): id is string => Boolean(id))
        .filter((id, i, a) => a.indexOf(id) === i)
        .map((id) => ({ id, full_name: id.slice(0, 8) + "…", phone: null as string | null, is_available: true }));
    }
    if (/^[0-9a-f-]{36}$/i.test(cleanerFilter.trim())) {
      const cf = cleanerFilter.trim();
      list = list.filter((c) => c.id === cf);
    }
    return list;
  }, [bookings, cleaners, cleanerFilter]);

  const displayColumns = useMemo(() => {
    const unCol = { id: UNASSIGNED_COL, full_name: "Unassigned", phone: null as string | null, is_available: true };
    return hasUnassigned ? [unCol, ...cleanerColumns] : cleanerColumns;
  }, [hasUnassigned, cleanerColumns]);

  const overlapKeys = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const b of bookings) {
      const cid = effectiveCleanerId(b) ?? (isUnassigned(b) ? UNASSIGNED_COL : null);
      const sk = slotKeyForBooking(b);
      if (!cid || !sk) continue;
      const k = `${cid}|${sk}`;
      const set = m.get(k) ?? new Set<string>();
      set.add(b.id);
      m.set(k, set);
    }
    const out = new Set<string>();
    for (const [k, set] of m) {
      if (set.size > 1) out.add(k);
    }
    return out;
  }, [bookings]);

  const bookingByCleanerSlot = useMemo(() => {
    const map = new Map<string, ScheduleBooking[]>();
    for (const b of bookings) {
      const cid = effectiveCleanerId(b) ?? (isUnassigned(b) ? UNASSIGNED_COL : null);
      const sk = slotKeyForBooking(b);
      if (!cid || !sk) continue;
      const key = `${cid}|${sk}`;
      const arr = map.get(key) ?? [];
      arr.push(b);
      map.set(key, arr);
    }
    return map;
  }, [bookings]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sb = getSupabaseBrowser();
      const token = (await sb?.auth.getSession())?.data.session?.access_token;
      if (!token) {
        setError("Not signed in.");
        setBookings([]);
        setCleaners([]);
        return;
      }
      const q = new URLSearchParams({ date });
      if (/^[0-9a-f-]{36}$/i.test(cleanerFilter.trim())) {
        q.set("cleanerId", cleanerFilter.trim());
      }
      const res = await fetch(`/api/admin/schedule/day?${q.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        bookings?: ScheduleBooking[];
        cleaners?: ScheduleCleaner[];
      };
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : "Could not load schedule.");
        setBookings([]);
        setCleaners([]);
        return;
      }
      setBookings(Array.isArray(json.bookings) ? json.bookings : []);
      setCleaners(Array.isArray(json.cleaners) ? json.cleaners : []);
    } finally {
      setLoading(false);
    }
  }, [date, cleanerFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!assignBooking) {
      setAssignCleanerId("");
      setAssignAvail(null);
      setAssignConflictAck(false);
      setAssignOverrideReason("");
      setAssignApiError(null);
      return;
    }
    const d = assignBooking.date?.trim() ?? "";
    const t = normalizeTimeHm(assignBooking.time ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^\d{2}:\d{2}$/.test(t)) return;
    let cancelled = false;
    void (async () => {
      setAssignAvailLoading(true);
      try {
        const sb = getSupabaseBrowser();
        const token = (await sb?.auth.getSession())?.data.session?.access_token;
        if (!token || cancelled) return;
        const res = await fetch(
          `/api/admin/cleaners/available?date=${encodeURIComponent(d)}&time=${encodeURIComponent(t)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const json = (await res.json().catch(() => ({}))) as {
          available?: AvailRow[];
          busy?: AvailRow[];
        };
        if (!res.ok || cancelled) return;
        setAssignAvail({
          available: Array.isArray(json.available) ? json.available : [],
          busy: Array.isArray(json.busy) ? json.busy : [],
        });
      } finally {
        if (!cancelled) setAssignAvailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assignBooking]);

  const busyIdsForAssign = useMemo(() => new Set((assignAvail?.busy ?? []).map((c) => c.id)), [assignAvail]);

  const submitAssign = useCallback(async () => {
    if (!assignBooking || !assignCleanerId.trim()) return;
    const sb = getSupabaseBrowser();
    const token = (await sb?.auth.getSession())?.data.session?.access_token;
    if (!token) {
      setAssignApiError("Not signed in.");
      return;
    }
    const busy = busyIdsForAssign.has(assignCleanerId.trim());
    if (busy && !assignConflictAck) {
      setAssignApiError("Confirm overlap to assign a busy cleaner, or pick an available cleaner.");
      return;
    }
    setAssignSubmitting(true);
    setAssignApiError(null);
    try {
      const res = await fetch(`/api/admin/bookings/${encodeURIComponent(assignBooking.id)}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          selected_cleaner_id: assignCleanerId.trim(),
          ...(busy && assignConflictAck
            ? {
                ignore_cleaner_slot_conflict: true,
                ...(assignOverrideReason.trim()
                  ? { cleaner_slot_override_reason: assignOverrideReason.trim().slice(0, 500) }
                  : {}),
              }
            : {}),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        cleaner_slot_conflict?: boolean;
      };
      if (!res.ok) {
        if (res.status === 409 && json.cleaner_slot_conflict) {
          setAssignApiError(
            typeof json.error === "string"
              ? json.error
              : "Slot conflict — check “Confirm overlap” and optional reason, then try again.",
          );
          return;
        }
        setAssignApiError(typeof json.error === "string" ? json.error : "Update failed.");
        return;
      }
      setAssignBooking(null);
      await load();
    } finally {
      setAssignSubmitting(false);
    }
  }, [assignBooking, assignCleanerId, assignConflictAck, assignOverrideReason, busyIdsForAssign, load]);

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 px-4 py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Schedule</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Day view by cleaner — unassigned first, overlaps highlighted, overrides flagged.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="sched-date">Date</Label>
            <Input
              id="sched-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-[11rem]"
            />
          </div>
          <div className="min-w-[12rem] space-y-1">
            <Select
              id="sched-cleaner-filter"
              label="Cleaner filter"
              value={cleanerFilter}
              onChange={(e) => setCleanerFilter(e.target.value)}
            >
              <option value="">All cleaners</option>
              {cleaners.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                </option>
              ))}
            </Select>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
          </Button>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      {loading && bookings.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : bookings.length === 0 && !loading ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {cleanerFilter.trim() ? "No bookings for this day with the selected filter." : "No bookings for this day."}
        </p>
      ) : displayColumns.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          No columns to show for this filter. Clear the cleaner filter or pick another day.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <table className="w-full min-w-[720px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/80">
                <th className="sticky left-0 z-10 w-16 border-r border-zinc-200 bg-zinc-50 px-2 py-2 font-medium dark:border-zinc-800 dark:bg-zinc-900">
                  Time
                </th>
                {displayColumns.map((c) => (
                  <th
                    key={c.id}
                    className={cn(
                      "min-w-[140px] border-l px-2 py-2 font-medium dark:border-zinc-800",
                      c.id === UNASSIGNED_COL ? "border-dashed border-zinc-300 bg-zinc-100/80 dark:border-zinc-600 dark:bg-zinc-900/60" : "border-zinc-100",
                    )}
                  >
                    <span className="line-clamp-2">{c.full_name}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slots.map((slot) => (
                <tr key={slot} className="border-b border-zinc-100 dark:border-zinc-800/80">
                  <td className="sticky left-0 z-10 border-r border-zinc-100 bg-zinc-50/95 px-2 py-1.5 font-mono text-[11px] text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/95 dark:text-zinc-300">
                    {slot}
                  </td>
                  {displayColumns.map((c) => {
                    const key = `${c.id}|${slot}`;
                    const list = bookingByCleanerSlot.get(key) ?? [];
                    const overlap = overlapKeys.has(key);
                    const isUn = c.id === UNASSIGNED_COL;
                    return (
                      <td
                        key={key}
                        className={cn(
                          "align-top border-l px-1 py-1 dark:border-zinc-800/60",
                          isUn ? "border-dashed border-zinc-300 bg-zinc-50/50 dark:border-zinc-600 dark:bg-zinc-900/40" : "border-zinc-50",
                        )}
                      >
                        <div className="flex min-h-[36px] flex-col gap-1">
                          {list.map((b) => (
                            <div
                              key={b.id}
                              className={cn(
                                "rounded border px-1.5 py-1 text-[11px] leading-snug",
                                isUn
                                  ? "border-dashed border-zinc-400 bg-zinc-100/80 text-zinc-900 dark:border-zinc-500 dark:bg-zinc-900/50 dark:text-zinc-100"
                                  : "",
                                !isUn && overlap
                                  ? "border-red-500 bg-red-50 text-red-950 dark:border-red-700 dark:bg-red-950/40 dark:text-red-50"
                                  : !isUn
                                    ? "border-zinc-200 bg-zinc-50 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                                    : "",
                                b.ignore_cleaner_conflict ? "ring-1 ring-amber-500/70" : "",
                              )}
                            >
                              <Link
                                href={`/admin/bookings/${b.id}`}
                                className="block font-medium text-inherit hover:underline"
                              >
                                {b.customer_name?.trim() || "—"}
                              </Link>
                              <span className="block text-[10px] text-zinc-600 dark:text-zinc-400">
                                {b.service ?? "Service"} · {b.status ?? ""}
                              </span>
                              {b.ignore_cleaner_conflict ? (
                                <span className="mt-0.5 inline-block rounded bg-amber-200/90 px-1 text-[9px] font-semibold uppercase text-amber-950 dark:bg-amber-800 dark:text-amber-50">
                                  Override
                                </span>
                              ) : null}
                              {isUn ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="mt-1 h-7 w-full px-1 text-[10px]"
                                  onClick={() => {
                                    setAssignBooking(b);
                                    setAssignCleanerId("");
                                    setAssignConflictAck(false);
                                    setAssignOverrideReason("");
                                    setAssignApiError(null);
                                  }}
                                >
                                  Assign…
                                </Button>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {assignBooking ? (
        <div
          className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200 bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95"
          role="dialog"
          aria-label="Assign preferred cleaner"
        >
          <div className="mx-auto flex max-w-2xl flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Assign preferred cleaner</p>
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  Booking {assignBooking.id.slice(0, 8)}… · {assignBooking.customer_name ?? "—"}
                </p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setAssignBooking(null)}>
                Close
              </Button>
            </div>
            {assignAvailLoading ? (
              <p className="flex items-center gap-2 text-xs text-zinc-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading availability…
              </p>
            ) : null}
            <div className="space-y-1">
              <Label htmlFor="sched-assign-cleaner">Cleaner</Label>
              <Select
                id="sched-assign-cleaner"
                label=""
                value={assignCleanerId}
                onChange={(e) => {
                  setAssignCleanerId(e.target.value);
                  setAssignConflictAck(false);
                  setAssignApiError(null);
                }}
              >
                <option value="">Choose cleaner…</option>
                {assignAvail ? (
                  <>
                    <optgroup label="Available">
                      {assignAvail.available.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.full_name}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Busy at this time">
                      {assignAvail.busy.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.full_name} (busy)
                        </option>
                      ))}
                    </optgroup>
                  </>
                ) : null}
              </Select>
            </div>
            {assignCleanerId && busyIdsForAssign.has(assignCleanerId) ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-2 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-50">
                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-amber-800/40"
                    checked={assignConflictAck}
                    onChange={(e) => setAssignConflictAck(e.target.checked)}
                  />
                  <span>I understand this cleaner may be double-booked for this slot.</span>
                </label>
                <div className="mt-2 space-y-1">
                  <Label htmlFor="sched-assign-reason" className="text-[11px]">
                    Override reason (optional)
                  </Label>
                  <Textarea
                    id="sched-assign-reason"
                    rows={2}
                    maxLength={500}
                    value={assignOverrideReason}
                    onChange={(e) => setAssignOverrideReason(e.target.value)}
                    className="min-h-[48px] text-xs"
                    placeholder="e.g. Customer requested this cleaner"
                  />
                </div>
              </div>
            ) : null}
            {assignApiError ? (
              <p className="text-xs text-red-600 dark:text-red-400" role="alert">
                {assignApiError}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setAssignBooking(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={assignSubmitting || !assignCleanerId.trim()}
                onClick={() => void submitAssign()}
              >
                {assignSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save assignment"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
