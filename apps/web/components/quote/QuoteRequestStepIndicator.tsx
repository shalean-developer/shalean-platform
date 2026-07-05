"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type QuoteStep = 1 | 2 | 3;

const STEP_LABELS: Record<QuoteStep, string> = {
  1: "Service",
  2: "Property",
  3: "Details",
};

const STEPS: QuoteStep[] = [1, 2, 3];

type Props = {
  currentStep: QuoteStep;
  onStepClick?: (step: QuoteStep) => void;
};

export function QuoteRequestStepIndicator({ currentStep, onStepClick }: Props) {
  return (
    <nav aria-label="Quote request progress" className="w-full">
      <ol className="flex items-center justify-center gap-0">
        {STEPS.map((step, index) => {
          const isCompleted = step < currentStep;
          const isActive = step === currentStep;
          const isClickable = onStepClick && step < currentStep;

          return (
            <li key={step} className="flex items-center">
              <button
                type="button"
                onClick={() => isClickable && onStepClick(step)}
                disabled={!isClickable}
                className={cn(
                  "flex flex-col items-center gap-1 px-3 sm:px-5",
                  isClickable && "cursor-pointer",
                  !isClickable && "cursor-default",
                )}
                aria-current={isActive ? "step" : undefined}
              >
                <div
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-bold transition-colors",
                    isCompleted && "border-blue-600 bg-blue-600 text-white",
                    isActive && "border-blue-600 bg-white text-blue-600",
                    !isCompleted && !isActive && "border-slate-200 bg-white text-slate-400",
                  )}
                >
                  {isCompleted ? <Check className="h-4 w-4" strokeWidth={3} /> : step}
                </div>
                <span
                  className={cn(
                    "hidden text-xs font-medium sm:block",
                    isActive && "text-blue-600",
                    isCompleted && "text-slate-600",
                    !isCompleted && !isActive && "text-slate-400",
                  )}
                >
                  {STEP_LABELS[step]}
                </span>
              </button>

              {index < STEPS.length - 1 ? (
                <div
                  className={cn(
                    "h-px w-8 sm:w-14",
                    step < currentStep ? "bg-blue-600" : "bg-slate-200",
                  )}
                  aria-hidden
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
