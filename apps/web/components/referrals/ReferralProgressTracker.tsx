"use client";

import { Check, Circle, X } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { key: "invited", label: "Invited" },
  { key: "booked", label: "Friend booked" },
  { key: "rewarded", label: "Reward earned" },
] as const;

function stepState(status: string, stepKey: (typeof STEPS)[number]["key"]): "complete" | "active" | "upcoming" | "failed" {
  const s = status.toLowerCase();
  if (s === "cancelled") {
    if (stepKey === "invited") return "complete";
    if (stepKey === "booked") return "failed";
    return "upcoming";
  }
  if (s === "expired") {
    if (stepKey === "invited" || stepKey === "booked") return "complete";
    return "failed";
  }
  if (s === "rewarded" || s === "completed") {
    return "complete";
  }
  if (s === "pending") {
    if (stepKey === "invited") return "complete";
    if (stepKey === "booked") return "active";
    return "upcoming";
  }
  return "upcoming";
}

export function ReferralProgressTracker({ status }: { status: string }) {
  return (
    <ol className="flex items-center gap-1 sm:gap-2" aria-label="Referral progress">
      {STEPS.map((step, idx) => {
        const state = stepState(status, step.key);
        const isLast = idx === STEPS.length - 1;
        return (
          <li key={step.key} className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
            <div className="flex min-w-0 flex-col items-center gap-1">
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold",
                  state === "complete" && "border-emerald-500 bg-emerald-500 text-white",
                  state === "active" && "border-blue-500 bg-blue-50 text-blue-600",
                  state === "upcoming" && "border-gray-200 bg-white text-gray-400",
                  state === "failed" && "border-red-400 bg-red-50 text-red-600",
                )}
                aria-hidden
              >
                {state === "complete" ? (
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                ) : state === "failed" ? (
                  <X className="h-3.5 w-3.5" strokeWidth={3} />
                ) : (
                  <Circle className="h-2 w-2 fill-current" />
                )}
              </span>
              <span
                className={cn(
                  "max-w-[4.5rem] truncate text-center text-[10px] font-medium leading-tight sm:max-w-none sm:text-xs",
                  state === "complete" && "text-emerald-700",
                  state === "active" && "text-blue-700",
                  state === "upcoming" && "text-gray-400",
                  state === "failed" && "text-red-600",
                )}
              >
                {step.label}
              </span>
            </div>
            {!isLast ? (
              <div
                className={cn(
                  "mb-4 h-0.5 min-w-[8px] flex-1 rounded-full",
                  state === "complete" ? "bg-emerald-300" : "bg-gray-200",
                )}
                aria-hidden
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
