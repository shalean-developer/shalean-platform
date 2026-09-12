import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type OfficeZohoStatusTone = "positive" | "info" | "warn" | "danger" | "neutral";

const TONE_CLASS: Record<OfficeZohoStatusTone, string> = {
  positive: "bg-emerald-50 text-emerald-700",
  info: "bg-blue-50 text-blue-700",
  warn: "bg-amber-50 text-amber-700",
  danger: "bg-red-50 text-red-700",
  neutral: "bg-slate-100 text-slate-600",
};

export function OfficeZohoStatusBadge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: OfficeZohoStatusTone;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex rounded-full px-2 py-1 text-xs font-semibold", TONE_CLASS[tone], className)}>
      {children}
    </span>
  );
}
