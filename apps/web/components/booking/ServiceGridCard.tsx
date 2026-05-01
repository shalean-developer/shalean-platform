"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type ServiceGridCardProps = {
  id: string;
  name: string;
  description: string;
  Icon: LucideIcon;
  selected: boolean;
  disabled?: boolean;
  onSelect: (id: string) => void;
};

/** Compact horizontal service tile for `ServiceGrid` (checkout funnel). */
export function ServiceGridCard({
  id,
  name,
  description,
  Icon,
  selected,
  disabled = false,
  onSelect,
}: ServiceGridCardProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(id)}
      aria-pressed={selected}
      aria-disabled={disabled}
      aria-label={`${name}. ${description}`}
      className={cn(
        "flex h-full min-h-[5.5rem] w-full flex-col cursor-pointer rounded-xl border border-gray-200 bg-white p-4 text-left transition-all",
        "hover:border-blue-500 hover:shadow-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-gray-200 disabled:hover:shadow-none",
        selected
          ? "border-blue-600 bg-blue-50 shadow-sm dark:border-blue-600 dark:bg-blue-950/35"
          : "dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-blue-500",
      )}
    >
      <div className="mb-2 flex items-center gap-3">
        <div className="shrink-0 rounded-lg bg-blue-50 p-2 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
          <Icon size={18} className="shrink-0" aria-hidden />
        </div>
        <p className="min-w-0 font-semibold text-gray-900 dark:text-zinc-50">{name}</p>
      </div>
      <p className="text-sm leading-snug text-gray-500 dark:text-zinc-400">{description}</p>
    </button>
  );
}
