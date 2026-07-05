import type { BookingServiceId } from "@/components/booking/serviceCategories";
import { canonicalizeBookingServiceSlug } from "@/lib/booking/canonicalizeBookingServiceSlug";
import type { SalesDocumentLineItem, SalesDocumentQuoteRequestDetails } from "@/lib/salesDocument/types";

/** Most specialised first — admin quotes often bundle room lines plus one service header line. */
const LINE_ITEM_SERVICE_HINTS: ReadonlyArray<{ slug: BookingServiceId; pattern: RegExp }> = [
  { slug: "move", pattern: /\bmove[\s-]*(in|out|clean)/i },
  { slug: "deep", pattern: /\bdeep[\s-]*clean/i },
  { slug: "carpet", pattern: /\bcarpet[\s-]*clean/i },
  { slug: "airbnb", pattern: /\bairbnb|\bair[\s-]*bnb/i },
];

export function inferServiceSlugFromLineItemDescriptions(
  descriptions: readonly string[],
): BookingServiceId | null {
  const text = descriptions.map((d) => String(d ?? "").trim()).filter(Boolean).join(" ");
  if (!text) return null;
  for (const { slug, pattern } of LINE_ITEM_SERVICE_HINTS) {
    if (pattern.test(text)) return slug;
  }
  return null;
}

export function resolveServiceSlugFromQuoteRequestDetails(
  requestDetails: SalesDocumentQuoteRequestDetails | null | undefined,
): BookingServiceId | null {
  if (!requestDetails) return null;
  const service = (requestDetails.selected_items ?? []).find((i) => i.kind === "service");
  if (service?.slug?.trim()) return canonicalizeBookingServiceSlug(service.slug);
  const legacy = String(requestDetails.service_type ?? "").trim();
  if (legacy) return canonicalizeBookingServiceSlug(legacy);
  return null;
}

/**
 * Service slug for bookings spawned from sales quotes/invoices.
 * Customer requests use `request_details.selected_items`; admin quotes fall back to line-item text.
 */
export function resolveSalesDocumentBookingServiceSlug(input: {
  requestDetails?: SalesDocumentQuoteRequestDetails | null;
  lineItems?: readonly SalesDocumentLineItem[] | null;
}): BookingServiceId {
  const fromRequest = resolveServiceSlugFromQuoteRequestDetails(input.requestDetails ?? null);
  if (fromRequest) return fromRequest;

  const fromLines = inferServiceSlugFromLineItemDescriptions(
    (input.lineItems ?? []).map((li) => li.description),
  );
  if (fromLines) return fromLines;

  return "standard";
}
