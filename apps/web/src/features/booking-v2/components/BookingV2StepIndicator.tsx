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
  return (
    <nav aria-label="Booking progress" className="w-full min-w-0">
      <ol className="flex items-center justify-center gap-0">
        {STEPS.map((step, index) => {
          const isCompleted = step < currentStep;
          const isActive = step === currentStep;
          const isClickable = onStepClick && step < currentStep;

          return (
            <li key={step} className="flex min-w-0 items-center">
              <button
                type="button"
                onClick={() => isClickable && onStepClick(step)}
                disabled={!isClickable}
                className={cn(
                  "flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1.5 transition sm:gap-1 sm:px-3 md:px-4",
                  isClickable && "cursor-pointer hover:bg-accent",
                  !isClickable && "cursor-default",
                )}
                aria-current={isActive ? "step" : undefined}
                aria-label={BOOKING_STEP_LABELS[step]}
              >
                <div
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors sm:h-8 sm:w-8 sm:text-sm",
                    isCompleted && "border-primary bg-primary text-primary-foreground",
                    isActive && "border-primary bg-background text-primary shadow-[var(--ui-shadow-sm)]",
                    !isCompleted && !isActive && "border-border bg-card text-muted-foreground",
                  )}
                >
                  {isCompleted ? <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={3} /> : step}
                </div>
                <span
                  className={cn(
                    "hidden text-xs font-medium sm:block",
                    isActive && "text-primary",
                    isCompleted && "text-foreground",
                    !isCompleted && !isActive && "text-muted-foreground",
                  )}
                >
                  {BOOKING_STEP_LABELS[step]}
                </span>
              </button>

              {index < STEPS.length - 1 && (
                <div
                  className={cn(
                    "h-0.5 w-3 shrink-0 rounded-full sm:w-8 md:w-12",
                    step < currentStep ? "bg-primary" : "bg-border",
                  )}
                  aria-hidden
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
