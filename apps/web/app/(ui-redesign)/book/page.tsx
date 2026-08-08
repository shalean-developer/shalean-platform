import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CheckCircle2, Star } from "lucide-react";
import { BookIndexHeader } from "@/components/booking/BookIndexHeader";
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
    <div className="min-h-dvh bg-slate-50">
      <BookIndexHeader />

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-12">
        <div className="text-center">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            Instant online price · No obligation
          </p>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            Choose your cleaning service
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-base leading-relaxed text-slate-600">
            Select a service to see your price, choose a date and continue to secure checkout. Most bookings take less than 3 minutes.
          </p>
        </div>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-slate-600">
          <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800">
            <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden />
            Trusted local cleaning team
          </span>
          <span>Vetted cleaners</span>
          <span>Secure Paystack payment</span>
          <span>Satisfaction guarantee</span>
        </div>

        <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICE_SLUGS.map((slug) => {
            const config = SERVICE_CONFIG[slug];
            const basePrice = catalog[slug].basePrice;
            const hasRoomPricing = catalog[slug].pricePerBedroom > 0;

            return (
              <Link
                key={slug}
                href={`/book/${slug}`}
                data-growth-cta-source={`book_hub_${slug}`}
                className="group flex flex-col justify-between rounded-2xl border border-slate-100 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <div>
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 transition group-hover:bg-blue-100">
                      <config.icon className="h-5 w-5 text-blue-600" aria-hidden />
                    </div>
                    <h2 className="text-base font-bold text-slate-900">{config.label}</h2>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-slate-500">{config.description}</p>
                </div>

                <div className="mt-5 flex items-end justify-between gap-4 border-t border-slate-100 pt-4">
                  <div>
                    <span className="block text-xs font-medium uppercase tracking-wide text-slate-400">Price from</span>
                    <span className="mt-0.5 block text-base font-bold text-blue-700">
                      R{basePrice.toLocaleString("en-ZA")}
                      {hasRoomPricing && <span className="ml-1 text-xs font-medium text-slate-400">+ room pricing</span>}
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700">
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

        <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm sm:p-6">
          <h2 className="text-base font-bold text-slate-900">Not ready to book online?</h2>
          <p className="mx-auto mt-1.5 max-w-xl text-sm leading-relaxed text-slate-600">
            Request a personalised quote for an unusual property, office, recurring schedule or job that needs a custom scope.
          </p>
          <Link
            href={GET_FREE_QUOTE_HREF}
            data-quote-cta-source="book_hub"
            className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl border border-blue-600 px-5 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-50"
          >
            Request a personalised quote
          </Link>
        </div>
      </main>
    </div>
  );
}
