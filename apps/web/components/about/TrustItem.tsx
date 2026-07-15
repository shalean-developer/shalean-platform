import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  children: ReactNode;
  icon?: LucideIcon;
  className?: string;
};

/** Compact trust bullet — default check icon for hero lists. */
export function TrustItem({ children, icon: Icon = Check, className }: Props) {
  return (
    <li className={cn("flex items-start gap-3 text-sm font-medium text-zinc-800 sm:text-base", className)}>
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-800">
        <Icon className="size-3.5" strokeWidth={2.5} aria-hidden />
      </span>
      <span>{children}</span>
    </li>
  );
}
