"use client";

import { useCallback, useEffect, useState } from "react";
import { WEEKDAY_OPTIONS } from "@/lib/cleaner/cleanerPreferencesTypes";
import {
  parseCleanerAvailabilityWeekdaysStrict,
  utcJsWeekdaySetFromCleanerCodes,
} from "@/lib/cleaner/availabilityWeekdays";
import { saveAdminCleanerWeeklyAvailability } from "@/lib/admin/dashboard";

function normalizeHmInput(raw: string | null | undefined, fallback: string): string {
  const s = String(raw ?? "").trim();
  if (/^\d{2}:\d{2}$/.test(s)) return s;
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s.slice(0, 5);
  return fallback;
}

type Props = {
  cleanerId: string;
  /** From `cleaners.availability_weekdays` — hydrates day toggles when cleaner or row changes. */
  availabilityWeekdaysSnapshot?: string[] | null;
  availabilityStartSnapshot?: string | null;
  availabilityEndSnapshot?: string | null;
  onToast?: (msg: string) => void;
  /** After calendar save + sync; parent refetches `cleaners` so the slide-over summary stays aligned. */
  onSaved?: () => void | Promise<void>;
};

export function AdminCleanerAvailabilityPanel({
  cleanerId,
  availabilityWeekdaysSnapshot,
  availabilityStartSnapshot,
  availabilityEndSnapshot,
  onToast,
  onSaved,
}: Props) {
  const [days, setDays] = useState<Set<number>>(() => new Set([1, 2, 3, 4, 5]));
  const [start, setStart] = useState("07:00");
  const [end, setEnd] = useState("18:00");
  const [horizonDays, setHorizonDays] = useState(60);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const weekSnapKey = JSON.stringify(availabilityWeekdaysSnapshot ?? null);

  useEffect(() => {
    const codes = parseCleanerAvailabilityWeekdaysStrict(
      availabilityWeekdaysSnapshot != null ? availabilityWeekdaysSnapshot : [],
    );
    const nextDays = codes.length > 0 ? utcJsWeekdaySetFromCleanerCodes(codes) : new Set([1, 2, 3, 4, 5]);
    setDays(nextDays);
    setStart(normalizeHmInput(availabilityStartSnapshot, "07:00"));
    setEnd(normalizeHmInput(availabilityEndSnapshot, "18:00"));
  }, [cleanerId, weekSnapKey, availabilityStartSnapshot, availabilityEndSnapshot]);

  const toggleDay = (d: number) => {
    setDays((prev) => {
      const n = new Set(prev);
      if (n.has(d)) n.delete(d);
      else n.add(d);
      return n;
    });
  };

  const save = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const weeklySchedule = [...days]
        .sort((a, b) => a - b)
        .map((day) => ({ day, start, end }));
      if (weeklySchedule.length === 0) {
        setErr("Select at least one weekday.");
        return;
      }
      const r = await saveAdminCleanerWeeklyAvailability(cleanerId, { weeklySchedule, horizonDays });
      onToast?.(`Saved ${r.inserted} availability row(s).`);
      await onSaved?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }, [cleanerId, days, end, horizonDays, onSaved, onToast, start]);

  return (
    <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Weekly availability</h3>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        Applies one time window to selected days (UTC weekday). Replaces calendar rows for the next {horizonDays} days.
        Values below load from this cleaner&apos;s saved roster — edit and save to update.
      </p>
      {err ? <p className="mt-2 text-sm text-rose-700 dark:text-rose-400">{err}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {WEEKDAY_OPTIONS.map((d) => (
          <button
            key={d.value}
            type="button"
            onClick={() => toggleDay(d.value)}
            className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
              days.has(d.value)
                ? "border-emerald-600 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-100"
                : "border-zinc-200 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
            }`}
          >
            {d.label.slice(0, 3)}
          </button>
        ))}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <label className="text-xs text-zinc-600 dark:text-zinc-300">
          Start
          <input
            type="time"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="mt-1 block h-9 w-full rounded border border-zinc-300 px-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
          />
        </label>
        <label className="text-xs text-zinc-600 dark:text-zinc-300">
          End
          <input
            type="time"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="mt-1 block h-9 w-full rounded border border-zinc-300 px-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
          />
        </label>
        <label className="text-xs text-zinc-600 dark:text-zinc-300">
          Horizon (days)
          <input
            type="number"
            min={7}
            max={120}
            value={horizonDays}
            onChange={(e) => setHorizonDays(Math.max(7, Math.min(120, Number(e.target.value) || 60)))}
            className="mt-1 block h-9 w-full rounded border border-zinc-300 px-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
          />
        </label>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => void save()}
        className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save calendar"}
      </button>
    </section>
  );
}
