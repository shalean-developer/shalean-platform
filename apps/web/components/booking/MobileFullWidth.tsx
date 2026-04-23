import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type MobileFullWidthProps = {
  children: ReactNode;
  className?: string;
  /**
   * Use when this wrapper sits **inside** `SectionCard` (`px-3 py-5 sm:p-6`).
   * Pulls children to the card’s inner horizontal edges on small screens only.
   */
  insideSectionCard?: boolean;
};

/**
 * Reclaims horizontal space on mobile by negating ancestor padding, then re-applies `px-4`
 * so content does not touch the screen edges. Desktop (`md+`) is unchanged.
 */
export function MobileFullWidth({ children, className, insideSectionCard }: MobileFullWidthProps) {
  return (
    <div
      className={cn(
        "min-w-0",
        insideSectionCard
          ? "-mx-3 px-3 sm:-mx-6 sm:px-6 md:mx-0 md:px-0"
          : "-mx-4 px-4 md:mx-0 md:px-0",
        className,
      )}
    >
      {children}
    </div>
  );
}
