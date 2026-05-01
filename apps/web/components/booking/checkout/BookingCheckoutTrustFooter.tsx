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
        "sticky z-20 w-full shrink-0 border-t border-gray-200 bg-white/95 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/95",
        clearMobileDock ? "max-lg:bottom-[13.5rem] lg:bottom-0" : "bottom-0",
        className,
      )}
      aria-label="Shalean service guarantees"
    >
      <div
        className={cn(
          "flex items-center justify-center gap-x-4 gap-y-1 px-3 py-2.5 text-center text-[11px] font-medium text-gray-600 dark:text-zinc-400 lg:hidden",
        )}
      >
        <span className="whitespace-nowrap">
          <span aria-hidden className="text-blue-600 dark:text-blue-400">
            ✔
          </span>{" "}
          Secure payment
        </span>
        <span className="whitespace-nowrap">
          <span aria-hidden className="text-blue-600 dark:text-blue-400">
            ✔
          </span>{" "}
          Vetted cleaners
        </span>
        <span className="whitespace-nowrap">
          <span aria-hidden className="text-blue-600 dark:text-blue-400">
            ✔
          </span>{" "}
          Guarantee
        </span>
      </div>

      <div className="hidden h-[60px] w-full items-center justify-center px-4 lg:flex">
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
      </div>
    </footer>
  );
}
