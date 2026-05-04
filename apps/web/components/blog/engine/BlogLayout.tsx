import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  main: ReactNode;
  sidebar: ReactNode;
  className?: string;
};

/**
 * SweepSouth-style 2-column shell: main (2/3) + sidebar (1/3).
 * On mobile, sidebar stacks below content (`order-2`).
 */
export function BlogLayout({ main, sidebar, className }: Props) {
  return (
    <div className={cn("mx-auto max-w-7xl px-4 sm:px-6 lg:px-8", className)}>
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 lg:gap-12">
        <div className="order-1 min-w-0 lg:col-span-2">{main}</div>
        <div className="order-2 min-w-0 lg:col-span-1">{sidebar}</div>
      </div>
    </div>
  );
}
