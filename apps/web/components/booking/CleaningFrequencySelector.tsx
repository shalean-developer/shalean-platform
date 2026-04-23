"use client";

import { cn } from "@/lib/utils";

type Frequency = "one_time" | "weekly" | "biweekly" | "monthly";

const OPTIONS: { id: Frequency; label: string; hint: string }[] = [
  { id: "one_time", label: "One-time", hint: "No recurring plan" },
  { id: "weekly", label: "Weekly (save 10%)", hint: "Most popular" },
  { id: "biweekly", label: "Every 2 weeks (save 5%)", hint: "Great value" },
  { id: "monthly", label: "Monthly", hint: "Low-maintenance" },
];

export function CleaningFrequencySelector({
  value,
  onChange,
}: {
  value: Frequency;
  onChange: (next: Frequency) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
      {OPTIONS.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={cn(
              "rounded-xl border p-4 text-left transition-all",
              active
                ? "border-blue-500 bg-blue-50 text-blue-900"
                : "border-zinc-200 bg-white text-zinc-700 hover:border-blue-200 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-200",
            )}
          >
            <p className="text-sm font-semibold">{opt.label}</p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{opt.hint}</p>
          </button>
        );
      })}
    </div>
  );
}
