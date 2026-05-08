"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Loader2 } from "lucide-react";
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
  /** Field label (defaults to “Service area”). */
  label?: string;
  helperText?: string;
  placeholder?: string;
  /** Green check when an area is selected (checkout polish). */
  showValidationAffordance?: boolean;
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
  label = "Service area",
  helperText,
  placeholder = "Search your area",
  showValidationAffordance = false,
}: ScheduleLocationSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [apiRows, setApiRows] = useState<ServiceLocationRow[]>([]);
  const [areasReady, setAreasReady] = useState(false);
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
      } finally {
        if (!cancelled) setAreasReady(true);
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
  const hasSelection = Boolean(selectedLabel.trim());
  const showCheck = showValidationAffordance && hasSelection && !open && areasReady;

  return (
    <div ref={rootRef} className="relative w-full">
      <label
        htmlFor="booking-schedule-area-search"
        className="mb-2 block text-sm font-semibold text-zinc-900 dark:text-zinc-100"
      >
        {label}
      </label>
      <div className="relative">
        <input
          ref={inputRef}
          id="booking-schedule-area-search"
          className={cn(
            "h-12 min-h-[48px] w-full rounded-xl border border-zinc-200 bg-white py-2 pl-3 pr-24 text-base text-zinc-900 shadow-sm outline-none transition-all duration-200",
            "placeholder:text-zinc-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-500",
            open && "border-blue-600 ring-2 ring-blue-500/25",
            showCheck && "border-emerald-200/90 dark:border-emerald-800/60",
          )}
          placeholder={placeholder}
          value={inputValue}
          readOnly={!open}
          disabled={!areasReady && apiRows.length === 0}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            setOpen(true);
            setQuery(selectedLabel);
          }}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls="booking-area-search-listbox"
          aria-autocomplete="list"
        />
        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
          {!areasReady && apiRows.length === 0 ? (
            <Loader2 className="h-4 w-4 animate-spin text-zinc-400" aria-hidden />
          ) : null}
          {showCheck ? (
            <span
              className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm shadow-emerald-600/20"
              aria-hidden
            >
              <Check className="h-4 w-4" strokeWidth={2.5} />
            </span>
          ) : null}
          <button
            type="button"
            tabIndex={-1}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition-transform duration-200 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
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
            filtered.map((opt) => {
              const selectedOpt =
                (opt.source === "api" && opt.api && serviceAreaLocationId === opt.api.id) ||
                (opt.source === "hint" && locationSlug === opt.slug);
              return (
                <button
                  key={`${opt.source}-${opt.slug}`}
                  type="button"
                  role="option"
                  aria-selected={selectedOpt}
                  className="flex w-full cursor-pointer px-3 py-2.5 text-left text-sm text-zinc-900 transition-colors duration-200 hover:bg-zinc-50 dark:text-zinc-100 dark:hover:bg-zinc-800"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(opt)}
                >
                  {opt.label}
                </button>
              );
            })
          )}
        </div>
      ) : null}
      {helperText ? <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">{helperText}</p> : null}
    </div>
  );
}
