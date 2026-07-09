import "server-only";

import type { ZohoLineItem } from "@/lib/zoho/types";

type BookingPromoSnapshot = {
  service?: string | null;
  totalPaidZar: number;
  bookingSnapshot?: unknown;
};

function readPricingTotalFromSnapshot(snapshot: unknown): number | null {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  const pricing = (snapshot as { pricingSummary?: unknown }).pricingSummary;
  if (!pricing || typeof pricing !== "object") return null;
  const row = pricing as { estimated_total?: number; total?: number };
  const total = Number(row.estimated_total ?? row.total ?? 0);
  return Number.isFinite(total) && total > 0 ? Math.round(total) : null;
}

function readReferralDiscountFromSnapshot(snapshot: unknown): number {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return 0;
  const ref = (snapshot as { referralCheckout?: { discountZar?: number } }).referralCheckout;
  return Math.max(0, Math.round(Number(ref?.discountZar ?? 0)));
}

/** Build Zoho invoice line items showing gross service + promo deductions for accounting clarity. */
export function buildZohoLineItemsWithReferralPromos(params: BookingPromoSnapshot): ZohoLineItem[] {
  const serviceName = params.service?.trim() || "Shalean Cleaning Service";
  const grossZar = readPricingTotalFromSnapshot(params.bookingSnapshot) ?? params.totalPaidZar;
  const referralDiscount = readReferralDiscountFromSnapshot(params.bookingSnapshot);
  const netPaid = Math.max(0, Math.round(params.totalPaidZar));

  const items: ZohoLineItem[] = [
    {
      name: serviceName,
      description: "Cleaning service (pre-promo)",
      rate: grossZar,
      quantity: 1,
    },
  ];

  if (referralDiscount > 0) {
    items.push({
      name: "Referral discount",
      description: "First-booking referral programme discount",
      rate: -Math.min(referralDiscount, grossZar),
      quantity: 1,
    });
  }

  const creditApplied = Math.max(0, grossZar - referralDiscount - netPaid);
  if (creditApplied > 0) {
    items.push({
      name: "Cleaning credit applied",
      description: "Referral reward wallet credit",
      rate: -creditApplied,
      quantity: 1,
    });
  }

  if (items.length === 1 && grossZar !== netPaid) {
    return [{ name: serviceName, rate: netPaid, quantity: 1 }];
  }

  return items;
}
