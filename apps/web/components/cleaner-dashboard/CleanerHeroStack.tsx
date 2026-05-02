import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CleanerHeroMotion } from "./CleanerHeroMotion";

/** Sticky “work console” — single control surface for availability, next job, and earnings. */
export function CleanerHeroStack({ children }: { children: ReactNode }) {
  return (
    <div className="sticky top-0 z-30 -mx-4 border-b border-border/70 bg-background/95 px-4 pb-3 pt-1 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-background/85">
      <div className="mx-auto max-w-lg">
        <div
          className={cn(
            "overflow-hidden rounded-2xl border border-border/80 bg-card/95 shadow-sm ring-1 ring-black/[0.04] dark:bg-card/90 dark:ring-white/[0.06]",
            "transition-[box-shadow,background-color] duration-200 ease-out",
          )}
        >
          <CleanerHeroMotion className="flex flex-col divide-y divide-border/70">{children}</CleanerHeroMotion>
        </div>
      </div>
    </div>
  );
}
