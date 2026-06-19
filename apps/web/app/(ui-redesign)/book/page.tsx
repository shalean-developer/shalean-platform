import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { BookIndexHeader } from "@/components/booking/BookIndexHeader";
import { buildBookHubHrefFromLegacySearchParams } from "@/lib/booking/legacyBookingToBookRedirect";
import { collectLegacyBookingSearchParams } from "@/lib/booking/legacyBookingSearchParams";
import { SERVICE_CONFIG, SERVICE_SLUGS } from "@/src/features/booking-v2/config/serviceConfig";
import type { ServicesCatalog } from "@/app/api/booking-v2/services/route";

type BookIndexPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function fetchServicesCatalog(): Promise<ServicesCatalog | null> {
  try {
    // Use absolute URL during SSR with a fallback for dev vs prod
    const base = process.env.NEXT_PUBLIC_APP_URL ??
      (process.env.NODE_ENV === "production" ? "https://shalean.co.za" : "http://localhost:3000");
    const res = await fetch(`${base}/api/booking-v2/services`, {
      next: { revalidate: 300 }, // cache for 5 minutes
    });
    if (!res.ok) return null;
    const json = await res.json() as { catalog?: ServicesCatalog };
    return json.catalog ?? null;
  } catch {
    return null;
  }
}

export default async function BookIndexPage({ searchParams }: BookIndexPageProps) {
  const sp = await searchParams;
  const params = collectLegacyBookingSearchParams(sp);
  if (params.get("service")?.trim()) {
    redirect(buildBookHubHrefFromLegacySearchParams(params));
  }

  const catalog = await fetchServicesCatalog();

  return (
    <div className="min-h-dvh bg-slate-50">
      <BookIndexHeader />

      <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        {/* Heading */}
        <div className="text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            What would you like cleaned?
          </h1>
          <p className="mt-3 text-base text-slate-500">
            Choose a service to get started — takes less than 3 minutes.
          </p>
        </div>

        {/* Service cards */}
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICE_SLUGS.map((slug) => {
            const config = SERVICE_CONFIG[slug];
            // Use DB price if available, fall back to static config
            const basePrice = catalog?.[slug]?.basePrice ?? config.basePrice;
            const hasRoomPricing = (catalog?.[slug]?.pricePerBedroom ?? 0) > 0;

            return (
              <Link
                key={slug}
                href={`/book/${slug}`}
                className="group flex flex-col justify-between rounded-2xl border border-slate-100 bg-white p-6 shadow-sm transition hover:border-blue-200 hover:shadow-md"
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

                <div className="mt-5 flex items-center justify-between">
                  <div>
                    <span className="text-sm font-semibold text-blue-600">
                      From R{basePrice.toLocaleString("en-ZA")}
                    </span>
                    {hasRoomPricing && (
                      <span className="ml-1.5 text-xs text-slate-400">+ per room</span>
                    )}
                  </div>
                  <ArrowRight
                    className="h-4 w-4 text-slate-300 transition group-hover:translate-x-1 group-hover:text-blue-500"
                    aria-hidden
                  />
                </div>
              </Link>
            );
          })}
        </div>

        {/* Trust strip */}
        <div className="mt-12 flex flex-wrap justify-center gap-x-8 gap-y-3 text-sm text-slate-500">
          {[
            "Vetted & background-checked cleaners",
            "Secure online payment via Paystack",
            "100% satisfaction guarantee",
          ].map((text) => (
            <div key={text} className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-green-400" aria-hidden />
              {text}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
