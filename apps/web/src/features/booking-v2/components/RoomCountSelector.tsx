"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  BATHROOM_CHIP_VALUES,
  BEDROOM_CHIP_VALUES,
  EXTRA_ROOM_CHIP_VALUES,
  roomCountChipLabel,
  roomCountCustomChip,
  roomCountCustomMinimum,
  roomCountToChip,
  type RoomKind,
} from "@/src/features/booking-v2/config/roomCountOptions";

type RoomCountSelectorProps = {
  id: string;
  kind: RoomKind;
  value: string;
  onChange: (value: string) => void;
  error?: string;
};

/**
 * Compact chip selector with a custom-count threshold for bedrooms, bathrooms,
 * and extra rooms.
 */
export function RoomCountSelector({ id, kind, value, onChange, error }: RoomCountSelectorProps) {
  const chips =
    kind === "bedrooms"
      ? BEDROOM_CHIP_VALUES
      : kind === "bathrooms"
        ? BATHROOM_CHIP_VALUES
        : EXTRA_ROOM_CHIP_VALUES;
  const customMinimum = roomCountCustomMinimum(kind);
  const customChip = roomCountCustomChip(kind);
  const selectedChip = roomCountToChip(value, kind);
  const [customOpen, setCustomOpen] = useState(false);
  const [draft, setDraft] = useState(
    value && Number(value) >= customMinimum ? String(value) : String(customMinimum),
  );

  useEffect(() => {
    if (!customOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCustomOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [customOpen]);

  function selectChip(chip: string) {
    if (chip === customChip) {
      setDraft(
        value && Number(value) >= customMinimum ? String(value) : String(customMinimum),
      );
      setCustomOpen(true);
      return;
    }
    onChange(chip);
  }

  function confirmCustom() {
    const n = Math.floor(Number(draft));
    if (!Number.isFinite(n) || n < customMinimum || n > 25) return;
    onChange(String(n));
    setCustomOpen(false);
  }

  function adjustDraft(delta: -1 | 1) {
    const current = Number.parseInt(draft, 10);
    const safeCurrent = Number.isFinite(current) ? current : customMinimum;
    setDraft(String(Math.min(25, Math.max(customMinimum, safeCurrent + delta))));
  }

  return (
    <div>
      <div
        id={id}
        role="group"
        aria-label={
          kind === "bedrooms"
            ? "Number of bedrooms"
            : kind === "bathrooms"
              ? "Number of bathrooms"
              : "Number of extra rooms"
        }
        className="flex flex-wrap gap-2"
      >
        {chips.map((chip) => {
          const active = selectedChip === chip;
          const label = roomCountChipLabel(chip);
          return (
            <button
              key={chip}
              type="button"
              onClick={() => selectChip(chip)}
              aria-label={chip === customChip ? label : undefined}
              className={cn(
                "inline-flex min-h-10 items-center justify-center rounded-xl border px-3 text-sm font-semibold transition",
                chip === customChip ? "min-w-[5.5rem]" : "min-w-10",
                active
                  ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                  : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
      {selectedChip === customChip && value && Number(value) >= customMinimum ? (
        <p className="mt-1.5 text-xs text-slate-500">
          Using exact count: <span className="font-semibold text-slate-700">{value}</span>
        </p>
      ) : null}
      {error ? <p className="mt-1 text-xs text-red-500">{error}</p> : null}

      {customOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${id}-custom-title`}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setCustomOpen(false)} />
          <div className="relative z-10 w-full max-w-sm rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl">
            <h4 id={`${id}-custom-title`} className="text-base font-bold text-slate-900">
              Enter exact {kind === "bedrooms" ? "bedroom" : kind === "bathrooms" ? "bathroom" : "extra room"} count
            </h4>
            <p className="mt-1 text-sm text-slate-500">
              Enter {customMinimum} or more. Pricing and duration use the exact number you enter.
            </p>
            <div
              className="mt-4 grid grid-cols-[3.5rem_1fr_3.5rem] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
              role="group"
              aria-label={`Exact ${kind === "bedrooms" ? "bedroom" : kind === "bathrooms" ? "bathroom" : "extra room"} count`}
            >
              <button
                type="button"
                onClick={() => adjustDraft(-1)}
                disabled={Number(draft) <= customMinimum}
                aria-label="Decrease count"
                className="min-h-12 border-r border-slate-200 text-2xl font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:cursor-not-allowed disabled:text-slate-300"
              >
                −
              </button>
              <output
                className="flex min-h-12 items-center justify-center text-lg font-bold text-slate-900"
                aria-live="polite"
              >
                {draft}
              </output>
              <button
                type="button"
                onClick={() => adjustDraft(1)}
                disabled={Number(draft) >= 25}
                aria-label="Increase count"
                className="min-h-12 border-l border-slate-200 text-2xl font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:cursor-not-allowed disabled:text-slate-300"
              >
                +
              </button>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCustomOpen(false)}
                className="inline-flex min-h-10 items-center rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmCustom}
                className="inline-flex min-h-10 items-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
