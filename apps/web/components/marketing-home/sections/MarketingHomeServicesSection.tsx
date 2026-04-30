import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Clock3, Sprout, Tag, UserCheck } from "lucide-react";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { marketingLandingImage, marketingHomeBookingHref } from "@/lib/marketing/marketingHomeAssets";
import { CAPE_TOWN_SERVICE_SEO } from "@/lib/seo/capeTownSeoPages";

const p = CAPE_TOWN_SERVICE_SEO;

const mimg = marketingLandingImage;

const WHY_CHOOSE_IMG_MAIN = mimg("/images/marketing/professional-cleaner-vacuum-bedroom-cape-town.webp");
const WHY_CHOOSE_IMG_TOP = mimg("/images/marketing/cleaning-team-bright-space-cape-town.webp");
const WHY_CHOOSE_IMG_BOTTOM = mimg("/images/marketing/bright-living-room-after-cleaning-cape-town.webp");

const OUR_SERVICE_FRESHNESS_1 = mimg("/images/marketing/sofa-carpet-care-cape-town.webp");
const OUR_SERVICE_FRESHNESS_2 = mimg("/images/marketing/house-deep-cleaning-cape-town.webp");
const OUR_SERVICE_FRESHNESS_3 = mimg("/images/marketing/office-cleaning-workspace-cape-town.webp");
const OUR_SERVICE_FRESHNESS_4 = mimg("/images/marketing/bathroom-kitchen-deep-clean-cape-town.webp");

const FRESHNESS_SERVICE_LINK_PILL =
  "inline-flex shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-sm font-medium text-slate-700 backdrop-blur transition-all duration-200 hover:border-blue-300 hover:bg-white hover:text-blue-600";

const FRESHNESS_SERVICE_VIEW_ALL_PILL =
  "inline-flex shrink-0 items-center justify-center rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 transition-all duration-200 hover:bg-blue-100";

const OUR_SERVICES_CARDS = [
  {
    image: OUR_SERVICE_FRESHNESS_1,
    alt: "Sofa and carpet refresh and upholstery care in Cape Town",
    title: "Sofa And Carpet Refresh",
    description: "Remove Stains, Odors, And Bring Back Comfort To Your Furniture.",
  },
  {
    image: OUR_SERVICE_FRESHNESS_2,
    alt: "House deep cleaning for fresh living spaces in Cape Town",
    title: "House Deep Cleaning",
    description: "Thorough Dusting, Mopping, And Sanitizing To Keep Your Home Fresh.",
  },
  {
    image: OUR_SERVICE_FRESHNESS_3,
    alt: "Professional office cleaning in a bright Cape Town workspace",
    title: "Professional Office Cleaning",
    description: "Keep Work Areas Spotless, Organized, And Boost Team Productivity.",
  },
  {
    image: OUR_SERVICE_FRESHNESS_4,
    alt: "Bathroom and kitchen deep clean with spotless surfaces in Cape Town",
    title: "Bathroom & Kitchen Shine",
    description: "Deep Scrubbing To Remove Grime And Germs From Tough Corners.",
  },
] as const;

/** Why choose us + service cards — server HTML for SEO. */
export function MarketingHomeServicesSection() {
  const bookHref = marketingHomeBookingHref();

  return (
    <>
      <section
        id="our-services"
        className="scroll-mt-24 border-t border-emerald-100/40 bg-gradient-to-b from-[#f3f8f1] via-[#f7faf6] to-[#fafaf8] py-16 sm:py-20"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-2 lg:items-start lg:gap-12 xl:gap-16">
            <div>
              <p className="text-sm font-medium tracking-wide text-slate-500">— Our Services</p>
              <h2 className="mt-3 text-center text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-left lg:text-[2.35rem] lg:leading-[1.12]">
                Freshness At Your
                <br />
                Fingertips
              </h2>
            </div>
            <p className="max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg lg:max-w-none lg:pt-1">
              From everyday home cleaning to specialized care for carpets, sofas, and workspaces, our team makes every
              corner shine. Choose the service that fits your space and let us do the rest.
            </p>
          </div>

          <div className="mt-14 grid gap-10 sm:mt-16 sm:grid-cols-2 sm:gap-x-8 sm:gap-y-12 lg:mt-20 lg:grid-cols-4 lg:gap-x-6 lg:gap-y-0 xl:gap-x-8">
            {OUR_SERVICES_CARDS.map(({ image, alt, title, description }) => (
              <article key={title} className="text-left">
                <div className="relative aspect-[4/3] overflow-hidden rounded-2xl shadow-md ring-1 ring-black/[0.06] sm:rounded-[1.25rem]">
                  <Image
                    src={image}
                    alt={alt}
                    fill
                    className="object-cover object-center"
                    sizes="(max-width:640px) 100vw, (max-width:1024px) 50vw, 25vw"
                  />
                </div>
                <h3 className="mt-4 text-lg font-bold leading-snug tracking-tight text-slate-900 sm:mt-5 sm:text-xl">
                  {title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 sm:text-[0.9375rem]">{description}</p>
              </article>
            ))}
          </div>

          <div className="mt-12 border-t border-slate-200/80 pt-10 sm:mt-14">
            <p className="mb-2 text-xs text-slate-500">Our Services</p>
            <nav
              className="mt-4 flex flex-wrap gap-2 sm:gap-3"
              aria-label="Bookable Cape Town service guides"
            >
              <Link href={p["standard-cleaning-cape-town"].path} className={FRESHNESS_SERVICE_LINK_PILL}>
                Home Cleaning
              </Link>
              <Link href={p["deep-cleaning-cape-town"].path} className={FRESHNESS_SERVICE_LINK_PILL}>
                Deep Cleaning
              </Link>
              <Link href={p["office-cleaning-cape-town"].path} className={FRESHNESS_SERVICE_LINK_PILL}>
                Office Cleaning
              </Link>
              <Link href={p["carpet-cleaning-cape-town"].path} className={FRESHNESS_SERVICE_LINK_PILL}>
                Sofa &amp; Carpet Care
              </Link>
              <Link href="/services" className={FRESHNESS_SERVICE_VIEW_ALL_PILL}>
                View All Services
              </Link>
            </nav>
          </div>
        </div>
      </section>

      <section id="services" className="scroll-mt-24 bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-start lg:gap-12 xl:gap-16">
            <div>
              <p className="text-sm font-medium tracking-wide text-slate-500">— Why Choose Us</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-[2.5rem] lg:leading-tight">
                Trusted By Homes, Loved By Families
              </h2>
            </div>
            <div className="lg:pt-1">
              <p className="max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
                From verified professionals to eco-friendly products, we provide reliable, timely, and spotless cleaning
                services for every home and office.
              </p>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-slate-600 sm:text-base">
                Explore{" "}
                <Link href="/services" className="font-semibold text-blue-700 underline-offset-2 hover:underline">
                  all cleaning services
                </Link>
                , compare{" "}
                <Link
                  href={p["standard-cleaning-cape-town"].path}
                  className="font-semibold text-blue-700 underline-offset-2 hover:underline"
                >
                  home cleaning
                </Link>{" "}
                with{" "}
                <Link
                  href={p["deep-cleaning-cape-town"].path}
                  className="font-semibold text-blue-700 underline-offset-2 hover:underline"
                >
                  deep cleaning
                </Link>
                , or read tips on the{" "}
                <Link href="/blog" className="font-semibold text-blue-700 underline-offset-2 hover:underline">
                  Shalean blog
                </Link>
                .
              </p>
              <nav
                className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-2 text-sm font-semibold text-blue-800"
                aria-label="Top Cape Town cleaning services"
              >
                <Link href="/services" className="rounded-lg underline-offset-4 hover:underline">
                  All cleaning services
                </Link>
                <span className="text-slate-300" aria-hidden>
                  ·
                </span>
                <Link href={p["standard-cleaning-cape-town"].path} className="rounded-lg underline-offset-4 hover:underline">
                  Home cleaning
                </Link>
                <span className="text-slate-300" aria-hidden>
                  ·
                </span>
                <Link href={p["deep-cleaning-cape-town"].path} className="rounded-lg underline-offset-4 hover:underline">
                  Deep cleaning
                </Link>
                <span className="text-slate-300" aria-hidden>
                  ·
                </span>
                <Link href={p["airbnb-cleaning-cape-town"].path} className="rounded-lg underline-offset-4 hover:underline">
                  Airbnb cleaning
                </Link>
                <span className="text-slate-300" aria-hidden>
                  ·
                </span>
                <Link href={p["move-out-cleaning-cape-town"].path} className="rounded-lg underline-offset-4 hover:underline">
                  Move-out cleaning
                </Link>
              </nav>
              <div className="mt-6 flex flex-wrap items-center gap-2.5 md:mt-8 md:gap-3">
                <GrowthCtaLink
                  href={bookHref}
                  source="marketing_why_choose_book"
                  className="inline-flex h-12 shrink-0 items-center justify-center rounded-full bg-blue-600 px-7 text-sm font-semibold tracking-tight text-white shadow-[0_4px_16px_rgba(37,99,235,0.35)] transition-colors hover:bg-blue-700 md:h-14 md:px-9"
                >
                  Book a Cleaner
                </GrowthCtaLink>
                <GrowthCtaLink
                  href={bookHref}
                  source="marketing_why_choose_arrow"
                  className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-[0_4px_16px_rgba(37,99,235,0.35)] transition-colors hover:bg-blue-700 md:h-14 md:w-14"
                >
                  <span className="sr-only">Book a cleaner</span>
                  <ArrowUpRight size={20} strokeWidth={2.25} aria-hidden />
                </GrowthCtaLink>
              </div>
            </div>
          </div>

          <div className="mt-16 grid gap-12 sm:mt-20 lg:mt-24 lg:grid-cols-2 lg:items-start lg:gap-14 xl:gap-16">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1.12fr)_minmax(0,1fr)] sm:grid-rows-2 sm:gap-3">
              <div className="relative min-h-[220px] overflow-hidden rounded-2xl shadow-md ring-1 ring-black/5 sm:row-span-2 sm:min-h-0 sm:h-full">
                <Image
                  src={WHY_CHOOSE_IMG_MAIN}
                  alt="Professional cleaner vacuuming a bedroom in Cape Town"
                  fill
                  className="object-cover object-center"
                  sizes="(max-width: 640px) 100vw, 42vw"
                />
              </div>
              <div className="relative aspect-[16/10] overflow-hidden rounded-2xl shadow-md ring-1 ring-black/5">
                <Image
                  src={WHY_CHOOSE_IMG_TOP}
                  alt="Cleaning team working in a bright Cape Town space"
                  fill
                  className="object-cover object-center"
                  sizes="(max-width: 640px) 100vw, 38vw"
                />
              </div>
              <div className="relative aspect-[16/10] overflow-hidden rounded-2xl shadow-md ring-1 ring-black/5">
                <Image
                  src={WHY_CHOOSE_IMG_BOTTOM}
                  alt="Clean, bright living space after home cleaning in Cape Town"
                  fill
                  className="object-cover object-center"
                  sizes="(max-width: 640px) 100vw, 38vw"
                />
              </div>
            </div>

            <div className="mt-10 grid gap-10 sm:mt-0 sm:grid-cols-2 sm:gap-x-8 sm:gap-y-12 lg:mt-0 lg:gap-x-10 lg:gap-y-14 lg:pt-12 xl:pt-16">
              {(
                [
                  {
                    Icon: UserCheck,
                    title: "Verified Professionals",
                    body: "Trained and uniformed staff for every cleaning task.",
                  },
                  {
                    Icon: Sprout,
                    title: "Eco-Friendly Products",
                    body: "Safe for your family, pets, and the environment.",
                  },
                  {
                    Icon: Clock3,
                    title: "On-Time Guarantee",
                    body: "We respect your schedule and arrive when promised.",
                  },
                  {
                    Icon: Tag,
                    title: "Transparent Pricing",
                    body: "No hidden charges — pay only for the service you choose.",
                  },
                ] as const
              ).map(({ Icon, title, body }) => (
                <div key={title} className="flex gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm">
                    <Icon className="h-6 w-6 text-slate-900" strokeWidth={1.5} aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-bold leading-snug text-slate-900 sm:text-lg">{title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
