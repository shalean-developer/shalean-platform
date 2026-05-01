"use client";

import { cn } from "@/lib/utils";

type BookingCheckoutTrustFooterProps = {
  className?: string;
};

export function BookingCheckoutTrustFooter({ className }: BookingCheckoutTrustFooterProps) {
  return (
    <footer
      className={cn(
        "sticky bottom-0 z-20 hidden w-full shrink-0 border-t border-gray-200 bg-white/95 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/95 lg:block",
        className,
      )}
      aria-label="Shalean service guarantees"
    >
      <div className="flex h-[60px] w-full items-center justify-center px-4">
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
