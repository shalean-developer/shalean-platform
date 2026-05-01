"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { ServiceLocationRow } from "@/app/api/booking/service-locations/route";
import type { ServiceAreaSelection } from "@/components/booking/ServiceAreaPicker";
import { BOOKING_FLOW_LOCATION_HINTS } from "@/lib/booking/bookingFlowLocationCatalog";
import { cn } from "@/lib/utils";

export type LocationSearchOption = {
  label: string;
  slug: string;
  source: "api" | "hint";
  api?: ServiceLocationRow;
};

type ScheduleLocationSearchProps = {
  serviceAreaLocationId: string | null;
  locationSlug: string | null;
  serviceAreaName: string;
  onApiSelect: (next: ServiceAreaSelection) => void;
  onHintSelect: (slug: string, displayName: string) => void;
};

function hintOptions(): LocationSearchOption[] {
  return BOOKING_FLOW_LOCATION_HINTS.map((h) => ({
    label: `${h.name} (${h.cityName})`,
    slug: h.slug,
    source: "hint" as const,
  }));
}

function apiOptions(rows: ServiceLocationRow[]): LocationSearchOption[] {
  return rows.map((r) => ({
    label: r.city ? `${r.name} (${r.city})` : r.name,
    slug: r.id,
    source: "api" as const,
    api: r,
  }));
}

export function ScheduleLocationSearch({
  serviceAreaLocationId,
  locationSlug,
  serviceAreaName,
  onApiSelect,
  onHintSelect,
}: ScheduleLocationSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [apiRows, setApiRows] = useState<ServiceLocationRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/booking/service-locations");
        const json = (await res.json()) as { ok?: boolean; locations?: ServiceLocationRow[]; error?: string };
        if (cancelled) return;
        if (res.ok && json.ok === true && Array.isArray(json.locations)) {
          setApiRows(json.locations);
          setLoadError(null);
        } else {
          setApiRows([]);
          setLoadError(typeof json.error === "string" ? json.error : null);
        }
      } catch {
        if (!cancelled) {
          setApiRows([]);
          setLoadError(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const allOptions = useMemo(() => {
    const api = apiOptions(apiRows);
    if (api.length > 0) return api;
    return hintOptions();
  }, [apiRows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allOptions;
    return allOptions.filter((o) => o.label.toLowerCase().includes(q));
  }, [allOptions, query]);

  const selectedLabel = useMemo(() => {
    if (serviceAreaLocationId && apiRows.length) {
      const row = apiRows.find((r) => r.id === serviceAreaLocationId);
      if (row) return row.city ? `${row.name} (${row.city})` : row.name;
    }
    if (locationSlug) {
      const hint = BOOKING_FLOW_LOCATION_HINTS.find((h) => h.slug === locationSlug);
      if (hint) return `${hint.name} (${hint.cityName})`;
    }
    if (serviceAreaName.trim()) return serviceAreaName.trim();
    return "";
  }, [serviceAreaLocationId, locationSlug, serviceAreaName, apiRows]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!open) return;
      const el = rootRef.current;
      if (el && !el.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const pick = useCallback(
    (opt: LocationSearchOption) => {
      if (opt.source === "api" && opt.api) {
        onApiSelect({
          locationId: opt.api.id,
          cityId: opt.api.city_id,
          name: opt.api.name,
        });
      } else {
        const hint = BOOKING_FLOW_LOCATION_HINTS.find((h) => h.slug === opt.slug);
        onHintSelect(opt.slug, hint?.name ?? opt.label.split("(")[0]?.trim() ?? opt.label);
      }
      setOpen(false);
      setQuery("");
      inputRef.current?.blur();
    },
    [onApiSelect, onHintSelect],
  );

  const inputValue = open ? query : selectedLabel;

  return (
    <div ref={rootRef} className="relative w-full">
      <label className="mb-1.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Service area</label>
      <div className="relative">
        <input
          ref={inputRef}
          id="booking-schedule-area-search"
          className={cn(
            "h-12 w-full rounded-xl border border-zinc-200 bg-white py-2 pl-3 pr-10 text-base text-zinc-900 shadow-sm outline-none transition-all duration-200",
            "placeholder:text-zinc-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-500",
            open && "border-blue-500 ring-2 ring-blue-500/20",
          )}
          placeholder="Search your area"
          value={inputValue}
          readOnly={!open}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            setOpen(true);
            setQuery(selectedLabel);
          }}
          autoComplete="off"
          aria-expanded={open}
          aria-controls="booking-area-search-listbox"
          aria-autocomplete="list"
        />
        <button
          type="button"
          tabIndex={-1}
          className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-zinc-400 transition-transform duration-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          aria-label={open ? "Close list" : "Open list"}
          onMouseDown={(e) => {
            e.preventDefault();
            if (open) {
              setOpen(false);
              setQuery("");
            } else {
              setOpen(true);
              setQuery(selectedLabel);
              inputRef.current?.focus();
            }
          }}
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        </button>
      </div>

      {open ? (
        <div
          id="booking-area-search-listbox"
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-60 overflow-y-auto rounded-xl border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
        >
          {loadError && apiRows.length === 0 && allOptions.length === 0 ? (
            <p className="px-3 py-2 text-sm text-zinc-500">Could not load areas.</p>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-2 text-sm text-zinc-500">No matches.</p>
          ) : (
            filtered.map((opt) => (
              <button
                key={`${opt.source}-${opt.slug}`}
                type="button"
                role="option"
                className="flex w-full cursor-pointer px-3 py-2.5 text-left text-sm text-zinc-900 transition-colors duration-200 hover:bg-zinc-50 dark:text-zinc-100 dark:hover:bg-zinc-800"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(opt)}
              >
                {opt.label}
              </button>
            ))
          )}
        </div>
      ) : null}
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Closest area helps us assign your team.</p>
    </div>
  );
}
