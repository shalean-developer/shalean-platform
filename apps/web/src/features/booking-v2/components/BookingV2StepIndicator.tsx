"use client";

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
      <ol className="relative mx-auto grid w-full max-w-2xl grid-cols-4">
        <li
          className="pointer-events-none absolute left-[12.5%] right-[12.5%] top-4 h-px bg-border sm:top-5"
          aria-hidden
        />
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
                  "flex min-w-0 flex-col items-center gap-1 bg-transparent px-1 transition sm:gap-1.5 sm:px-3",
                  isClickable && "cursor-pointer hover:bg-accent",
                  !isClickable && "cursor-default",
                )}
                aria-current={isActive ? "step" : undefined}
                aria-label={BOOKING_STEP_LABELS[step]}
              >
                <div
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors sm:h-10 sm:w-10 sm:text-base",
                    isCompleted && "bg-slate-200 text-slate-900",
                    isActive && "bg-primary text-primary-foreground",
                    !isCompleted && !isActive && "bg-slate-200 text-slate-700",
                  )}
                >
                  {step}
                </div>
                <span
                  className={cn(
                    "truncate text-[10px] font-medium leading-tight sm:text-sm",
                    isActive && "text-foreground",
                    isCompleted && "text-foreground",
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
