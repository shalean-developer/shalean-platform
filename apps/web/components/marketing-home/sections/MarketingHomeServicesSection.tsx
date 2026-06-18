import Image from "next/image";
import Link from "next/link";
import { ArrowRight, UserCheck, Sprout, Clock3, BadgeCheck } from "lucide-react";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { marketingLandingImage, marketingHomeBookingHref } from "@/lib/marketing/marketingHomeAssets";

const mimg = marketingLandingImage;

const SERVICES = [
  {
    image: mimg("/images/marketing/standard-cleaning-cape-town-kitchen.webp"),
    alt: "Regular home cleaning in a bright Cape Town kitchen",
    title: "Regular Cleaning",
    description: "Keep your home fresh and comfortable.",
    price: "R350",
    href: "/services/standard-cleaning",
  },
  {
    image: mimg("/images/marketing/deep-cleaning-cape-town-kitchen.webp"),
    alt: "Deep cleaning service in a Cape Town kitchen",
    title: "Deep Cleaning",
    description: "A detailed clean for a healthier home.",
    price: "R550",
    href: "/services/deep-cleaning",
  },
  {
    image: mimg("/images/marketing/move-out-cleaning-cape-town-handover.webp"),
    alt: "Move-in / move-out cleaning service in Cape Town",
    title: "Move-in / Move-out",
    description: "We'll get your new space move-ready.",
    price: "R650",
    href: "/services/move-in-out-cleaning",
  },
  {
    image: mimg("/images/marketing/office-cleaning-workspace-cape-town.webp"),
    alt: "Professional office cleaning in a Cape Town workspace",
    title: "Office Cleaning",
    description: "A clean workspace boosts productivity.",
    price: "R450",
    href: "/services/office-cleaning",
  },
  {
    image: mimg("/images/marketing/airbnb-cleaning-cape-town-living-room.webp"),
    alt: "Window cleaning service in a Cape Town living room",
    title: "Window Cleaning",
    description: "Crystal-clear shine, every time.",
    price: "R300",
    href: "/services",
  },
  {
    image: mimg("/images/marketing/sofa-carpet-care-cape-town.webp"),
    alt: "Laundry and ironing service in Cape Town",
    title: "Laundry & Ironing",
    description: "Fresh, clean and perfectly ironed.",
    price: "R250",
    href: "/services",
  },
] as const;

const WHY_CHOOSE_IMG_MAIN = mimg("/images/marketing/professional-cleaner-vacuum-bedroom-cape-town.webp");
const WHY_CHOOSE_IMG_TOP = mimg("/images/marketing/cleaning-team-bright-space-cape-town.webp");
const WHY_CHOOSE_IMG_BOTTOM = mimg("/images/marketing/bright-living-room-after-cleaning-cape-town.webp");

const BENEFITS = [
  {
    Icon: UserCheck,
    title: "Vetted Professionals",
    body: "Trained, background-checked and uniformed, left entry and gets to work.",
  },
  {
    Icon: Sprout,
    title: "Eco-Friendly Products",
    body: "Safe for your family, pets & our environment.",
  },
  {
    Icon: Clock3,
    title: "On-Time Guarantee",
    body: "We arrive on time, every time.",
  },
  {
    Icon: BadgeCheck,
    title: "Satisfaction Promise",
    body: "If you're not happy, we'll make it right.",
  },
] as const;

const waHref = "https://wa.me/27825915525?text=Hi%20Shalean%20Cleaning%20Services";

export function MarketingHomeServicesSection() {
  const bookHref = marketingHomeBookingHref();

  return (
    <>
      {/* Cleaning services grid */}
      <section id="our-services" className="scroll-mt-24 bg-white py-16 md:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Our cleaning services
          </h2>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {SERVICES.map(({ image, alt, title, description, price, href }) => (
              <Link
                key={title}
                href={href}
                className="group flex flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm transition hover:shadow-md"
              >
                <div className="relative aspect-[16/9] w-full overflow-hidden">
                  <Image
                    src={image}
                    alt={alt}
                    fill
                    className="object-cover object-center transition duration-300 group-hover:scale-105"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  />
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <h3 className="text-base font-bold text-slate-900">{title}</h3>
                  <p className="mt-1 flex-1 text-sm leading-relaxed text-slate-500">{description}</p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-slate-400">
                      From <span className="font-bold text-blue-600">{price}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:text-blue-600" aria-hidden />
                  </div>
                </div>
              </Link>
            ))}
          </div>

          <div className="mt-10 flex justify-center">
            <Link
              href="/services"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              View all services
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      </section>

      {/* Why choose us */}
      <section id="why-choose-us" className="scroll-mt-24 bg-slate-50 py-16 md:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">

            {/* Image collage */}
            <div className="grid grid-cols-[minmax(0,1.12fr)_minmax(0,1fr)] grid-rows-2 gap-3">
              <div className="relative row-span-2 min-h-[280px] overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm sm:min-h-[340px]">
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

            {/* Text + benefits */}
            <div className="flex flex-col gap-6">
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                  Trusted By Homes, Loved By Families
                </h2>
                <p className="mt-3 max-w-md text-base leading-relaxed text-slate-600">
                  We go beyond cleaning — we create clean, comfortable and healthy spaces for the people who matter most.
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
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-500 text-white shadow-sm transition hover:bg-green-600"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
                  </svg>
                </a>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {BENEFITS.map(({ Icon, title, body }) => (
                  <div key={title} className="flex gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-slate-100">
                      <Icon className="h-5 w-5 text-blue-600" strokeWidth={1.75} aria-hidden />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900">{title}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
