import type { QuoteCatalogSelection, QuotePublicService } from "@/lib/quote/types";
import {
  QUOTE_CUSTOM_SERVICE_SLUGS,
  QUOTE_UNSURE_SERVICE_NAME,
  QUOTE_UNSURE_SERVICE_SLUG,
} from "@/lib/quote/quoteSelection";

function roomNote(bedrooms: number | null, bathrooms: number | null): string {
  if (bedrooms == null && bathrooms == null) return "";
  return ` (${bedrooms ?? 0} bed, ${bathrooms ?? 0} bath)`;
}

export function resolveQuoteRequestSelection(input: {
  requested: QuoteCatalogSelection[];
  services: QuotePublicService[];
  bedrooms: number | null;
  bathrooms: number | null;
}): QuoteCatalogSelection[] | null {
  const requestedServices = input.requested.filter((item) => item.kind === "service");
  if (requestedServices.length !== 1) return null;

  if (requestedServices[0].slug === QUOTE_UNSURE_SERVICE_SLUG) {
    if (input.requested.some((item) => item.kind === "extra")) return null;
    return [{
      kind: "service",
      slug: QUOTE_UNSURE_SERVICE_SLUG,
      name: `${QUOTE_UNSURE_SERVICE_NAME}${roomNote(input.bedrooms, input.bathrooms)}`,
      quantity: 1,
    }];
  }

  const service = input.services.find((item) => item.slug === requestedServices[0].slug);
  if (!service || !QUOTE_CUSTOM_SERVICE_SLUGS.has(service.slug)) return null;

  const allowedExtras = new Map(service.extras.map((extra) => [extra.slug, extra]));
  const seenExtras = new Set<string>();
  const resolved: QuoteCatalogSelection[] = [
    {
      kind: "service",
      slug: service.slug,
      name: `${service.name}${roomNote(input.bedrooms, input.bathrooms)}`,
      quantity: 1,
    },
  ];

  for (const item of input.requested) {
    if (item.kind === "service") continue;
    const extra = allowedExtras.get(item.slug);
    if (!extra || seenExtras.has(extra.slug)) return null;
    seenExtras.add(extra.slug);
    resolved.push({ kind: "extra", slug: extra.slug, name: extra.name, quantity: 1 });
  }

  return resolved;
}
