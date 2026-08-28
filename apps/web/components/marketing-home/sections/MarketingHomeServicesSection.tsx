import Image from "next/image";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { marketingLandingImage, marketingHomeBookingHref } from "@/lib/marketing/marketingHomeAssets";

const mimg = marketingLandingImage;

const WHY_CHOOSE_IMG_MAIN = mimg("/images/marketing/professional-cleaner-vacuum-bedroom-cape-town.webp");
const WHY_CHOOSE_IMG_TOP = mimg("/images/marketing/cleaning-team-bright-space-cape-town.webp");
const WHY_CHOOSE_IMG_BOTTOM = mimg("/images/marketing/bright-living-room-after-cleaning-cape-town.webp");

const waHref = "https://wa.me/27825915525?text=Hi%20Shalean%20Cleaning%20Services";

export function MarketingHomeServicesSection() {
  const bookHref = marketingHomeBookingHref();

  return (
    <section id="why-choose-us" className="scroll-mt-24 bg-slate-50 py-16 md:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1.12fr)_minmax(0,1fr)] sm:grid-rows-2 sm:gap-3">
            <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm sm:row-span-2 sm:min-h-[340px] sm:aspect-auto">
              <Image
                src={WHY_CHOOSE_IMG_MAIN}
                alt="Professional cleaner vacuuming a bedroom in Cape Town"
                fill
                className="object-cover object-center"
                sizes="(max-width: 1024px) 55vw, 28vw"
              />
            </div>
            <div className="relative aspect-[16/10] overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
              <Image
                src={WHY_CHOOSE_IMG_TOP}
                alt="Cleaning team working in a bright Cape Town space"
                fill
                className="object-cover object-center"
                sizes="(max-width: 1024px) 40vw, 22vw"
              />
            </div>
            <div className="relative aspect-[16/10] overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
              <Image
                src={WHY_CHOOSE_IMG_BOTTOM}
                alt="Clean, bright living space after home cleaning in Cape Town"
                fill
                className="object-cover object-center"
                sizes="(max-width: 1024px) 40vw, 22vw"
              />
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">People behind the service</p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Professional cleaning built around real homes and workplaces
              </h2>
              <p className="mt-3 max-w-lg text-base leading-relaxed text-slate-600">
                From regular home cleaning to deep cleans, moves, offices, Airbnb turnovers and carpets, the team works to the scope selected for each booking.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <GrowthCtaLink
                href={bookHref}
                source="marketing_why_choose_book"
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
              >
                Book a cleaning
              </GrowthCtaLink>
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Chat on WhatsApp"
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-green-500 text-white shadow-sm transition hover:bg-green-600"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
