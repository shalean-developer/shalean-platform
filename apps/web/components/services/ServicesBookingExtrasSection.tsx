import Link from "next/link";
import { ArrowRight, ChevronDown, Sparkles } from "lucide-react";
import { loadBookingV2Catalog } from "@/lib/booking-v2/loadBookingV2Catalog";
import {
  SERVICE_CONFIG,
  type ServiceSlug,
} from "@/src/features/booking-v2/config/serviceConfig";

const EXTRAS_SERVICE_ORDER: readonly ServiceSlug[] = [
  "regular-cleaning",
  "deep-cleaning",
  "moving-cleaning",
  "airbnb-cleaning",
  "office-cleaning",
  "carpet-cleaning",
] as const;

const PUBLIC_SERVICE_LABELS: Record<ServiceSlug, string> = {
  "regular-cleaning": "Standard Cleaning",
  "deep-cleaning": "Deep Cleaning",
  "moving-cleaning": "Move In / Out Cleaning",
  "airbnb-cleaning": "Airbnb Cleaning",
  "office-cleaning": "Office Cleaning",
  "carpet-cleaning": "Carpet Cleaning",
};

function formatZar(value: number): string {
  return `R${Math.round(value).toLocaleString("en-ZA")}`;
}

function publicExtraLabel(extra: { id: string; label: string }): string {
  if (extra.id === "interior-windows") return "Interior windows add-on";
  return extra.label;
}

export async function ServicesBookingExtrasSection() {
  let catalog: Awaited<ReturnType<typeof loadBookingV2Catalog>>["catalog"] | undefined;

  try {
    ({ catalog } = await loadBookingV2Catalog());
  } catch {
    catalog = undefined;
  }

  const groups = EXTRAS_SERVICE_ORDER.map((slug) => {
    const liveExtras = catalog?.[slug]?.extras ?? [];
    const extras =
      liveExtras.length > 0
        ? liveExtras
        : SERVICE_CONFIG[slug].extras.map((extra) => ({ ...extra, isPopular: false }));

    return {
      slug,
      label: PUBLIC_SERVICE_LABELS[slug],
      icon: SERVICE_CONFIG[slug].icon,
      extras,
    };
  }).filter((group) => group.extras.length > 0);

  if (groups.length === 0) return null;

  return (
    <section
      aria-labelledby="services-extras-heading"
      className="rounded-[var(--ui-radius-marketing)] border border-[#DBEAFE] bg-[#F7FAFF] p-[var(--ui-space-6)] shadow-[var(--ui-shadow-sm)] md:p-[var(--ui-space-8)]"
    >
      <div className="max-w-3xl">
        <p className="text-[length:var(--ui-text-caption)] font-semibold uppercase tracking-[0.14em] text-primary">
          Optional extras
        </p>
        <h3
          id="services-extras-heading"
          className="mt-[var(--ui-space-2)] text-[length:var(--ui-text-section-title)] font-semibold leading-[var(--ui-leading-tight)] tracking-tight text-foreground"
        >
          Add more to your clean
        </h3>
        <p className="mt-[var(--ui-space-3)] max-w-2xl text-[length:var(--ui-text-body)] leading-[var(--ui-leading-body)] text-muted-foreground">
          These are the same add-ons currently offered in the booking flow. Open your service to compare available extras before checkout.
        </p>
      </div>

      <div className="mt-[var(--ui-space-8)] grid gap-[var(--ui-space-3)] md:grid-cols-2">
        {groups.map(({ slug, label, icon: ServiceIcon, extras }) => (
          <details
            key={slug}
            className="group overflow-hidden rounded-[var(--ui-radius-xl)] border border-[#DBEAFE] bg-card text-card-foreground shadow-[var(--ui-shadow-sm)]"
          >
            <summary className="flex min-h-[76px] cursor-pointer list-none items-center gap-[var(--ui-space-3)] p-[var(--ui-space-5)] transition hover:bg-[#EFF6FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#EFF6FF] text-primary"
                aria-hidden
              >
                <ServiceIcon className="h-5 w-5" strokeWidth={1.8} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[length:var(--ui-text-body)] font-semibold text-foreground">{label}</span>
                <span className="mt-0.5 block text-[length:var(--ui-text-caption)] text-muted-foreground">
                  {extras.length} {extras.length === 1 ? "extra" : "extras"}
                </span>
              </span>
              <ChevronDown
                className="h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
                aria-hidden
              />
            </summary>

            <div className="border-t border-[#DBEAFE] px-[var(--ui-space-5)] pb-[var(--ui-space-5)]">
              <div className="divide-y divide-border">
                {extras.map((extra) => (
                  <div key={extra.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-[var(--ui-space-3)] py-[var(--ui-space-4)]">
                    <div>
                      <div className="flex flex-wrap items-center gap-[var(--ui-space-2)]">
                        <p className="text-[length:var(--ui-text-small)] font-medium text-foreground">{publicExtraLabel(extra)}</p>
                        {extra.isPopular ? (
                          <span className="inline-flex items-center gap-1 rounded-[var(--ui-radius-pill)] bg-[#EFF6FF] px-2 py-0.5 text-[length:var(--ui-text-caption)] font-medium text-primary">
                            <Sparkles className="h-3 w-3" aria-hidden />
                            Popular
                          </span>
                        ) : null}
                      </div>
                      {extra.description ? (
                        <p className="mt-1 text-[length:var(--ui-text-caption)] leading-[var(--ui-leading-body)] text-muted-foreground">
                          {extra.description}
                        </p>
                      ) : null}
                    </div>
                    <p className="whitespace-nowrap text-[length:var(--ui-text-small)] font-semibold text-primary">
                      {formatZar(extra.priceZar)}
                    </p>
                  </div>
                ))}
              </div>

              <Link
                href={`/book/${slug}`}
                className="mt-[var(--ui-space-4)] inline-flex min-h-11 items-center gap-[var(--ui-space-2)] text-[length:var(--ui-text-small)] font-medium text-primary hover:underline hover:underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Book with extras
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </details>
        ))}
      </div>

      <p className="mt-[var(--ui-space-6)] text-[length:var(--ui-text-caption)] leading-[var(--ui-leading-body)] text-muted-foreground">
        Add-on availability and price follow the service you choose and are confirmed again in the booking flow before payment.
      </p>
    </section>
  );
}
