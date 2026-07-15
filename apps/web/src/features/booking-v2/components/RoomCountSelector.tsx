"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  BATHROOM_CHIP_VALUES,
  BEDROOM_CHIP_VALUES,
  roomCountChipLabel,
  roomCountToChip,
} from "@/src/features/booking-v2/config/roomCountOptions";

type RoomKind = "bedrooms" | "bathrooms";

type RoomCountSelectorProps = {
  id: string;
  kind: RoomKind;
  value: string;
  onChange: (value: string) => void;
  error?: string;
};

/**
 * Chip selector for bedrooms (0–5, 6+ Custom) or bathrooms (1–5, 6+ Custom).
 * The custom numeric input appears only after selecting 6+ Custom.
 */
export function RoomCountSelector({ id, kind, value, onChange, error }: RoomCountSelectorProps) {
  const chips = kind === "bedrooms" ? BEDROOM_CHIP_VALUES : BATHROOM_CHIP_VALUES;
  const selectedChip = roomCountToChip(value, kind);
  const [customOpen, setCustomOpen] = useState(false);
  const [draft, setDraft] = useState(value && Number(value) >= 6 ? String(value) : "6");

  useEffect(() => {
    if (!customOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCustomOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [customOpen]);

  function selectChip(chip: string) {
    if (chip === "6+") {
      setDraft(value && Number(value) >= 6 ? String(value) : "6");
      setCustomOpen(true);
      return;
    }
    onChange(chip);
  }

  function confirmCustom() {
    const n = Math.floor(Number(draft));
    if (!Number.isFinite(n) || n < 6 || n > 25) return;
    onChange(String(n));
    setCustomOpen(false);
  }

  return (
    <div>
      <div
        id={id}
        role="group"
        aria-label={kind === "bedrooms" ? "Number of bedrooms" : "Number of bathrooms"}
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
              aria-label={chip === "6+" ? label : undefined}
              className={cn(
                "inline-flex min-h-10 items-center justify-center rounded-xl border px-3 text-sm font-semibold transition",
                chip === "6+" ? "min-w-[5.5rem]" : "min-w-10",
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
      {selectedChip === "6+" && value && Number(value) >= 6 ? (
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
              Enter exact {kind === "bedrooms" ? "bedroom" : "bathroom"} count
            </h4>
            <p className="mt-1 text-sm text-slate-500">
              Enter 6 or more. Pricing and duration use the exact number you enter.
            </p>
            <input
              type="number"
              inputMode="numeric"
              min={6}
              max={25}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="mt-4 block w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              autoFocus
            />
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
