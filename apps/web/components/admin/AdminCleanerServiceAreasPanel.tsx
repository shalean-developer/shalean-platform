"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchAdminCleanerPreferences, saveAdminCleanerLocationIds } from "@/lib/admin/dashboard";

type Props = {
  cleanerId: string;
  onToast?: (msg: string) => void;
};

export function AdminCleanerServiceAreasPanel({ cleanerId, onToast }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [options, setOptions] = useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const d = await fetchAdminCleanerPreferences(cleanerId);
      setOptions(d.locationOptions.map((o) => ({ id: o.id, name: o.name })));
      setSelected(new Set(d.assignedLocationIds ?? []));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [cleanerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      await saveAdminCleanerLocationIds(cleanerId, [...selected]);
      onToast?.("Working areas saved.");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Working areas</h3>
        <p className="mt-2 text-sm text-zinc-500">Loading…</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Working areas</h3>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Authoritative suburbs for dispatch and booking eligibility.</p>
      {err ? <p className="mt-2 text-sm text-rose-700 dark:text-rose-400">{err}</p> : null}
      <div className="mt-3 max-h-48 overflow-y-auto rounded-lg border border-zinc-200 p-2 dark:border-zinc-700">
        {options.length === 0 ? (
          <p className="text-sm text-zinc-500">No locations configured.</p>
        ) : (
          <ul className="space-y-1">
            {options.map((loc) => (
              <li key={loc.id}>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
                  <input type="checkbox" checked={selected.has(loc.id)} onChange={() => toggle(loc.id)} className="rounded border-zinc-400" />
                  <span>{loc.name}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
      <button
        type="button"
        disabled={saving}
        onClick={() => void save()}
        className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save areas"}
      </button>
    </section>
  );
}
