import { ChevronDown } from "lucide-react";
import { forwardRef, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  /** Distinct styling for bedroom / bathroom / extra-room controls (booking flows). */
  variant?: "default" | "room";
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, id, label, variant = "default", children, ...props }, ref) => {
    const selectId = id ?? props.name;
    const isRoom = variant === "room";

    return (
      <div className="w-full space-y-1.5">
        {label ? (
          <label
            htmlFor={selectId}
            className={cn(
              "block",
              isRoom
                ? "text-xs font-semibold uppercase tracking-wide text-blue-900/85 dark:text-blue-200/90"
                : "text-sm font-medium text-zinc-800 dark:text-zinc-200",
            )}
          >
            {label}
          </label>
        ) : null}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            className={cn(
              "h-12 w-full appearance-none rounded-xl border px-3 pr-10 text-base shadow-sm transition-[border-color,box-shadow,background-color]",
              "focus-visible:border-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-blue-500",
              "disabled:cursor-not-allowed disabled:opacity-50",
              isRoom
                ? "cursor-pointer border-blue-200/80 bg-blue-50/40 text-zinc-900 hover:border-blue-400/70 hover:bg-blue-50/70 hover:shadow-md dark:border-blue-900/50 dark:bg-blue-950/25 dark:text-zinc-100 dark:hover:border-blue-600/55 dark:hover:bg-blue-950/40"
                : "border-zinc-200 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100",
              className,
            )}
            {...props}
          >
            {children}
          </select>
          <ChevronDown
            className={cn(
              "pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2",
              isRoom ? "text-blue-700 dark:text-blue-400/90" : "text-zinc-500 dark:text-zinc-400",
            )}
            aria-hidden
          />
        </div>
      </div>
    );
  },
);
Select.displayName = "Select";
