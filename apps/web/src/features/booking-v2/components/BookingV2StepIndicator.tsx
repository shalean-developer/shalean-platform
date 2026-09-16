"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { BOOKING_STEP_LABELS, type BookingStep } from "@/src/features/booking-v2/types";

const STEPS: BookingStep[] = [1, 2, 3, 4];

type Props = {
  currentStep: BookingStep;
  onStepClick?: (step: BookingStep) => void;
};

export function BookingV2StepIndicator({ currentStep, onStepClick }: Props) {
  const completedProgress = ((currentStep - 1) / (STEPS.length - 1)) * 100;

  return (
    <nav aria-label="Booking progress" className="w-full min-w-0">
      <ol className="relative mx-auto grid w-full max-w-3xl grid-cols-4">
        <li
          className="pointer-events-none absolute left-[12.5%] right-[12.5%] top-[18px] h-px bg-slate-200"
          aria-hidden
        >
          <span
            className="block h-full bg-primary transition-[width] duration-300"
            style={{ width: `${completedProgress}%` }}
          />
        </li>
        {STEPS.map((step) => {
          const isCompleted = step < currentStep;
          const isActive = step === currentStep;
          const isClickable = onStepClick && step < currentStep;

          return (
            <li key={step} className="relative z-10 flex min-w-0 justify-center">
              <button
                type="button"
                onClick={() => isClickable && onStepClick(step)}
                disabled={!isClickable}
                className={cn(
                  "group flex min-w-0 flex-col items-center gap-1 bg-transparent px-1 transition sm:px-3",
                  isClickable && "cursor-pointer",
                  !isClickable && "cursor-default",
                )}
                aria-current={isActive ? "step" : undefined}
                aria-label={`${BOOKING_STEP_LABELS[step]}${isCompleted ? " completed" : ""}`}
              >
                <div
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium shadow-sm ring-2 ring-background transition-colors",
                    isCompleted && "bg-primary text-primary-foreground group-hover:bg-primary/90",
                    isActive && "bg-slate-950 text-white",
                    !isCompleted && !isActive && "bg-slate-200 text-slate-800",
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                  ) : (
                    step
                  )}
                </div>
                <span
                  className={cn(
                    "truncate text-xs font-medium leading-tight sm:text-sm",
                    isActive && "text-slate-950",
                    isCompleted && "text-slate-950",
                    !isCompleted && !isActive && "text-muted-foreground",
                  )}
                >
                  {BOOKING_STEP_LABELS[step]}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
