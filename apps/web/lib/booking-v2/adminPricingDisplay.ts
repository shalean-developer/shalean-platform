import type { StoredPriceLine } from "@/lib/dashboard/storedPriceBreakdown";
import { normalizePricingSummary } from "@/lib/booking-v2/types";
import { formatEstimatedCleaningTimeLabel } from "@/lib/booking-v2/formatEstimatedCleaningTime";

export type AdminV2PricingLine = { label: string; value: string; emphasis?: boolean };

export function adminLinesFromPricingSummary(summary: unknown): AdminV2PricingLine[] | null {
  const breakdown = normalizePricingSummary(summary);
  if (!breakdown) return null;

  const lines: AdminV2PricingLine[] = [
    { label: "Base service", value: `R ${breakdown.base_service_price.toLocaleString("en-ZA")}` },
  ];

  if (breakdown.property_factors_total > 0) {
    lines.push({
      label: "Property factors",
      value: `R ${breakdown.property_factors_total.toLocaleString("en-ZA")}`,
    });
  }
  if (breakdown.selected_extras_total > 0) {
    lines.push({
      label: "Extras",
      value: `R ${breakdown.selected_extras_total.toLocaleString("en-ZA")}`,
    });
  }
  if (breakdown.equipment_logistics_fee > 0) {
    lines.push({
      label: "Equipment logistics fee",
      value: `R ${breakdown.equipment_logistics_fee.toLocaleString("en-ZA")}`,
    });
  } else if (breakdown.supplies_equipment_fee > 0) {
    lines.push({
      label: "Supplies & equipment",
      value: `R ${breakdown.supplies_equipment_fee.toLocaleString("en-ZA")}`,
    });
  }
  if (breakdown.extra_cleaner_cost > 0) {
    lines.push({
      label: "Extra cleaner cost",
      value: `R ${breakdown.extra_cleaner_cost.toLocaleString("en-ZA")}`,
    });
  }
  if (breakdown.service_fee > 0) {
    lines.push({
      label: "Service fee",
      value: `R ${breakdown.service_fee.toLocaleString("en-ZA")}`,
    });
  }
  if (breakdown.recurring_discount > 0) {
    lines.push({
      label: "Recurring discount",
      value: `-R ${breakdown.recurring_discount.toLocaleString("en-ZA")}`,
    });
  }

  lines.push({
    label: "Customer total",
    value: `R ${breakdown.estimated_total.toLocaleString("en-ZA")}`,
    emphasis: true,
  });

  if (breakdown.estimated_duration_minutes > 0) {
    lines.push({
      label: "Estimated cleaning time",
      value: formatEstimatedCleaningTimeLabel(breakdown.estimated_duration_minutes).replace(
        /^Estimated cleaning time:\s*/i,
        "",
      ),
    });
  }

  return lines;
}

export function customerPriceLinesFromPricingSummary(summary: unknown): StoredPriceLine[] | null {
  const breakdown = normalizePricingSummary(summary);
  if (!breakdown || breakdown.lineItems.length === 0) return null;
  return breakdown.lineItems.map((item) => ({
    kind: "job_combined" as const,
    label: item.label,
    amountZar: item.amountZar,
  }));
}
