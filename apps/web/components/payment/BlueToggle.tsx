"use client";

import { cn } from "@/lib/utils";

type BlueToggleProps = {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
  "aria-label"?: string;
};

export function BlueToggle({ checked, onCheckedChange, disabled, "aria-label": ariaLabel }: BlueToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => !disabled && onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-40 dark:focus-visible:ring-offset-zinc-950",
        checked ? "bg-blue-600" : "bg-gray-200 dark:bg-zinc-600",
      )}
    >
      <span
        className={cn(
          "pointer-events-none absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-200 dark:bg-zinc-100",
          checked ? "translate-x-[1.375rem]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}
