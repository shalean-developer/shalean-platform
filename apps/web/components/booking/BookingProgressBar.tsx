"use client";

import type { BookingFlowStep } from "@/lib/booking/bookingFlow";
import { BOOKING_FLOW_STEPS } from "@/lib/booking/bookingFlow";
import { bookingCopy } from "@/lib/booking/copy";

const STEP_LABELS: Record<BookingFlowStep, string> = {
  entry: "Where",
  quote: "Price",
  details: "Home",
  when: "When",
  checkout: "Pay",
};

type BookingProgressBarProps = {
  step: BookingFlowStep;
  className?: string;
  /** Compact header row: step label + small dots (mobile-first booking header). */
  compact?: boolean;
};

export function BookingProgressBar({ step, className = "", compact = false }: BookingProgressBarProps) {
  const activeIndex = BOOKING_FLOW_STEPS.indexOf(step);
  const currentStepNumber = activeIndex + 1;
  const showProgressPsych = activeIndex >= 1;

  const compactPsych =
    activeIndex === 2
      ? bookingCopy.progress.psychAfterDetails
      : activeIndex === 3
        ? bookingCopy.progress.psychSchedule
        : activeIndex === 4
          ? bookingCopy.progress.psychCheckout
          : null;

  if (compact) {
    return (
      <div className={`flex flex-col items-center gap-0.5 ${className}`.trim()}>
        <p className="text-center text-[10px] font-medium leading-none text-zinc-500 dark:text-zinc-400">
          Step {currentStepNumber} of 5
          {compactPsych ? (
            <>
              {" "}
              <span className="text-zinc-700 dark:text-zinc-300">— {compactPsych}</span>
            </>
          ) : null}
        </p>
        <div className="flex items-center justify-center gap-1" aria-hidden>
          {BOOKING_FLOW_STEPS.map((key, index) => {
            const isActive = index === activeIndex;
            const isDone = index < activeIndex;
            return (
              <div
                key={key}
                className={[
                  "rounded-full transition-all duration-200",
                  isActive ? "h-2 w-3 bg-blue-600 dark:bg-blue-500" : "h-2 w-2",
                  !isActive && isDone ? "bg-blue-600/60 dark:bg-blue-500/50" : "",
                  !isActive && !isDone ? "bg-zinc-300 dark:bg-zinc-600" : "",
                ].join(" ")}
              />
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full ${className}`.trim()}>
      {showProgressPsych ? (
        <p className="mb-2 text-center text-[11px] font-medium leading-tight text-zinc-600 dark:text-zinc-400 sm:text-xs">
          Step {currentStepNumber} of 5 —{" "}
          <span
            className={
              currentStepNumber >= 3
                ? "font-semibold text-zinc-900 dark:text-zinc-100"
                : "font-medium text-zinc-700 dark:text-zinc-300"
            }
          >
            almost done
          </span>
        </p>
      ) : null}

      <div className="flex justify-center gap-1.5 sm:hidden" aria-hidden>
        {BOOKING_FLOW_STEPS.map((key, index) => {
          const emphasize = index >= 2;
          return (
            <div
              key={key}
              className={[
                "rounded-full transition-colors",
                emphasize ? "h-2.5 w-2.5" : "h-2 w-2",
                index === activeIndex
                  ? "bg-primary scale-110"
                  : index < activeIndex
                    ? emphasize
                      ? "bg-primary/70"
                      : "bg-primary/50"
                    : emphasize
                      ? "bg-zinc-400 dark:bg-zinc-500"
                      : "bg-zinc-300 dark:bg-zinc-600",
              ].join(" ")}
            />
          );
        })}
      </div>

      <div className="hidden gap-1 sm:flex">
        {BOOKING_FLOW_STEPS.map((key, index) => {
          const isActive = step === key;
          const isCompleted = activeIndex > index;
          const emphasizeLate = index >= 2;
          return (
            <div key={key} className="min-w-0 flex-1">
              <div
                className={[
                  "h-1.5 rounded-full transition-all duration-200",
                  isCompleted
                    ? "bg-primary"
                    : isActive
                      ? "bg-primary/70"
                      : emphasizeLate
                        ? "bg-zinc-300 dark:bg-zinc-600"
                        : "bg-zinc-200 dark:bg-zinc-700",
                ].join(" ")}
              />
              <p
                className={[
                  "mt-1 truncate text-center text-[11px] leading-tight",
                  isActive
                    ? "font-semibold text-primary"
                    : emphasizeLate
                      ? "font-semibold text-zinc-800 dark:text-zinc-200"
                      : "text-zinc-500 dark:text-zinc-400",
                ].join(" ")}
              >
                {STEP_LABELS[key]}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
