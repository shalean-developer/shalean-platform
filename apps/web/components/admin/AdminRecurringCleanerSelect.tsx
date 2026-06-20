"use client";

import { useEffect, useState } from "react";
import { fetchCleaners, type AdminCleanerRow } from "@/lib/admin/dashboard";
import { getAdminToken } from "@/hooks/useAdminData";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

export type AdminRecurringCleanerSelectProps = {
  id?: string;
  value: string;
  onChange: (cleanerId: string) => void;
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

export function AdminRecurringCleanerSelect({
  id = "recurring-cleaner",
  value,
  onChange,
  visitDate,
  visitTime,
  disabled = false,
}: AdminRecurringCleanerSelectProps) {
  const [cleaners, setCleaners] = useState<AdminCleanerRow[]>([]);
  const [slotAvailability, setSlotAvailability] = useState<{
    available: AdminCleanerRow[];
    busy: (AdminCleanerRow & { conflicting_booking_id: string })[];
  } | null>(null);
  const [slotLoading, setSlotLoading] = useState(false);

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

  const sel = value.trim();
  const hasBuckets =
    slotAvailability != null && (slotAvailability.available.length > 0 || slotAvailability.busy.length > 0);
  const inBuckets =
    hasBuckets && [...slotAvailability!.available, ...slotAvailability!.busy].some((c) => c.id === sel);
  const orphan = sel && hasBuckets && !inBuckets ? cleaners.find((c) => c.id === sel) : null;

  return (
    <div className="space-y-2 border-l-4 border-amber-400/80 pl-3">
      <Label htmlFor={id}>Preferred cleaner (optional)</Label>
      <Select id={id} label="" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        <option value="">Dispatch later / no preference</option>
        {hasBuckets ? (
          <>
            <optgroup label="Available">
              {slotAvailability!.available.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                  {c.phone ? ` · ${c.phone}` : ""}
                </option>
              ))}
            </optgroup>
            <optgroup label="Busy at this time">
              {slotAvailability!.busy.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                  {c.phone ? ` · ${c.phone}` : ""} (busy)
                </option>
              ))}
            </optgroup>
            {orphan ? (
              <optgroup label="Other">
                <option value={orphan.id}>
                  {orphan.full_name}
                  {orphan.phone ? ` · ${orphan.phone}` : ""}
                </option>
              </optgroup>
            ) : null}
          </>
        ) : (
          cleaners.map((c) => (
            <option key={c.id} value={c.id}>
              {c.full_name}
              {c.phone ? ` · ${c.phone}` : ""}
            </option>
          ))
        )}
      </Select>
      {slotLoading ? <p className="text-xs text-zinc-500">Checking cleaner availability…</p> : null}
      {slotAvailability?.busy.some((c) => c.id === sel) ? (
        <p className="text-xs font-medium text-amber-800 dark:text-amber-200/90">
          Cleaner already has a booking at this time. You can still assign them as preferred.
        </p>
      ) : null}
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Applied to new visits and open occurrence bookings when saved.
      </p>
    </div>
  );
}
