"use client";

import { BOOKING_FLOW_STEPS } from "@/lib/booking/bookingFlow";
import { cn } from "@/lib/utils";

/** Labels aligned with {@link BOOKING_FLOW_STEPS}: entry → checkout */
export const BOOKING_MAIN_FLOW_PROGRESS_LABELS = ["Start", "Quote", "Home", "Schedule", "Pay"] as const;

export type ProgressBarProps =
  | {
      currentStep: number;
      className?: string;
      /** When omitted and `total === 5`, uses {@link BOOKING_MAIN_FLOW_PROGRESS_LABELS} */
      stepLabels?: readonly string[];
    }
  | {
      step: number;
      totalSteps: number;
      className?: string;
      stepLabels?: readonly string[];
    };

function resolveProgress(props: ProgressBarProps): {
  active: number;
  total: number;
  className?: string;
  stepLabels?: readonly string[];
} {
  if ("totalSteps" in props) {
    return {
      active: props.step,
      total: props.totalSteps,
      className: props.className,
      stepLabels: props.stepLabels,
    };
  }
  return {
    active: props.currentStep,
    total: BOOKING_FLOW_STEPS.length,
    className: props.className,
    stepLabels: props.stepLabels,
  };
}

export function ProgressBar(props: ProgressBarProps) {
  const { active, total, className, stepLabels: labelsProp } = resolveProgress(props);
  const totalSafe = total > 0 ? total : 1;
  const activeSafe = Math.min(Math.max(active, 1), totalSafe);

  const labels =
    labelsProp && labelsProp.length === totalSafe
      ? labelsProp
      : totalSafe === BOOKING_FLOW_STEPS.length
        ? [...BOOKING_MAIN_FLOW_PROGRESS_LABELS]
        : null;

  return (
    <div className={cn("w-full", className)} role="navigation" aria-label="Booking progress">
      <div className="flex w-full gap-1 sm:gap-1.5">
        {Array.from({ length: totalSafe }, (_, i) => {
          const stepIndex = i + 1;
          const complete = stepIndex < activeSafe;
          const current = stepIndex === activeSafe;
          return (
            <div key={stepIndex} className="min-w-0 flex-1">
              <div
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300 ease-out sm:h-2",
                  complete && "bg-blue-600 dark:bg-blue-500",
                  current && "bg-blue-600 shadow-[0_0_0_3px_rgba(37,99,235,0.22)] dark:bg-blue-500 dark:shadow-[0_0_0_3px_rgba(59,130,246,0.2)]",
                  !complete && !current && "bg-zinc-200 dark:bg-zinc-700",
                )}
                aria-hidden
              />
            </div>
          );
        })}
      </div>
      {labels ? (
        <div className="mt-2 hidden min-h-[2rem] sm:flex sm:justify-between sm:gap-0.5">
          {labels.map((label, i) => {
            const stepIndex = i + 1;
            const complete = stepIndex < activeSafe;
            const current = stepIndex === activeSafe;
            return (
              <span
                key={`${label}-${i}`}
                className={cn(
                  "min-w-0 flex-1 text-center text-[10px] font-semibold uppercase leading-tight tracking-wide",
                  current && "text-blue-700 dark:text-blue-400",
                  complete && !current && "text-zinc-600 dark:text-zinc-400",
                  !complete && !current && "text-zinc-400 dark:text-zinc-500",
                )}
              >
                {label}
              </span>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
