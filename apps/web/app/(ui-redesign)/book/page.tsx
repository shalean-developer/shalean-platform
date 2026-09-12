import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CheckCircle2, ShieldCheck, Star } from "lucide-react";
import { BookIndexHeader } from "@/components/booking/BookIndexHeader";
import { Button } from "@/components/ui/button";
import { buildBookHubHrefFromLegacySearchParams } from "@/lib/booking/legacyBookingToBookRedirect";
import { collectLegacyBookingSearchParams } from "@/lib/booking/legacyBookingSearchParams";
import { loadBookingV2Catalog } from "@/lib/booking-v2/loadBookingV2Catalog";
import { GET_FREE_QUOTE_HREF } from "@/lib/marketing/getFreeQuote";
import { SERVICE_CONFIG, SERVICE_SLUGS } from "@/src/features/booking-v2/config/serviceConfig";

export const dynamic = "force-dynamic";

type BookIndexPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstString(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0]?.trim() || null;
  return value?.trim() || null;
}

export default async function BookIndexPage({ searchParams }: BookIndexPageProps) {
  const sp = await searchParams;
  const params = collectLegacyBookingSearchParams(sp);

  // Preserve service intent from marketing/SEO links instead of making visitors
  // choose the same service again on the hub.
  const requestedService =
    params.get("service")?.trim() ||
    firstString(sp.serviceSlug) ||
    firstString(sp.service_slug) ||
    firstString(sp.serviceType) ||
    firstString(sp.service_type);

  if (requestedService) {
    const normalized = requestedService.toLowerCase();
    if (SERVICE_SLUGS.includes(normalized as (typeof SERVICE_SLUGS)[number])) {
      const redirectParams = new URLSearchParams(params);
      redirectParams.set("service", normalized);
      redirect(buildBookHubHrefFromLegacySearchParams(redirectParams));
    }
    redirect(buildBookHubHrefFromLegacySearchParams(params));
  }

  const { catalog } = await loadBookingV2Catalog();

  return (
    <div className="min-h-dvh bg-muted/35 text-foreground">
      <BookIndexHeader />

      <main className="mx-auto max-w-[var(--ui-container-lg)] px-[var(--ui-page-gutter)] py-10 sm:py-14">
        <section className="text-center" aria-labelledby="booking-service-heading">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            Instant online price · No obligation
          </p>
          <h1
            id="booking-service-heading"
            className="mx-auto mt-5 max-w-3xl text-[length:var(--ui-text-page-title)] font-extrabold leading-[var(--ui-leading-tight)] tracking-tight text-foreground"
          >
            Choose your cleaning service
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-base leading-[var(--ui-leading-body)] text-muted-foreground">
            Select a service to see your price, choose a date and continue to secure checkout. Most bookings take less than 3 minutes.
          </p>
        </section>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 rounded-[var(--ui-radius-xl)] border border-border bg-card px-4 py-3 text-sm text-muted-foreground shadow-[var(--ui-shadow-sm)] sm:px-6">
          <span className="inline-flex items-center gap-1.5 font-semibold text-card-foreground">
            <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden />
            Trusted local cleaning team
          </span>
          <span>Vetted cleaners</span>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
            Secure Paystack payment
          </span>
          <span>Satisfaction guarantee</span>
        </div>

        <section className="mt-8" aria-label="Cleaning services">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SERVICE_SLUGS.map((slug) => {
              const config = SERVICE_CONFIG[slug];
              const basePrice = catalog[slug].basePrice;
              const hasRoomPricing = catalog[slug].pricePerBedroom > 0;

              return (
                <Link
                  key={slug}
                  href={`/book/${slug}`}
                  data-growth-cta-source={`book_hub_${slug}`}
                  className="group flex min-h-[15rem] flex-col justify-between rounded-[var(--ui-radius-xl)] border border-border bg-card p-5 text-card-foreground shadow-[var(--ui-shadow-sm)] transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[var(--ui-shadow-md)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:p-6"
                >
                  <div>
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition group-hover:bg-primary/15">
                        <config.icon className="h-5 w-5" aria-hidden />
                      </div>
                      <h2 className="text-base font-bold text-card-foreground">{config.label}</h2>
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{config.description}</p>
                  </div>

                  <div className="mt-5 flex items-end justify-between gap-4 border-t border-border pt-4">
                    <div>
                      <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">Price from</span>
                      <span className="mt-0.5 block text-lg font-bold text-primary">
                        R{basePrice.toLocaleString("en-ZA")}
                        {hasRoomPricing && <span className="ml-1 text-xs font-medium text-muted-foreground">+ room pricing</span>}
                      </span>
                    </div>
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
                      See price
                      <ArrowRight
                        className="h-4 w-4 transition group-hover:translate-x-1"
                        aria-hidden
                      />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <aside className="mt-10 rounded-[var(--ui-radius-xl)] border border-primary/15 bg-primary/5 p-5 text-center sm:p-7">
          <h2 className="text-base font-bold text-foreground">Not ready to book online?</h2>
          <p className="mx-auto mt-1.5 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Request a personalised quote for an unusual property, office, recurring schedule or job that needs a custom scope.
          </p>
          <Button asChild variant="outline" size="lg" className="mt-5 rounded-xl border-primary/30 bg-background text-primary hover:bg-primary/5">
            <Link href={GET_FREE_QUOTE_HREF} data-quote-cta-source="book_hub">
              Request a personalised quote
            </Link>
          </Button>
        </aside>
      </main>
    </div>
  );
}
