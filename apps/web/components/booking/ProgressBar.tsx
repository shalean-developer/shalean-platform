"use client";

import { Fragment } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const DEFAULT_STEPS = ["Service", "Price", "Property", "Schedule", "Payment"] as const;

export type ProgressBarProps = {
  /** 1-based step index (1 … number of steps). */
  currentStep: number;
  className?: string;
  steps?: readonly string[];
};

function clampStep(n: number, total: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(Math.max(Math.floor(n), 1), total);
}

export function ProgressBar({ currentStep, className, steps = DEFAULT_STEPS }: ProgressBarProps) {
  const labels = steps.length > 0 ? steps : DEFAULT_STEPS;
  const total = labels.length;
  const activeIndex = clampStep(currentStep, total) - 1;

  return (
    <nav className={cn("flex min-h-0 w-full items-center justify-center", className)} aria-label="Booking progress">
      {/* Narrow view: dots only, no step text */}
      <div className="flex w-full items-center justify-center lg:hidden" aria-hidden>
        <div className="flex max-w-full items-center justify-center gap-1">
          {labels.map((_, index) => {
            const isActive = index === activeIndex;
            const isDone = index < activeIndex;
            return (
              <div
                key={index}
                className={cn(
                  "rounded-full transition-all duration-200",
                  isActive ? "h-2 w-3.5 bg-blue-600 dark:bg-blue-500" : "h-2 w-2",
                  !isActive && isDone && "bg-blue-600/85 dark:bg-blue-500/85",
                  !isActive && !isDone && "bg-gray-200 dark:bg-zinc-700",
                )}
              />
            );
          })}
        </div>
      </div>

      {/* Desktop: labels + connectors, vertically centered in header */}
      <div className="hidden h-full min-h-0 w-full max-w-2xl items-center justify-center lg:flex">
        <div className="flex w-full items-center justify-center">
          {labels.map((label, index) => {
            const isActive = index === activeIndex;
            const isDone = index < activeIndex;
            const isLast = index === total - 1;

            return (
              <Fragment key={label}>
                <div className="flex min-w-0 flex-1 items-center">
                  <div className="flex shrink-0 flex-col items-center text-center">
                    <div
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors",
                        isDone && "bg-blue-600 text-white dark:bg-blue-500",
                        isActive &&
                          "border-2 border-blue-600 bg-white text-blue-600 dark:border-blue-400 dark:bg-zinc-950 dark:text-blue-400",
                        !isDone && !isActive && "bg-gray-200 text-gray-400 dark:bg-zinc-700 dark:text-zinc-500",
                      )}
                      aria-current={isActive ? "step" : undefined}
                    >
                      {isDone ? <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden /> : index + 1}
                    </div>
                    <span
                      className={cn(
                        "mt-1 max-w-[4.75rem] text-center text-xs leading-tight",
                        isActive && "font-semibold text-blue-600 dark:text-blue-400",
                        !isActive && "text-gray-400 dark:text-zinc-500",
                      )}
                    >
                      {label}
                    </span>
                  </div>
                  {!isLast ? (
                    <div
                      className="mx-2 h-[2px] min-w-[0.25rem] flex-1 self-center overflow-hidden rounded-full bg-gray-200 dark:bg-zinc-700"
                      aria-hidden
                    >
                      <div
                        className={cn(
                          "h-[2px] rounded-full transition-all duration-300",
                          isDone ? "w-full bg-blue-600 dark:bg-blue-500" : "w-0 bg-transparent",
                        )}
                      />
                    </div>
                  ) : null}
                </div>
              </Fragment>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
