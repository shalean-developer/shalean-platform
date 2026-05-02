"use client";

import type { ReactNode } from "react";
import { Info, Minus, Plus } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const stepperBtnClass =
  "flex min-h-9 min-w-9 shrink-0 items-center justify-center rounded-lg text-gray-800 transition hover:bg-gray-100 active:scale-[0.97] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-35 sm:min-h-[44px] sm:min-w-[44px] dark:text-zinc-100 dark:hover:bg-zinc-700/80";

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
    <div className="flex min-w-0 flex-col items-center">
      {/* Same min-height for every column so steppers align; Extra’s info button used to make this row taller than text-only labels. */}
      <div className="mb-1 flex min-h-8 w-full items-center justify-center px-0.5 sm:mb-2 sm:min-h-10">
        {typeof label === "string" ? (
          <span className="text-center text-[11px] leading-tight text-gray-600 sm:text-sm dark:text-zinc-400">{label}</span>
        ) : (
          label
        )}
      </div>
      <div
        className={cn(
          "flex w-full max-w-full items-center justify-between gap-0.5 rounded-lg border border-gray-200 bg-gray-50 px-1 py-0.5 sm:max-w-[148px] sm:rounded-xl sm:px-1.5 sm:py-1",
          "dark:border-zinc-700 dark:bg-zinc-800/50",
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
        <span className="min-w-[1.25rem] text-center text-xs font-semibold tabular-nums text-gray-900 sm:min-w-[1.5rem] sm:text-sm dark:text-zinc-50">
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
    <TooltipProvider delayDuration={200} skipDelayDuration={200}>
      <div className="grid min-w-0 grid-cols-3 items-start gap-1.5 sm:gap-4 md:gap-6 lg:gap-8">
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
          label={
            <div className="flex max-w-full items-center justify-center gap-0.5 sm:gap-1.5">
              <span className="text-[11px] leading-tight text-gray-600 sm:text-sm dark:text-zinc-400">
                <span className="md:hidden">Extra</span>
                <span className="hidden md:inline">Extra rooms</span>
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-gray-400 outline-none transition hover:text-gray-600 focus-visible:ring-2 focus-visible:ring-blue-500/50 sm:size-8 dark:text-zinc-500 dark:hover:text-zinc-300"
                    aria-label="More about extra rooms"
                  >
                    <Info className="size-3.5" aria-hidden />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-sm">
                  Study, office, spare room
                </TooltipContent>
              </Tooltip>
            </div>
          }
          counterName="Extra rooms"
          counterKey="extraRooms"
          value={value.extraRooms}
          min={0}
          max={10}
          onChange={patchCounter}
        />
      </div>
    </TooltipProvider>
  );
}
