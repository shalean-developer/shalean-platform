import { formatCurrency } from "@/lib/admin/invoices/invoiceAdminFormatters";
import type { AdjustmentCategory } from "@/lib/monthlyInvoice/adjustmentCategory";
import { adjustmentCategoryLabel, parseAdjustmentCategory } from "@/lib/monthlyInvoice/adjustmentCategory";

export type AdjustmentCategoryTotals = Record<AdjustmentCategory, number>;

const ZERO: AdjustmentCategoryTotals = {
  discount: 0,
  missed_visit: 0,
  extra_service: 0,
  other: 0,
};

/** Sum signed `amount_cents` per adjustment category for applied invoice lines. */
export function sumAdjustmentAmountsByCategory(adjustments: Record<string, unknown>[]): AdjustmentCategoryTotals {
  const out = { ...ZERO };
  for (const row of adjustments) {
    const raw = Math.round(Number(row.amount_cents ?? 0));
    if (!Number.isFinite(raw)) continue;
    const cat = parseAdjustmentCategory(row.category);
    out[cat] += raw;
  }
  return out;
}

export function categoryAggregateSummaryLines(
  totals: AdjustmentCategoryTotals,
  currencyCode: string,
): { label: string; text: string; cents: number; percentOfActivity: number }[] {
  const pairs: [AdjustmentCategory, string][] = [
    ["discount", "Discounts"],
    ["missed_visit", "Missed visits"],
    ["extra_service", "Extras"],
    ["other", adjustmentCategoryLabel("other")],
  ];
  let sumAbs = 0;
  for (const [cat] of pairs) {
    sumAbs += Math.abs(totals[cat]);
  }

  const lines: { label: string; text: string; cents: number; percentOfActivity: number }[] = [];
  for (const [cat, title] of pairs) {
    const cents = totals[cat];
    if (!cents) continue;
    const percentOfActivity = sumAbs > 0 ? Math.min(100, Math.round((Math.abs(cents) / sumAbs) * 100)) : 0;
    lines.push({
      label: title,
      text: `${title}: ${formatCurrency(cents, currencyCode)} (${percentOfActivity}% of adjustment activity)`,
      cents,
      percentOfActivity,
    });
  }
  return lines;
}
