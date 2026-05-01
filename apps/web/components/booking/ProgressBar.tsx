"use client";

import { BOOKING_FLOW_STEPS } from "@/lib/booking/bookingFlow";
import { cn } from "@/lib/utils";

export type ProgressBarProps =
  | {
      currentStep: number;
      className?: string;
    }
  | {
      step: number;
      totalSteps: number;
      className?: string;
    };

function resolveProgress(props: ProgressBarProps): { active: number; total: number; className?: string } {
  if ("totalSteps" in props) {
    return { active: props.step, total: props.totalSteps, className: props.className };
  }
  return { active: props.currentStep, total: BOOKING_FLOW_STEPS.length, className: props.className };
}

export function ProgressBar(props: ProgressBarProps) {
  const { active, total, className } = resolveProgress(props);
  const pct = total > 0 ? (Math.min(Math.max(active, 0), total) / total) * 100 : 0;

  return (
    <div className={cn("w-full", className)}>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-zinc-700">
        <div
          className="h-full rounded-full bg-blue-600 transition-all duration-300 ease-out dark:bg-blue-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
