"use client";

import { useEffect, useState } from "react";
import { Select } from "@/components/ui/select";
import type { ServiceLocationRow } from "@/app/api/booking/service-locations/route";

export type ServiceAreaSelection = {
  locationId: string | null;
  cityId: string | null;
  name: string;
};

type ServiceAreaPickerProps = {
  id: string;
  value: string | null;
  onChange: (next: ServiceAreaSelection) => void;
  onBlur?: () => void;
  disabled?: boolean;
  /** Shown as first option value="" */
  placeholder: string;
  /** Loading / empty list message for first option */
  loadingLabel?: string;
  className?: string;
  /** After fetch — parent can gate Continue (e.g. require non-empty coverage list). */
  onLocationsLoaded?: (count: number, error: string | null) => void;
  /** Shown when the list loaded successfully but has zero suburbs (e.g. no active cleaner coverage). */
  emptyListMessage?: string;
};

export function ServiceAreaPicker({
  id,
  value,
  onChange,
  onBlur,
  disabled,
  placeholder,
  loadingLabel = "Loading suburbs…",
  className,
  onLocationsLoaded,
  emptyListMessage,
}: ServiceAreaPickerProps) {
  const [locations, setLocations] = useState<ServiceLocationRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void (async () => {
      let count = 0;
      let err: string | null = null;
      try {
        const res = await fetch("/api/booking/service-locations");
        const json = (await res.json()) as { ok?: boolean; locations?: ServiceLocationRow[]; error?: string };
        if (cancelled) return;
        if (!res.ok || json.ok !== true || !Array.isArray(json.locations)) {
          err = typeof json.error === "string" ? json.error : "Could not load suburbs.";
          setLoadError(err);
          setLocations([]);
        } else {
          setLocations(json.locations);
          count = json.locations.length;
        }
      } catch {
        if (!cancelled) {
          err = "Could not load suburbs.";
          setLoadError(err);
          setLocations([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          onLocationsLoaded?.(count, err);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onLocationsLoaded]);

  const busy = disabled || loading || locations.length === 0;

  return (
    <div className="space-y-1.5">
      <Select
        id={id}
        disabled={busy}
        value={value ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) {
            onChange({ locationId: null, cityId: null, name: "" });
            return;
          }
          const row = locations.find((l) => l.id === v);
          onChange({
            locationId: v,
            cityId: row?.city_id ?? null,
            name: (row?.name ?? "").trim().slice(0, 120),
          });
        }}
        onBlur={onBlur}
        className={className}
        aria-label="Service area"
      >
        <option value="">{loading ? loadingLabel : placeholder}</option>
        {locations.map((loc) => (
          <option key={loc.id} value={loc.id}>
            {loc.city ? `${loc.name} (${loc.city})` : loc.name}
          </option>
        ))}
      </Select>
      {loadError ? (
        <p className="text-xs font-medium text-amber-800 dark:text-amber-400/90" role="status">
          {loadError} Refresh the page to try again.
        </p>
      ) : null}
      {!loading && !loadError && locations.length === 0 && emptyListMessage ? (
        <p className="text-xs font-medium text-amber-800 dark:text-amber-400/90" role="status">
          {emptyListMessage}
        </p>
      ) : null}
    </div>
  );
}
