"use client";

import type { ReactNode } from "react";
import { Info, Minus, Plus } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const stepperBtnClass =
  "flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg text-gray-800 transition hover:bg-gray-100 active:scale-[0.97] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-35 dark:text-zinc-100 dark:hover:bg-zinc-700/80";

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
  const labelBlock =
    typeof label === "string" ? (
      <span className="mb-2 block w-full px-0.5 text-center text-sm text-gray-600 dark:text-zinc-400">{label}</span>
    ) : (
      <div className="mb-2 flex w-full justify-center px-0.5">{label}</div>
    );

  return (
    <div className="flex min-w-0 flex-col items-center">
      {labelBlock}
      <div
        className={cn(
          "flex w-full max-w-[148px] items-center justify-between gap-0.5 rounded-xl border border-gray-200 bg-gray-50 px-1.5 py-1",
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
          <Minus className="h-4 w-4 shrink-0" aria-hidden />
        </button>
        <span className="min-w-[1.5rem] text-center text-sm font-semibold tabular-nums text-gray-900 dark:text-zinc-50">
          {value}
        </span>
        <button
          type="button"
          className={stepperBtnClass}
          disabled={value >= max}
          onClick={() => onChange(counterKey, Math.min(max, value + 1))}
          aria-label={`Increase ${counterName}`}
        >
          <Plus className="h-4 w-4 shrink-0" aria-hidden />
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
      <div className="grid min-w-0 grid-cols-3 items-start gap-3">
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
            <div className="flex max-w-full items-center justify-center gap-1.5 text-center">
              <span className="text-sm text-gray-600 dark:text-zinc-400">
                <span className="md:hidden">Extra</span>
                <span className="hidden md:inline">Extra rooms</span>
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-md text-gray-400 outline-none transition hover:text-gray-600 focus-visible:ring-2 focus-visible:ring-blue-500/50 dark:text-zinc-500 dark:hover:text-zinc-300"
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
