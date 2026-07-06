"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchCleaners, type AdminCleanerRow } from "@/lib/admin/dashboard";
import { ADMIN_MAX_PREFERRED_CLEANERS } from "@/lib/admin/adminPreferredCleanerLimits";
import { getAdminToken } from "@/hooks/useAdminData";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type AdminPreferredCleanerSelectProps = {
  id?: string;
  value: string[];
  onChange: (cleanerIds: string[]) => void;
  visitDate?: string;
  visitTime?: string;
  disabled?: boolean;
};

function normalizeTimeHm(raw: string | undefined): string {
  const s = (raw ?? "").trim();
  const m = /^(\d{1,2}):(\d{2})/.exec(s);
  if (!m) return "";
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

function cleanerLabel(c: AdminCleanerRow, busy = false): string {
  const name = c.full_name?.trim() || c.id;
  const phone = c.phone?.trim();
  return `${name}${phone ? ` · ${phone}` : ""}${busy ? " (busy)" : ""}`;
}

export function AdminPreferredCleanerSelect({
  id = "admin-cleaner",
  value,
  onChange,
  visitDate,
  visitTime,
  disabled = false,
}: AdminPreferredCleanerSelectProps) {
  const [cleaners, setCleaners] = useState<AdminCleanerRow[]>([]);
  const [slotAvailability, setSlotAvailability] = useState<{
    available: AdminCleanerRow[];
    busy: (AdminCleanerRow & { conflicting_booking_id: string })[];
  } | null>(null);
  const [slotLoading, setSlotLoading] = useState(false);

  const selected = useMemo(() => new Set(value.map((v) => v.trim()).filter(Boolean)), [value]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await fetchCleaners();
        if (!cancelled) setCleaners(list ?? []);
      } catch {
        if (!cancelled) setCleaners([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const d = (visitDate ?? "").trim();
    const timeHm = normalizeTimeHm(visitTime);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^\d{2}:\d{2}$/.test(timeHm)) {
      setSlotAvailability(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      setSlotLoading(true);
      try {
        const token = await getAdminToken();
        if (!token) {
          if (!cancelled) setSlotAvailability(null);
          return;
        }
        const res = await fetch(
          `/api/admin/cleaners/available?date=${encodeURIComponent(d)}&time=${encodeURIComponent(timeHm)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const json = (await res.json().catch(() => ({}))) as {
          available?: AdminCleanerRow[];
          busy?: (AdminCleanerRow & { conflicting_booking_id: string })[];
        };
        if (!res.ok || cancelled) {
          if (!cancelled) setSlotAvailability(null);
          return;
        }
        setSlotAvailability({
          available: Array.isArray(json.available) ? json.available : [],
          busy: Array.isArray(json.busy) ? json.busy : [],
        });
      } catch {
        if (!cancelled) setSlotAvailability(null);
      } finally {
        if (!cancelled) setSlotLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visitDate, visitTime]);

  const hasBuckets =
    slotAvailability != null && (slotAvailability.available.length > 0 || slotAvailability.busy.length > 0);

  const orphanSelected = useMemo(() => {
    if (!hasBuckets || selected.size === 0) return [];
    const bucketIds = new Set(
      [...slotAvailability!.available, ...slotAvailability!.busy].map((c) => c.id),
    );
    return cleaners.filter((c) => selected.has(c.id) && !bucketIds.has(c.id));
  }, [cleaners, hasBuckets, selected, slotAvailability]);

  const toggle = (cleanerId: string) => {
    if (disabled) return;
    const id = cleanerId.trim();
    if (!id) return;
    if (selected.has(id)) {
      onChange(value.filter((v) => v.trim() !== id));
      return;
    }
    if (selected.size >= ADMIN_MAX_PREFERRED_CLEANERS) return;
    onChange([...value, id]);
  };

  const renderRow = (c: AdminCleanerRow, busy = false) => {
    const on = selected.has(c.id);
    const atMax = selected.size >= ADMIN_MAX_PREFERRED_CLEANERS;
    return (
      <li key={c.id}>
        <label
          className={cn(
            "flex cursor-pointer items-start gap-2 rounded-md border px-2 py-2 text-sm",
            on
              ? "border-amber-400/80 bg-amber-50/80 dark:border-amber-500/50 dark:bg-amber-950/20"
              : "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-950",
            !on && atMax && "cursor-not-allowed opacity-60",
          )}
        >
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-400"
            checked={on}
            disabled={disabled || (!on && atMax)}
            onChange={() => toggle(c.id)}
          />
          <span className="min-w-0 flex-1 leading-snug">{cleanerLabel(c, busy)}</span>
        </label>
      </li>
    );
  };

  return (
    <div className="space-y-2 border-l-4 border-amber-400/80 pl-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={id}>Preferred cleaner (optional)</Label>
        {selected.size > 0 ? (
          <button
            type="button"
            className="text-xs font-medium text-zinc-600 underline decoration-zinc-400/60 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            disabled={disabled}
            onClick={() => onChange([])}
          >
            Clear ({selected.size}/{ADMIN_MAX_PREFERRED_CLEANERS})
          </button>
        ) : null}
      </div>

      <div id={id} className="space-y-3">
        {hasBuckets ? (
          <>
            {slotAvailability!.available.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Available
                </p>
                <ul className="grid gap-2 sm:grid-cols-2">{slotAvailability!.available.map((c) => renderRow(c))}</ul>
              </div>
            ) : null}
            {slotAvailability!.busy.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Busy at this time
                </p>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {slotAvailability!.busy.map((c) => renderRow(c, true))}
                </ul>
              </div>
            ) : null}
            {orphanSelected.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Other</p>
                <ul className="grid gap-2 sm:grid-cols-2">{orphanSelected.map((c) => renderRow(c))}</ul>
              </div>
            ) : null}
          </>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">{cleaners.map((c) => renderRow(c))}</ul>
        )}
      </div>

      {slotLoading ? <p className="text-xs text-zinc-500 dark:text-zinc-400">Checking cleaner availability…</p> : null}
      {slotAvailability?.busy.some((c) => selected.has(c.id)) ? (
        <p className="text-xs font-medium text-amber-800 dark:text-amber-200/90">
          A selected cleaner already has a booking at this time. You can still submit — you&apos;ll see the overlap flow
          if required.
        </p>
      ) : null}
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Select up to {ADMIN_MAX_PREFERRED_CLEANERS} cleaners. Stored as the customer&apos;s chosen cleaners for dispatch
        (including before payment on per-booking links). The first selection is offered first.
      </p>
    </div>
  );
}
