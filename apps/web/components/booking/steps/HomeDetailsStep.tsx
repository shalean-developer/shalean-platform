"use client";

import type { ReactNode } from "react";
import { Info, Minus, Plus } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type CounterCardProps = {
  /** Visible label (string or node with e.g. info tooltip) */
  label: ReactNode;
  /** Short name for +/- `aria-label`s */
  counterName: string;
  helper?: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
};

function CounterCard({ label, counterName, helper, value, min, max, onChange }: CounterCardProps) {
  const labelBlock =
    typeof label === "string" ? (
      <p className="text-sm text-gray-500 dark:text-zinc-400">{label}</p>
    ) : (
      label
    );

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
      <div className={helper ? "mb-1" : "mb-2"}>{labelBlock}</div>
      {helper ? (
        <p className="mb-2 text-xs text-gray-400 dark:text-zinc-500">{helper}</p>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-900 transition hover:border-gray-300 hover:bg-gray-50 disabled:pointer-events-none disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-zinc-500 dark:hover:bg-zinc-800"
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
          aria-label={`Decrease ${counterName}`}
        >
          <Minus className="h-4 w-4" aria-hidden />
        </button>
        <span className="text-lg font-semibold tabular-nums text-gray-900 dark:text-zinc-50">{value}</span>
        <button
          type="button"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-900 transition hover:border-gray-300 hover:bg-gray-50 disabled:pointer-events-none disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-zinc-500 dark:hover:bg-zinc-800"
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
          aria-label={`Increase ${counterName}`}
        >
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

export type HomeDetails = {
  bedrooms: number;
  bathrooms: number;
  extraRooms: number;
};

type HomeDetailsStepProps = {
  value: HomeDetails;
  onChange: (next: HomeDetails) => void;
};

export function HomeDetailsStep({ value, onChange }: HomeDetailsStepProps) {
  return (
    <TooltipProvider delayDuration={200} skipDelayDuration={200}>
      <div className="grid grid-cols-3 gap-4">
        <CounterCard
          label="Bedrooms"
          counterName="Bedrooms"
          value={value.bedrooms}
          min={1}
          max={10}
          onChange={(bedrooms) => onChange({ ...value, bedrooms })}
        />
        <CounterCard
          label="Bathrooms"
          counterName="Bathrooms"
          value={value.bathrooms}
          min={1}
          max={6}
          onChange={(bathrooms) => onChange({ ...value, bathrooms })}
        />
        <CounterCard
          label={
            <div className="flex items-center gap-2">
              <p className="text-sm text-gray-500 dark:text-zinc-400">Extra rooms</p>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="text-gray-400 outline-none transition hover:text-gray-600 focus-visible:ring-2 focus-visible:ring-blue-500/50 dark:text-zinc-500 dark:hover:text-zinc-300"
                    aria-label="More about extra rooms"
                  >
                    <Info size={14} aria-hidden />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-sm">
                  Study, office, spare room
                </TooltipContent>
              </Tooltip>
            </div>
          }
          counterName="Extra rooms"
          value={value.extraRooms}
          min={0}
          max={10}
          onChange={(extraRooms) => onChange({ ...value, extraRooms })}
        />
      </div>
    </TooltipProvider>
  );
}
