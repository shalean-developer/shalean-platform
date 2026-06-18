import { cn } from "@/lib/utils";
import type { ComponentType } from "react";

interface StatCardProps {
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  iconBg: string;
  iconColor: string;
  value: string | number;
  label: string;
  sublabel?: string;
  /** Tighter padding and typography for sidebar stat grids. */
  compact?: boolean;
}

export function StatCard({ icon: Icon, iconBg, iconColor, value, label, sublabel, compact }: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-gray-100 bg-white shadow-sm",
        compact ? "p-2.5" : "p-4",
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center rounded-lg",
          compact ? "h-8 w-8" : "h-10 w-10",
          iconBg,
        )}
      >
        <Icon className={cn(compact ? "h-4 w-4" : "h-5 w-5", iconColor)} strokeWidth={1.75} />
      </div>
      <p
        className={cn(
          "font-bold tabular-nums text-gray-900",
          compact ? "mt-1.5 text-lg leading-tight" : "mt-3 text-2xl",
        )}
      >
        {value}
      </p>
      <p className={cn("font-medium text-gray-700", compact ? "mt-0.5 text-[11px] leading-tight" : "mt-0.5 text-xs")}>
        {label}
      </p>
      {sublabel ? (
        <p className={cn("text-gray-400", compact ? "text-[10px]" : "text-xs")}>{sublabel}</p>
      ) : null}
    </div>
  );
}
