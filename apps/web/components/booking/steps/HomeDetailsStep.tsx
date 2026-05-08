"use client";

import type { ReactNode } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const stepperBtnClass =
  "flex h-10 min-h-10 w-9 min-w-9 shrink-0 items-center justify-center rounded-lg text-blue-600 transition hover:bg-blue-50 active:scale-[0.97] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-35 sm:h-12 sm:min-h-[44px] sm:w-11 sm:min-w-[44px] dark:text-blue-400 dark:hover:bg-blue-950/40";

type CounterKey = "bedrooms" | "bathrooms" | "extraRooms";

type RoomCounterProps = {
  label: ReactNode;
  counterName: string;
  counterKey: CounterKey;
  value: number;
  min: number;
  max: number;
  onChange: (next: CounterKey, n: number) => void;
};

function RoomCounter({ label, counterName, counterKey, value, min, max, onChange }: RoomCounterProps) {
  return (
    <div className="flex min-w-0 w-full max-w-full flex-col items-center">
      {/* Same min-height for every column so steppers align. */}
      <div className="mb-1 flex min-h-8 w-full items-center justify-center px-0.5 sm:mb-2 sm:min-h-10">
        {typeof label === "string" ? (
          <span className="text-center text-[11px] font-semibold leading-snug text-zinc-500 sm:text-xs dark:text-zinc-400">
            {label}
          </span>
        ) : (
          label
        )}
      </div>
      <div
        className={cn(
          "flex h-10 min-w-0 w-full max-w-full items-center justify-between gap-0 overflow-hidden rounded-xl border border-zinc-200/90 bg-white px-0.5 shadow-sm ring-1 ring-zinc-200/40 sm:mx-auto sm:h-12 sm:max-w-[148px] dark:border-zinc-700 dark:bg-zinc-950 dark:ring-zinc-700/50",
        )}
      >
        <button
          type="button"
          className={stepperBtnClass}
          disabled={value <= min}
          onClick={() => onChange(counterKey, Math.max(min, value - 1))}
          aria-label={`Decrease ${counterName}`}
        >
          <Minus className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" aria-hidden />
        </button>
        <span className="min-w-0 flex-1 text-center text-xs font-bold tabular-nums text-zinc-900 sm:flex-[1.05] sm:text-sm dark:text-zinc-50">
          {value}
        </span>
        <button
          type="button"
          className={stepperBtnClass}
          disabled={value >= max}
          onClick={() => onChange(counterKey, Math.min(max, value + 1))}
          aria-label={`Increase ${counterName}`}
        >
          <Plus className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" aria-hidden />
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
  const patchCounter = (key: CounterKey, n: number) => {
    onChange({ ...value, [key]: n });
  };

  return (
    <div className="grid min-w-0 w-full grid-cols-3 items-center gap-x-2 gap-y-2 sm:justify-items-center sm:gap-x-4 md:gap-x-6 lg:gap-x-8">
      <RoomCounter
        label="Bedrooms"
        counterName="Bedrooms"
        counterKey="bedrooms"
        value={value.bedrooms}
        min={1}
        max={10}
        onChange={patchCounter}
      />
      <RoomCounter
        label="Bathrooms"
        counterName="Bathrooms"
        counterKey="bathrooms"
        value={value.bathrooms}
        min={1}
        max={6}
        onChange={patchCounter}
      />
      <RoomCounter
        label="Extra rooms"
        counterName="Extra rooms"
        counterKey="extraRooms"
        value={value.extraRooms}
        min={0}
        max={10}
        onChange={patchCounter}
      />
    </div>
  );
}
