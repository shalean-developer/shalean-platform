import { ChevronDown } from "lucide-react";
import { forwardRef, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  /** Distinct styling retained for existing booking room controls during migration. */
  variant?: "default" | "room";
};

/**
 * Canonical native Select for ordinary form choices.
 * FloatingSelect remains the specialised custom-listbox option where its current
 * booking/room interaction is explicitly required; do not replace those flows wholesale.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, id, label, variant = "default", children, ...props }, ref) => {
    const selectId = id ?? props.name;
    const isRoom = variant === "room";

    return (
      <div className="w-full space-y-[var(--ui-space-2)]">
        {label ? (
          <label
            htmlFor={selectId}
            className={cn(
              "block",
              isRoom
                ? "text-[length:var(--ui-text-caption)] font-semibold uppercase tracking-wide text-primary"
                : "text-[length:var(--ui-text-small)] font-medium text-foreground",
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
              "h-12 w-full appearance-none rounded-[var(--ui-radius-xl)] border px-[var(--ui-space-3)] pr-10 text-base shadow-[var(--ui-shadow-sm)] transition-[border-color,box-shadow,background-color]",
              "focus-visible:border-ring focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring",
              "disabled:cursor-not-allowed disabled:opacity-50",
              isRoom
                ? "cursor-pointer border-primary/20 bg-primary/5 text-foreground hover:border-primary/40 hover:bg-primary/10 hover:shadow-[var(--ui-shadow-md)]"
                : "border-input bg-background text-foreground",
              className,
            )}
            {...props}
          >
            {children}
          </select>
          <ChevronDown
            className={cn(
              "pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2",
              isRoom ? "text-primary" : "text-muted-foreground",
            )}
            aria-hidden
          />
        </div>
      </div>
    );
  },
);
Select.displayName = "Select";
