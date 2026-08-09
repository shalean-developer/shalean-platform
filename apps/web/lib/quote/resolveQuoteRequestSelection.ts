import type { QuoteCatalogSelection, QuotePublicService } from "@/lib/quote/types";

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

  const service = input.services.find((item) => item.slug === requestedServices[0].slug);
  if (!service) return null;

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
