import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Clock3, Sprout, Tag, UserCheck } from "lucide-react";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { marketingPrimaryCtaClassName, marketingPrimaryCtaIconClassName } from "@/lib/marketing/marketingHomeCtaClasses";
import { marketingLandingImage, marketingHomeBookingHref } from "@/lib/marketing/marketingHomeAssets";
import { CAPE_TOWN_SERVICE_SEO } from "@/lib/seo/capeTownSeoPages";
import { linkEmphasisClassName, linkInNavClassName, linkInParagraphClassName } from "@/lib/ui/linkClassNames";
import { cn } from "@/lib/utils";

const p = CAPE_TOWN_SERVICE_SEO;

const mimg = marketingLandingImage;

const WHY_CHOOSE_IMG_MAIN = mimg("/images/marketing/professional-cleaner-vacuum-bedroom-cape-town.webp");
const WHY_CHOOSE_IMG_TOP = mimg("/images/marketing/cleaning-team-bright-space-cape-town.webp");
const WHY_CHOOSE_IMG_BOTTOM = mimg("/images/marketing/bright-living-room-after-cleaning-cape-town.webp");

const OUR_SERVICE_FRESHNESS_1 = mimg("/images/marketing/sofa-carpet-care-cape-town.webp");
const OUR_SERVICE_FRESHNESS_2 = mimg("/images/marketing/house-deep-cleaning-cape-town.webp");
const OUR_SERVICE_FRESHNESS_3 = mimg("/images/marketing/office-cleaning-workspace-cape-town.webp");
const OUR_SERVICE_FRESHNESS_4 = mimg("/images/marketing/bathroom-kitchen-deep-clean-cape-town.webp");

const FRESHNESS_SERVICE_LINK_CLASS = cn(
  "inline-flex shrink-0 items-center rounded-lg border border-slate-100 bg-white px-3 py-2 text-sm font-medium shadow-sm transition-colors duration-200 hover:border-slate-200",
  linkInNavClassName,
);

const FRESHNESS_SERVICE_VIEW_ALL_CLASS = cn(
  "inline-flex shrink-0 items-center rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm shadow-sm transition-colors duration-200 hover:border-slate-200",
  linkEmphasisClassName,
);

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
      <section id="our-services" className="scroll-mt-24 border-t border-slate-100 bg-white py-16 md:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-2 lg:items-start lg:gap-12 xl:gap-16">
            <div>
              <p className="text-sm font-medium tracking-wide text-slate-500">— Our Services</p>
              <h2 className="mt-3 text-center text-2xl font-bold tracking-tight text-slate-900 md:text-3xl lg:text-left">
                Freshness At Your
                <br />
                Fingertips
              </h2>
            </div>
            <p className="max-w-xl text-base leading-relaxed text-slate-600 lg:max-w-none lg:pt-1">
              From everyday home cleaning to specialized care for carpets, sofas, and workspaces, our team makes every
              corner shine. Choose the service that fits your space and let us do the rest.
            </p>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:mt-14 lg:grid-cols-4">
            {OUR_SERVICES_CARDS.map(({ image, alt, title, description }) => (
              <article
                key={title}
                className="flex h-full flex-col overflow-hidden rounded-xl border border-slate-100 bg-white text-left shadow-sm"
              >
                <div className="relative aspect-[4/3] shrink-0">
                  <Image
                    src={image}
                    alt={alt}
                    fill
                    className="object-cover object-center"
                    sizes="(max-width:640px) 100vw, (max-width:1024px) 50vw, 25vw"
                  />
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <h3 className="text-lg font-bold leading-snug tracking-tight text-slate-900">{title}</h3>
                  <p className="mt-2 flex-1 text-base leading-relaxed text-slate-600">{description}</p>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-10 border-t border-slate-100 pt-8">
            <nav
              className="flex flex-wrap justify-center gap-2 sm:gap-3"
              aria-label="Bookable Cape Town service guides"
            >
              <Link href={p["standard-cleaning-cape-town"].path} className={FRESHNESS_SERVICE_LINK_CLASS}>
                Home Cleaning
              </Link>
              <Link href={p["deep-cleaning-cape-town"].path} className={FRESHNESS_SERVICE_LINK_CLASS}>
                Deep Cleaning
              </Link>
              <Link href={p["office-cleaning-cape-town"].path} className={FRESHNESS_SERVICE_LINK_CLASS}>
                Office Cleaning
              </Link>
              <Link href={p["carpet-cleaning-cape-town"].path} className={FRESHNESS_SERVICE_LINK_CLASS}>
                Sofa &amp; Carpet Care
              </Link>
              <Link href="/services" className={FRESHNESS_SERVICE_VIEW_ALL_CLASS}>
                View All Services
              </Link>
            </nav>
          </div>
        </div>
      </section>

      <section id="services" className="scroll-mt-24 bg-slate-50 py-16 md:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-start lg:gap-12 xl:gap-16">
            <div>
              <p className="text-sm font-medium tracking-wide text-slate-500">— Why Choose Us</p>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
                Trusted By Homes, Loved By Families
              </h2>
            </div>
            <div className="lg:pt-1">
              <p className="max-w-xl text-base leading-relaxed text-slate-600">
                From verified professionals to eco-friendly products, we provide reliable, timely, and spotless cleaning
                services for every home and office.
              </p>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-600">
                Explore{" "}
                <Link href="/services" className={linkInParagraphClassName}>
                  all cleaning services
                </Link>
                , compare{" "}
                <Link href={p["standard-cleaning-cape-town"].path} className={linkInParagraphClassName}>
                  home cleaning
                </Link>{" "}
                with{" "}
                <Link href={p["deep-cleaning-cape-town"].path} className={linkInParagraphClassName}>
                  deep cleaning
                </Link>
                , or read tips on the{" "}
                <Link href="/blog" className={linkInParagraphClassName}>
                  Shalean blog
                </Link>
                .
              </p>
              <nav
                className="mt-5 flex flex-wrap gap-x-3 gap-y-2 text-sm text-slate-600"
                aria-label="Top Cape Town cleaning services"
              >
                <Link href="/services" className={linkInNavClassName}>
                  All cleaning services
                </Link>
                <span className="text-slate-300" aria-hidden>
                  ·
                </span>
                <Link href={p["standard-cleaning-cape-town"].path} className={linkInNavClassName}>
                  Home cleaning
                </Link>
                <span className="text-slate-300" aria-hidden>
                  ·
                </span>
                <Link href={p["deep-cleaning-cape-town"].path} className={linkInNavClassName}>
                  Deep cleaning
                </Link>
                <span className="text-slate-300" aria-hidden>
                  ·
                </span>
                <Link href={p["airbnb-cleaning-cape-town"].path} className={linkInNavClassName}>
                  Airbnb cleaning
                </Link>
                <span className="text-slate-300" aria-hidden>
                  ·
                </span>
                <Link href={p["move-out-cleaning-cape-town"].path} className={linkInNavClassName}>
                  Move-out cleaning
                </Link>
              </nav>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <GrowthCtaLink href={bookHref} source="marketing_why_choose_book" className={marketingPrimaryCtaClassName}>
                  Book a cleaner
                </GrowthCtaLink>
                <GrowthCtaLink
                  href={bookHref}
                  source="marketing_why_choose_arrow"
                  className={marketingPrimaryCtaIconClassName}
                >
                  <span className="sr-only">Book a cleaner</span>
                  <ArrowUpRight size={20} strokeWidth={2.25} aria-hidden />
                </GrowthCtaLink>
              </div>
            </div>
          </div>

          <div className="mt-14 grid gap-12 lg:grid-cols-2 lg:items-start lg:gap-14 xl:gap-16">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1.12fr)_minmax(0,1fr)] sm:grid-rows-2 sm:gap-3">
              <div className="relative min-h-[220px] overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm sm:row-span-2 sm:min-h-0 sm:h-full">
                <Image
                  src={WHY_CHOOSE_IMG_MAIN}
                  alt="Professional cleaner vacuuming a bedroom in Cape Town"
                  fill
                  className="object-cover object-center"
                  sizes="(max-width: 640px) 100vw, 42vw"
                />
              </div>
              <div className="relative aspect-[16/10] overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
                <Image
                  src={WHY_CHOOSE_IMG_TOP}
                  alt="Cleaning team working in a bright Cape Town space"
                  fill
                  className="object-cover object-center"
                  sizes="(max-width: 640px) 100vw, 38vw"
                />
              </div>
              <div className="relative aspect-[16/10] overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
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
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-white shadow-sm">
                    <Icon className="h-6 w-6 text-slate-900" strokeWidth={1.5} aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-bold leading-snug text-slate-900 sm:text-lg">{title}</h3>
                    <p className="mt-2 text-base leading-relaxed text-slate-600">{body}</p>
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
