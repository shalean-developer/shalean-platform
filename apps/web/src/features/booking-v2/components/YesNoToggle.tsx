"use client";

import { cn } from "@/lib/utils";

type YesNoToggleProps = {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
  "aria-label"?: string;
};

/** Pill switch with Yes/No labels — knob slides over the inactive side so text stays readable. */
export function YesNoToggle({
  checked,
  onCheckedChange,
  disabled,
  "aria-label": ariaLabel,
}: YesNoToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => !disabled && onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-8 w-[4.75rem] shrink-0 items-center rounded-full transition-colors duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-2",
        disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer",
        checked ? "bg-blue-600" : "bg-slate-200",
      )}
    >
      {/* Labels sit behind the knob in the open half of the track */}
      <span className="pointer-events-none absolute inset-0 z-0 flex items-center justify-between px-2.5">
        <span
          className={cn(
            "text-[11px] font-semibold leading-none transition-opacity duration-150",
            checked ? "text-white opacity-100" : "opacity-0",
          )}
        >
          Yes
        </span>
        <span
          className={cn(
            "text-[11px] font-semibold leading-none transition-opacity duration-150",
            checked ? "opacity-0" : "text-slate-600 opacity-100",
          )}
        >
          No
        </span>
      </span>
      <span
        className={cn(
          "pointer-events-none absolute top-1 z-10 h-6 w-6 rounded-full bg-white shadow-md transition-transform duration-200",
          checked ? "translate-x-[2.65rem]" : "translate-x-1",
        )}
      />
    </button>
  );
}
