import "server-only";

import type { BookingLineItemInsert } from "@/lib/booking/bookingLineItemTypes";
import { buildExactSourceLineItems } from "@/lib/booking/buildBookingLineItems";

export const AUDIT_02A07_PRICING_SOURCE = "audit_02a07_snapshot_v1" as const;

type BuildInput = {
  bookingId: string;
  declaredTotalCents: number;
  bookingSnapshot?: unknown;
  pricingSummary?: unknown;
  priceBreakdown?: unknown;
  isTeamJob?: boolean | null;
  suppressCleanerEarnings?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function summaryFromInput(input: BuildInput): Record<string, unknown> | null {
  if (isRecord(input.bookingSnapshot) && isRecord(input.bookingSnapshot.pricingSummary)) {
    return input.bookingSnapshot.pricingSummary;
  }
  return isRecord(input.pricingSummary) ? input.pricingSummary : null;
}

function companyOnlyLabel(label: string): boolean {
  return /service fee|discount|credit|tip|equipment|supplies/i.test(label);
}

export function buildAudit02A07BookingLineItems(
  input: BuildInput,
): { ok: true; items: BookingLineItemInsert[]; evidenceKind: string } | { ok: false; error: string } {
  const declaredTotalCents = Math.max(0, Math.round(input.declaredTotalCents));
  const summary = summaryFromInput(input);

  let sourceLines: { name: string; quantity: number; unitPriceCents: number }[] = [];
  let evidenceKind = "pricing_summary_lines";

  if (summary && Array.isArray(summary.lineItems)) {
    sourceLines = summary.lineItems.flatMap((raw) => {
      if (!isRecord(raw)) return [];
      const label = typeof raw.label === "string" ? raw.label.trim() : "";
      const amountZar = finiteNumber(raw.amountZar);
      if (!label || amountZar == null) return [];
      return [{ name: label, quantity: 1, unitPriceCents: Math.round(amountZar * 100) }];
    });
  }

  if (sourceLines.length === 0 && isRecord(input.priceBreakdown)) {
    const baseZar = finiteNumber(input.priceBreakdown.base_zar);
    const extrasZar = finiteNumber(input.priceBreakdown.extras_zar);
    const discountZar = finiteNumber(input.priceBreakdown.discount_zar);
    if (baseZar != null || extrasZar != null || discountZar != null) {
      evidenceKind = "incident_recovery_breakdown";
      if ((baseZar ?? 0) !== 0) {
        sourceLines.push({ name: "Recovered service subtotal", quantity: 1, unitPriceCents: Math.round((baseZar ?? 0) * 100) });
      }
      if ((extrasZar ?? 0) !== 0) {
        sourceLines.push({ name: "Recovered extras subtotal", quantity: 1, unitPriceCents: Math.round((extrasZar ?? 0) * 100) });
      }
      if ((discountZar ?? 0) !== 0) {
        sourceLines.push({ name: "Recovered promotion discount", quantity: 1, unitPriceCents: -Math.round((discountZar ?? 0) * 100) });
      }
    }
  }

  if (sourceLines.length === 0) {
    return { ok: false, error: `${input.bookingId}: no immutable line-item evidence` };
  }

  const built = buildExactSourceLineItems({
    declaredTotalCents,
    source: AUDIT_02A07_PRICING_SOURCE,
    lines: sourceLines,
  }).map((item) => {
    const isAdjustment = item.item_type === "adjustment";
    const isCompanyOnly = companyOnlyLabel(item.name);
    return {
      ...item,
      pricing_source: AUDIT_02A07_PRICING_SOURCE,
      earns_cleaner:
        input.suppressCleanerEarnings === true || input.isTeamJob === true
          ? false
          : !(isAdjustment || isCompanyOnly),
      metadata: {
        ...(item.metadata ?? {}),
        audit: "AUDIT-02A07",
        evidenceKind,
        bookingId: input.bookingId,
      },
    };
  });

  const sum = built.reduce((total, item) => total + item.total_price_cents, 0);
  if (sum !== declaredTotalCents) {
    return { ok: false, error: `${input.bookingId}: reconstructed total ${sum} != declared ${declaredTotalCents}` };
  }

  return { ok: true, items: built, evidenceKind };
}
