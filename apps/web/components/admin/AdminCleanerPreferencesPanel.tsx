"use client";

import { useCallback, useEffect, useState } from "react";
import type { PreferredTimeBlock } from "@/lib/cleaner/cleanerPreferencesTypes";
import { WEEKDAY_OPTIONS } from "@/lib/cleaner/cleanerPreferencesTypes";
import {
  fetchAdminCleanerPreferences,
  saveAdminCleanerPreferences,
  type AdminCleanerPreferencesResponse,
} from "@/lib/admin/dashboard";

function padHm(h: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(h).trim());
  if (!m) return String(h).trim();
  const hh = Number(m[1]);
  const mm = m[2];
  if (!Number.isFinite(hh) || hh > 23) return String(h).trim();
  return `${String(hh).padStart(2, "0")}:${mm}`;
}

type Props = {
  cleanerId: string;
  onToast?: (msg: string) => void;
};

export function AdminCleanerPreferencesPanel({ cleanerId, onToast }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationOptions, setLocationOptions] = useState<AdminCleanerPreferencesResponse["locationOptions"]>([]);
  const [serviceOptions, setServiceOptions] = useState<AdminCleanerPreferencesResponse["serviceOptions"]>([]);
  const [selectedAreas, setSelectedAreas] = useState<Set<string>>(new Set());
  const [selectedServices, setSelectedServices] = useState<Set<string>>(new Set());
  const [timeBlocks, setTimeBlocks] = useState<PreferredTimeBlock[]>([]);
  const [isStrict, setIsStrict] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminCleanerPreferences(cleanerId);
      setLocationOptions(data.locationOptions);
      setServiceOptions(data.serviceOptions);
      const p = data.preferences;
      if (p) {
        setSelectedAreas(new Set((p.preferred_areas ?? []).map(String)));
        setSelectedServices(new Set((p.preferred_services ?? []).map((s) => String(s).toLowerCase())));
        const blocks = Array.isArray(p.preferred_time_blocks) ? (p.preferred_time_blocks as PreferredTimeBlock[]) : [];
        setTimeBlocks(blocks.length ? blocks : []);
        setIsStrict(Boolean(p.is_strict));
      } else {
        setSelectedAreas(new Set());
        setSelectedServices(new Set());
        setTimeBlocks([]);
        setIsStrict(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load preferences.");
    } finally {
      setLoading(false);
    }
  }, [cleanerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleArea = (id: string) => {
    setSelectedAreas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleService = (slug: string) => {
    setSelectedServices((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const addTimeBlock = () => {
    setTimeBlocks((rows) => [...rows, { day: 1, start: "09:00", end: "17:00" }]);
  };

  const updateBlock = (index: number, patch: Partial<PreferredTimeBlock>) => {
    setTimeBlocks((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const removeBlock = (index: number) => {
    setTimeBlocks((rows) => rows.filter((_, i) => i !== index));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const blocks = timeBlocks
        .map((b) => ({
          day: b.day,
          start: padHm(b.start),
          end: padHm(b.end),
        }))
        .filter((b) => /^\d{2}:\d{2}$/.test(b.start) && /^\d{2}:\d{2}$/.test(b.end));
      await saveAdminCleanerPreferences(cleanerId, {
        preferred_areas: [...selectedAreas],
        preferred_services: [...selectedServices],
        preferred_time_blocks: blocks,
        is_strict: isStrict,
      });
      onToast?.("Preferences saved.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Dispatch preferences</h3>
        <p className="mt-2 text-sm text-zinc-500">Loading…</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Dispatch preferences</h3>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        Used in dispatch scoring (and strict mode excludes non-matching jobs). Does not change payouts or cleaner app.
      </p>

      {error ? <p className="mt-2 text-sm text-rose-700 dark:text-rose-400">{error}</p> : null}

      <div className="mt-4 space-y-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Preferred areas</p>
          <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-zinc-200 p-2 dark:border-zinc-700">
            {locationOptions.length === 0 ? (
              <p className="text-sm text-zinc-500">No locations in database.</p>
            ) : (
              <ul className="space-y-1">
                {locationOptions.map((loc) => (
                  <li key={loc.id}>
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
                      <input
                        type="checkbox"
                        checked={selectedAreas.has(loc.id)}
                        onChange={() => toggleArea(loc.id)}
                        className="rounded border-zinc-400"
                      />
                      <span>{loc.name}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Preferred services</p>
          <div className="mt-2 flex flex-wrap gap-3">
            {serviceOptions.map((s) => (
              <label key={s.slug} className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
                <input
                  type="checkbox"
                  checked={selectedServices.has(s.slug)}
                  onChange={() => toggleService(s.slug)}
                  className="rounded border-zinc-400"
                />
                <span>{s.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Preferred working times</p>
            <button
              type="button"
              onClick={() => addTimeBlock()}
              className="rounded border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 dark:border-zinc-600 dark:text-zinc-200"
            >
              + Add window
            </button>
          </div>
          <p className="mt-1 text-xs text-zinc-500">Day is Sunday–Saturday (UTC calendar date). Job start time must fall inside a window.</p>
          <div className="mt-2 space-y-2">
            {timeBlocks.length === 0 ? (
              <p className="text-sm text-zinc-500">No windows — time preference is neutral unless strict requires a match.</p>
            ) : (
              timeBlocks.map((row, i) => (
                <div key={i} className="flex flex-wrap items-end gap-2 rounded-lg border border-zinc-200 p-2 dark:border-zinc-700">
                  <label className="text-xs text-zinc-600 dark:text-zinc-300">
                    Day
                    <select
                      value={row.day}
                      onChange={(e) => updateBlock(i, { day: Number(e.target.value) })}
                      className="mt-1 block h-9 w-full min-w-[8rem] rounded border border-zinc-300 bg-white px-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                    >
                      {WEEKDAY_OPTIONS.map((d) => (
                        <option key={d.value} value={d.value}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-zinc-600 dark:text-zinc-300">
                    Start
                    <input
                      type="time"
                      value={row.start}
                      onChange={(e) => updateBlock(i, { start: e.target.value })}
                      className="mt-1 block h-9 rounded border border-zinc-300 px-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                    />
                  </label>
                  <label className="text-xs text-zinc-600 dark:text-zinc-300">
                    End
                    <input
                      type="time"
                      value={row.end}
                      onChange={(e) => updateBlock(i, { end: e.target.value })}
                      className="mt-1 block h-9 rounded border border-zinc-300 px-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => removeBlock(i)}
                    className="ml-auto text-xs text-rose-600 dark:text-rose-400"
                  >
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-zinc-800 dark:text-zinc-100">
          <input type="checkbox" checked={isStrict} onChange={(e) => setIsStrict(e.target.checked)} className="rounded border-zinc-400" />
          Strict mode (exclude this cleaner from jobs that do not match configured preferences)
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save preferences"}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void load()}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600"
        >
          Reload
        </button>
      </div>
    </section>
  );
}
