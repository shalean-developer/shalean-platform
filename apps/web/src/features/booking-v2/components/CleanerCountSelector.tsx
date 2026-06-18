"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
};

export function CleanerCountSelector({
  value,
  onChange,
  min = 1,
  max = 3,
}: Props) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-6">
        <button
          type="button"
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
          aria-label="Remove a cleaner"
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-xl border text-lg font-medium transition",
            value <= min
              ? "cursor-not-allowed border-slate-100 text-slate-300"
              : "border-slate-200 text-slate-600 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600",
          )}
        >
          <Minus className="h-4 w-4" aria-hidden />
        </button>

        <div className="flex min-w-[64px] flex-col items-center">
          <span className="text-4xl font-bold text-slate-900">{value}</span>
          <span className="text-xs text-slate-400">cleaner{value > 1 ? "s" : ""}</span>
        </div>

        <button
          type="button"
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
          aria-label="Add a cleaner"
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-xl border text-lg font-medium transition",
            value >= max
              ? "cursor-not-allowed border-slate-100 text-slate-300"
              : "border-slate-200 text-slate-600 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600",
          )}
        >
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
