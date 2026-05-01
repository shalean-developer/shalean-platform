"use client";

import { cn } from "@/lib/utils";

type BookingCheckoutTrustFooterProps = {
  className?: string;
  /** Reserve space above fixed mobile quote + CTA (see {@link BookingCheckoutShell}). */
  clearMobileDock?: boolean;
};

export function BookingCheckoutTrustFooter({ className, clearMobileDock = false }: BookingCheckoutTrustFooterProps) {
  return (
    <footer
      className={cn(
        "sticky z-20 flex h-[60px] w-full shrink-0 items-center justify-center border-t border-gray-200 bg-white/95 px-4 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/95",
        clearMobileDock ? "max-lg:bottom-[13.5rem] lg:bottom-0" : "bottom-0",
        className,
      )}
      aria-label="Shalean service guarantees"
    >
      <ul className="flex max-w-6xl flex-wrap items-center justify-center gap-x-5 gap-y-1 text-center text-[11px] font-medium text-gray-600 sm:gap-x-8 sm:text-xs dark:text-zinc-400">
        <li className="flex items-center gap-1.5 whitespace-nowrap">
          <span aria-hidden className="text-blue-600 dark:text-blue-400">
            ✔
          </span>
          <span>Vetted cleaners</span>
        </li>
        <li className="flex items-center gap-1.5 whitespace-nowrap">
          <span aria-hidden className="text-blue-600 dark:text-blue-400">
            ✔
          </span>
          <span>Secure payment</span>
        </li>
        <li className="flex items-center gap-1.5 whitespace-nowrap">
          <span aria-hidden className="text-blue-600 dark:text-blue-400">
            ✔
          </span>
          <span>Satisfaction guarantee</span>
        </li>
      </ul>
    </footer>
  );
}
