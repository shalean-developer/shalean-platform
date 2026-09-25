type SnapshotInput = {
  data: { serviceSlug: string; serviceDetails: Record<string, unknown>; address: string; suburb: string; city: string; date: string; time: string; cleanerMode: string; cleanerCount: number; assignedTeamId?: string | null; equipmentRequired?: string | null; recurringFrequency?: string | null; recurringDays?: string[] | null };
  selectedExtraIds: string[];
  serverEquipmentQuote: unknown;
  serverBreakdown: unknown;
  customerPhone: string | null;
  customerName: string;
  customerEmailNormalized: string | null;
  referralCheckoutSnapshot?: unknown;
  promotionApplied: unknown[];
  promotionDiscountZar: number;
  promoCodeInput: string;
  payAmountZar: number;
  recurringPrepaymentQuote?: { coverageStartDate: string; coverageEndDate: string; occurrenceDates: string[]; visitCount: number; perVisitZar: number } | null;
  fulfillmentMode: string;
  fulfillmentReason: string;
  preferredExtrasSnapshotExtension: Record<string, unknown>;
  confirmedAt: string;
};

/** Canonical immutable booking-history snapshot used by both insert and pending-payment retry paths. */
export function buildBookingV2HistorySnapshot(input: SnapshotInput): Record<string, unknown> {
  const { data } = input;
  return {
    serviceSlug: data.serviceSlug,
    serviceDetails: data.serviceDetails,
    address: data.address,
    suburb: data.suburb,
    city: data.city,
    date: data.date,
    time: data.time,
    cleanerMode: data.cleanerMode,
    cleanerCount: data.cleanerCount,
    assignedTeamId: data.assignedTeamId,
    selectedExtras: input.selectedExtraIds,
    equipmentRequired: data.equipmentRequired,
    equipmentQuote: input.serverEquipmentQuote,
    pricingSummary: input.serverBreakdown,
    contactPhone: input.customerPhone,
    customer: { name: input.customerName || null, email: input.customerEmailNormalized, phone: input.customerPhone },
    ...(data.recurringFrequency ? { recurringFrequency: data.recurringFrequency, recurringDays: data.recurringDays?.length ? data.recurringDays : [] } : {}),
    ...(input.referralCheckoutSnapshot ? { referralCheckout: input.referralCheckoutSnapshot } : {}),
    ...(input.promotionApplied.length ? { promotionCheckout: { applied: input.promotionApplied, totalDiscountZar: input.promotionDiscountZar, promoCode: input.promoCodeInput || null } } : {}),
    payTotalZar: input.payAmountZar,
    ...(input.recurringPrepaymentQuote ? { recurringPrepayment: { scope: "first_30_days", coverageStartDate: input.recurringPrepaymentQuote.coverageStartDate, coverageEndDate: input.recurringPrepaymentQuote.coverageEndDate, occurrenceDates: input.recurringPrepaymentQuote.occurrenceDates, visitCount: input.recurringPrepaymentQuote.visitCount, perVisitZar: input.recurringPrepaymentQuote.perVisitZar, packagePayableZar: input.payAmountZar } } : {}),
    fulfillmentMode: input.fulfillmentMode,
    fulfillmentReason: input.fulfillmentReason,
    ...input.preferredExtrasSnapshotExtension,
    confirmedAt: input.confirmedAt,
  };
}
