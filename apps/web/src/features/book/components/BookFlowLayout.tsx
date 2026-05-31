"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type BookFlowLayoutProps = {
  children?: ReactNode;
  onBack?: () => void;
  onContinue?: () => void;
  continueLabel?: string;
  continueDisabled?: boolean;
  continueBusy?: boolean;
  footer?: ReactNode;
};

export function BookFlowLayout({
  children,
  onBack,
  onContinue,
  continueLabel = "Continue",
  continueDisabled = false,
  continueBusy = false,
  footer,
}: BookFlowLayoutProps) {
  return (
    <div className="flex min-h-[420px] flex-col gap-6">
      <div className="flex-1">{children}</div>

      {footer ?? (
        <div
          className={cn(
            "sticky bottom-0 -mx-1 flex flex-col gap-3 border-t border-zinc-200 bg-zinc-50/95 pt-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95",
            "pb-[max(0.5rem,env(safe-area-inset-bottom))]",
          )}
        >
          {onContinue ? (
            <Button
              type="button"
              size="lg"
              disabled={continueDisabled || continueBusy}
              onClick={onContinue}
              className="h-12 w-full rounded-2xl text-base font-semibold"
            >
              {continueBusy ? "Please wait…" : continueLabel}
            </Button>
          ) : null}
          {onBack ? (
            <Button type="button" variant="ghost" onClick={onBack} className="w-full">
              Back
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
