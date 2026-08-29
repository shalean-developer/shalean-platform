"use client";

import { cn } from "@/lib/utils";
import type { CustomerPricingBreakdown, PricingLineItem } from "@/lib/booking-v2/types";
import { normalizePricingSummary } from "@/lib/booking-v2/types";

function formatZar(amountZar: number): string {
  const prefix = amountZar < 0 ? "-R" : "R";
  return `${prefix}${Math.abs(amountZar).toLocaleString("en-ZA")}`;
}

type CustomerPriceBreakdownProps = {
  pricing: CustomerPricingBreakdown | PricingLineItem[] | null | undefined;
  className?: string;
  showTotal?: boolean;
  totalLabel?: string;
  compact?: boolean;
  groupEquipmentBreakdown?: boolean;
};

type EquipmentLineRole = "detail" | "subtotal" | "standard";

function getEquipmentLineRole(
  item: PricingLineItem,
  groupEquipmentBreakdown: boolean,
): EquipmentLineRole {
  if (!groupEquipmentBreakdown) return "standard";

  const label = item.label.toLowerCase();
  if (label.includes("equipment base") || label.includes("distance charge")) {
    return "detail";
  }
  if (label.includes("equipment logistics")) {
    return "subtotal";
  }
  return "standard";
}

export function CustomerPriceBreakdown({
  pricing,
  className,
  showTotal = false,
  totalLabel = "Estimated total",
  compact = false,
  groupEquipmentBreakdown = false,
}: CustomerPriceBreakdownProps) {
  const breakdown = pricing
    ? Array.isArray(pricing)
      ? { lineItems: pricing, estimated_total: pricing.reduce((s, l) => s + l.amountZar, 0) }
      : normalizePricingSummary(pricing)
    : null;

  if (!breakdown || breakdown.lineItems.length === 0) {
    return null;
  }

  const visibleLines = breakdown.lineItems.filter((item) => item.amountZar !== 0);

  if (visibleLines.length === 0) return null;

  return (
    <div className={cn("space-y-1.5", className)}>
      <ul className={cn("space-y-1.5", compact && "space-y-1")}>
        {visibleLines.map((item, i) => {
          const equipmentRole = getEquipmentLineRole(item, groupEquipmentBreakdown);
          return (
            <li
              key={`${item.label}-${i}`}
              className={cn(
                "flex items-center justify-between gap-2 text-slate-600",
                compact ? "text-xs" : "text-sm",
                item.amountZar < 0 && "text-emerald-700",
                equipmentRole === "detail" && "pl-4 text-slate-500",
                equipmentRole === "subtotal" &&
                  "mt-2 border-t border-dashed border-slate-200 pt-2 font-semibold text-slate-700",
              )}
            >
              <span className="min-w-0 truncate">
                {equipmentRole === "subtotal" ? "Equipment subtotal" : item.label}
              </span>
              <span
                className={cn(
                  "shrink-0 tabular-nums font-medium",
                  item.amountZar < 0 && "text-emerald-700",
                  equipmentRole === "subtotal" && "font-semibold text-slate-800",
                )}
              >
                {formatZar(item.amountZar)}
              </span>
            </li>
          );
        })}
      </ul>
      {showTotal ? (
        <div
          className={cn(
            "flex items-center justify-between gap-2 border-t border-slate-100 pt-2 font-bold text-slate-900",
            compact ? "text-sm" : "text-base",
          )}
        >
          <span>{totalLabel}</span>
          <span className="text-blue-600 tabular-nums">
            R{breakdown.estimated_total.toLocaleString("en-ZA")}
          </span>
        </div>
      ) : null}
    </div>
  );
}

export function SelectedExtrasList({
  extras,
  className,
}: {
  extras: CustomerPricingBreakdown["selected_extras"];
  className?: string;
}) {
  if (!extras.length) return null;
  return (
    <ul className={cn("space-y-2", className)}>
      {extras.map((extra) => (
        <li key={extra.extra_id} className="flex items-center justify-between gap-2 text-sm">
          <span className="min-w-0 text-slate-700">{extra.name}</span>
          <span className="font-semibold text-slate-900 tabular-nums">
            +R{extra.total.toLocaleString("en-ZA")}
          </span>
        </li>
      ))}
    </ul>
  );
}
