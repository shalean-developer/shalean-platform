import type { BookingFormData } from "@/lib/booking/types";
import {
  bookingV2ConfirmSchema,
  normalizeServiceDetails,
  type BookingV2ConfirmPayload,
} from "@/lib/booking/schemas";

export type BuildConfirmOptions = {
  applyCleaningCreditZar?: number;
  referralCode?: string | null;
  promoCode?: string | null;
};

/**
 * Build confirm body matching web bookingV2ConfirmSchema / Step4Payment shape.
 * Soft quote drift is OK — server recomputes; trust confirm response payAmountZar.
 */
export function buildConfirmPayload(
  form: BookingFormData,
  opts: BuildConfirmOptions = {},
): BookingV2ConfirmPayload {
  const pricing = form.pricingSummary;
  const raw = {
    serviceSlug: form.serviceSlug,
    serviceDetails: normalizeServiceDetails(form.serviceDetails),
    address: form.address.trim(),
    suburb: form.suburb.trim(),
    serviceAreaLocationId: form.serviceAreaLocationId ?? "",
    serviceAreaCityId: form.serviceAreaCityId ?? "",
    city: form.city?.trim() || "Cape Town",
    postalCode: form.postalCode?.trim() || "",
    accessInstructions: form.accessInstructions ?? "",
    parkingInstructions: form.parkingInstructions ?? "",
    gateCode: form.gateCode ?? "",
    contactPhone: form.contactPhone.trim(),
    selectedExtras: form.selectedExtras ?? [],
    equipmentRequired: form.equipmentRequired === "yes" ? "yes" : "no",
    equipmentQuote: form.equipmentQuote ?? null,
    bookingType: form.bookingType,
    date: form.date,
    time: form.time,
    alternativeDate: form.alternativeDate ?? "",
    alternativeTime: form.alternativeTime ?? "",
    recurringFrequency: form.recurringFrequency || "",
    recurringDays: form.recurringDays ?? [],
    recurringStartDate: form.recurringStartDate ?? "",
    recurringEndDate: form.recurringEndDate ?? "",
    cleanerMode: form.cleanerMode,
    assignedTeamId: form.assignedTeamId ?? "",
    assignedTeamName: form.assignedTeamName ?? "",
    cleanerCount: form.cleanerCount || 1,
    selectedCleanerIds: form.selectedCleanerIds ?? [],
    pricingSummary: {
      ...pricing,
      total: pricing.total ?? pricing.estimated_total ?? 0,
      estimated_total: pricing.estimated_total ?? pricing.total ?? 0,
    },
    applyCleaningCreditZar:
      opts.applyCleaningCreditZar && opts.applyCleaningCreditZar > 0
        ? opts.applyCleaningCreditZar
        : undefined,
    referralCode: opts.referralCode?.trim() || undefined,
    promoCode: opts.promoCode?.trim() || undefined,
  };

  return bookingV2ConfirmSchema.parse(raw);
}
