import type { ZohoLineItem } from "@/lib/zoho/types";
import {
  adjustmentCategoryLabel,
  parseAdjustmentCategory,
  type AdjustmentCategory,
} from "@/lib/monthlyInvoice/adjustmentCategory";

export function bookingLineAmountCents(row: Record<string, unknown>): number {
  const zar = row.total_paid_zar;
  if (typeof zar === "number" && Number.isFinite(zar)) return Math.max(0, Math.round(zar * 100));
  const cents = row.amount_paid_cents;
  if (typeof cents === "number" && Number.isFinite(cents)) return Math.max(0, Math.round(cents));
  return 0;
}

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split("-").map((x) => Number(x));
  if (!y || !m) return ym;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-ZA", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function adjustmentLineName(category: AdjustmentCategory, reason: string): string {
  if (category !== "other") return adjustmentCategoryLabel(category);
  const trimmed = reason.trim();
  return trimmed || adjustmentCategoryLabel(category);
}

function singleMonthlyLineItem(month: string, balanceZar: number): ZohoLineItem[] {
  const monthLabel = formatMonthLabel(month);
  return [
    {
      name: `Shalean Cleaning — ${monthLabel}`,
      description: `Monthly cleaning invoice for ${monthLabel}`,
      rate: balanceZar,
      quantity: 1,
    },
  ];
}

/** Customer-visible Zoho lines: base monthly cleaning + one row per invoice adjustment. */
export function buildMonthlyInvoiceZohoLineItems(params: {
  month: string;
  bookingsSumCents: number;
  adjustments: Record<string, unknown>[];
  totalAmountCents: number;
}): ZohoLineItem[] {
  const adjustments = params.adjustments.filter((row) => {
    const cents = Math.round(Number(row.amount_cents ?? 0));
    return Number.isFinite(cents) && cents !== 0;
  });

  if (adjustments.length === 0) {
    return singleMonthlyLineItem(params.month, Math.max(0, params.totalAmountCents) / 100);
  }

  const monthLabel = formatMonthLabel(params.month);
  const lines: ZohoLineItem[] = [
    {
      name: `Shalean Cleaning — ${monthLabel}`,
      description: `Monthly cleaning invoice for ${monthLabel}`,
      rate: Math.max(0, Math.round(params.bookingsSumCents)) / 100,
      quantity: 1,
    },
  ];

  for (const row of adjustments) {
    const cents = Math.round(Number(row.amount_cents ?? 0));
    const category = parseAdjustmentCategory(row.category);
    const reason = String(row.reason ?? "").trim();
    lines.push({
      name: adjustmentLineName(category, reason),
      description: reason || adjustmentCategoryLabel(category),
      rate: cents / 100,
      quantity: 1,
    });
  }

  const builtCents = Math.round(lines.reduce((sum, line) => sum + line.rate * line.quantity, 0) * 100);
  const expectedCents = Math.max(0, Math.round(params.totalAmountCents));
  if (Math.abs(builtCents - expectedCents) > 1) {
    return singleMonthlyLineItem(params.month, expectedCents / 100);
  }

  return lines;
}
