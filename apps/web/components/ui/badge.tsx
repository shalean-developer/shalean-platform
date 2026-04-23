import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type BadgeVariant = "default" | "success" | "warning" | "destructive" | "outline";

const variants: Record<BadgeVariant, string> = {
  default: "border-transparent bg-blue-600 text-white",
  success: "border-transparent bg-emerald-600 text-white",
  warning: "border-transparent bg-amber-500 text-amber-950",
  destructive: "border-transparent bg-red-600 text-white",
  outline: "border-zinc-300 bg-transparent text-zinc-800 dark:border-zinc-600 dark:text-zinc-100",
};

export function Badge({
  className,
  variant = "default",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
