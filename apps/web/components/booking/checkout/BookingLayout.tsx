"use client";

import { BookingCheckoutSidebarStickyPanel } from "@/components/booking/checkout/BookingCheckoutSidebarStickyPanel";
import { BookingCheckoutTrustFooter } from "@/components/booking/checkout/BookingCheckoutTrustFooter";
import { ProgressBar } from "@/components/booking/ProgressBar";
import { cn } from "@/lib/utils";

export type BookingLayoutProps = {
  stepCurrent: number;
  stepTotal: number;
  /** When false, hides the inline “Step X of Y” + progress bar (e.g. when `BookingCheckoutHeader` is used). */
  showTopProgress?: boolean;
  /** Step heading + body (wrap with motion in parent when desired) */
  main: React.ReactNode;
  /** Desktop sticky quote column */
  summary: React.ReactNode;
  /** Back / Continue row — desktop only; mobile uses `MobileBottomBar` checkout dock */
  desktopFooter?: React.ReactNode;
  className?: string;
  /**
   * When true (mobile step nav + fixed bottom chrome), trust footer sticks above that stack.
   * When false (e.g. payment), footer sticks flush to the viewport bottom on small screens.
   */
  trustFooterClearMobileDock?: boolean;
};

/**
 * Grid layout (`1fr` + `360px`) with inner `sticky top-24` quote column — no fixed positioning.
 * Avoid `overflow-*` / forced viewport heights on ancestors so `position: sticky` can use the document scrollport.
 */
export function BookingLayout({
  stepCurrent,
  stepTotal,
  showTopProgress = true,
  main,
  summary,
  desktopFooter,
  className,
  trustFooterClearMobileDock = false,
}: BookingLayoutProps) {
  return (
    <div className={cn("bg-zinc-50 dark:bg-zinc-950", className)}>
      <div className="mx-auto max-w-6xl px-6 py-8">
        {showTopProgress ? (
          <header className="mb-8 border-b border-gray-100 pb-6 dark:border-zinc-800">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-zinc-400">
              Step {stepCurrent} of {stepTotal}
            </p>
            <div className="mx-auto mt-3 w-full max-w-[576px]">
              <ProgressBar step={stepCurrent} totalSteps={stepTotal} />
            </div>
          </header>
        ) : (
          <div className="mb-6 h-2 shrink-0 sm:h-3" aria-hidden />
        )}

        {/* Full-width first grid cell + inner max-width keeps row height = main content height so
            the aside can stretch with the row; otherwise `mx-auto` on the grid item can shrink the
            row to the short column and `position: sticky` on the summary scrolls away. */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-stretch">
          <div className="flex min-w-0 justify-center">
            <div className="w-full min-w-0 max-w-[576px]">
              {main}
              {desktopFooter ? <div className="hidden lg:block">{desktopFooter}</div> : null}
            </div>
          </div>

          <aside className="relative hidden min-w-0 self-stretch lg:block" aria-label="Quote summary">
            <BookingCheckoutSidebarStickyPanel>{summary}</BookingCheckoutSidebarStickyPanel>
          </aside>
        </div>
      </div>

      <BookingCheckoutTrustFooter clearMobileDock={trustFooterClearMobileDock} />
    </div>
  );
}
