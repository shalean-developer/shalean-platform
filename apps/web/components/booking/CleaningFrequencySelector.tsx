"use client";

import { cn } from "@/lib/utils";

type Frequency = "one_time" | "weekly" | "biweekly" | "monthly";

const OPTIONS: {
  id: Frequency;
  shortTitle: string;
  longTitle: string;
  savings?: string;
  popular?: boolean;
}[] = [
  { id: "one_time", shortTitle: "Once", longTitle: "One-time", savings: "No plan" },
  {
    id: "weekly",
    shortTitle: "Weekly",
    longTitle: "Weekly",
    savings: "🔥 Weekly — save R400+/mo",
    popular: true,
  },
  { id: "biweekly", shortTitle: "2 Weeks", longTitle: "Every 2 weeks", savings: "Save 5%" },
  { id: "monthly", shortTitle: "Monthly", longTitle: "Monthly", savings: "Flexible" },
];

export function CleaningFrequencySelector({
  value,
  onChange,
}: {
  value: Frequency;
  onChange: (next: Frequency) => void;
}) {
  return (
    <div className="grid w-full max-w-none min-w-0 grid-cols-4 gap-2 lg:gap-3">
      {OPTIONS.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={cn(
              "flex w-full min-w-0 flex-col items-center justify-center rounded-lg border text-center transition-all",
              "max-lg:min-h-[60px] max-lg:px-1 max-lg:py-2 max-lg:text-[11px] max-lg:font-medium max-lg:leading-tight",
              "lg:min-h-[92px] lg:rounded-xl lg:px-3 lg:py-3 lg:text-sm lg:font-semibold",
              active
                ? "border-blue-600 bg-blue-50 text-blue-900 ring-1 ring-blue-600/10 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-50"
                : "border-zinc-200/90 bg-white text-zinc-800 hover:border-blue-200 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100",
            )}
          >
            {opt.popular ? (
              <span className="mb-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">Popular</span>
            ) : (
              <span className="mb-0.5 h-3 max-lg:block lg:hidden" aria-hidden />
            )}
            <span className="text-[11px] font-medium leading-tight lg:hidden">{opt.shortTitle}</span>
            <span className="hidden text-sm font-semibold leading-tight lg:inline">{opt.longTitle}</span>
            {opt.savings ? (
              <span className="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-400 lg:mt-1 lg:text-xs">{opt.savings}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
