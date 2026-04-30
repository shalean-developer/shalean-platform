"use client";

import Image from "next/image";
import Link from "next/link";
import { type FormEvent, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  Clock3,
  Home,
  Menu,
  Quote,
  ShieldCheck,
  Sparkles,
  Sprout,
  Star,
  Tag,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import type { HomeFaq, HomeLocation } from "@/lib/home/data";
import type { PublicReviewBannerStats } from "@/lib/home/reviewBannerStats";
import { bookingFlowHref, bookingFlowPromoExtra } from "@/lib/booking/bookingFlow";
import { ShaleanNavLogo } from "@/components/brand/ShaleanNavLogo";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { MarketingFreshHero } from "@/components/marketing-home/MarketingFreshHero";
import {
  CUSTOMER_SUPPORT_EMAIL,
  CUSTOMER_SUPPORT_TELEPHONE_E164,
  CUSTOMER_SUPPORT_WHATSAPP_URL,
} from "@/lib/site/customerSupport";
import { cn } from "@/lib/utils";

const bookingEntry = `${bookingFlowHref("entry", bookingFlowPromoExtra("SAVE10"))}&source=marketing_home`;

/**
 * When you overwrite any PNG under `public/` that this page uses, bump this string (e.g. `b` → `c`) and save.
 * Otherwise the UI keeps showing the old picture: `next/image` and the browser cache by full URL, including `?v=…`.
 * Hero images use the separate `HERO_IMAGE_VERSION` in `MarketingFreshHero.tsx` — bump that too if you change them.
 */
const MARKETING_LANDING_IMAGE_VERSION = "20260429d";
const mimg = (path: string) => `${path}?v=${MARKETING_LANDING_IMAGE_VERSION}`;

const BOOK_CLEANER_SECTION_IMG = mimg("/marketing/book-professional-team-living-room-cape-town.webp");

const ABOUT_SHOWCASE_IMG = mimg("/images/marketing/shalean-cleaner-balcony-cape-town.webp");

const WHY_CHOOSE_IMG_MAIN = mimg("/images/marketing/professional-cleaner-vacuum-bedroom-cape-town.webp");
const WHY_CHOOSE_IMG_TOP = mimg("/images/marketing/cleaning-team-bright-space-cape-town.webp");
const WHY_CHOOSE_IMG_BOTTOM = mimg("/images/marketing/bright-living-room-after-cleaning-cape-town.webp");

/** “Freshness At Your Fingertips” service cards — brand photography under `public/images/marketing/`. */
const OUR_SERVICE_FRESHNESS_1 = mimg("/images/marketing/sofa-carpet-care-cape-town.webp");
const OUR_SERVICE_FRESHNESS_2 = mimg("/images/marketing/house-deep-cleaning-cape-town.webp");
const OUR_SERVICE_FRESHNESS_3 = mimg("/images/marketing/office-cleaning-workspace-cape-town.webp");
const OUR_SERVICE_FRESHNESS_4 = mimg("/images/marketing/bathroom-kitchen-deep-clean-cape-town.webp");

/** Left-to-right: card 1 → sofa carpet webp, … card 4 → bathroom/kitchen webp (no random wiring). */
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

const DEFAULT_FAQS: HomeFaq[] = [
  {
    id: "default-1",
    question: "What's included in a clean?",
    answer:
      "Our teams follow a structured checklist covering kitchens, bathrooms, living areas, and floors. Exact inclusions depend on the service you book — you'll see details before checkout.",
  },
  {
    id: "default-2",
    question: "Can I trust my cleaner?",
    answer:
      "Cleaners are vetted and rated after every job. We carry insurance for your peace of mind, and you can leave feedback that we review.",
  },
  {
    id: "default-3",
    question: "How do I pay?",
    answer:
      "Pay securely online when you confirm your booking. You'll receive a confirmation email with all the details.",
  },
  {
    id: "default-4",
    question: "What if I'm not happy with the clean?",
    answer:
      "Contact us within 24 hours and we'll make it right — including a re-clean where appropriate, subject to our satisfaction policy.",
  },
];

type MarketingLandingPageProps = {
  locations: HomeLocation[];
  faqs: HomeFaq[];
  /** Live aggregate from reviews table; when null, trust row uses static marketing copy. */
  reviewBanner?: PublicReviewBannerStats | null;
};

function hash(h: string) {
  return `/${h}`;
}

export function MarketingLandingPage({ locations, faqs, reviewBanner = null }: MarketingLandingPageProps) {
  const ratingTrustTitle =
    reviewBanner != null && reviewBanner.reviewCount >= 1
      ? (() => {
          const n = reviewBanner.reviewCount;
          const by = n >= 10 ? `${n}+ customers` : n === 1 ? "1 customer" : `${n} customers`;
          return `Rated ${reviewBanner.avgRating.toFixed(1)} ★ by ${by}`;
        })()
      : "4.9 rating";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openFaqId, setOpenFaqId] = useState<string | null>(null);
  const [footerNewsletterEmail, setFooterNewsletterEmail] = useState("");
  const aboutShowcaseImgRef = useRef<HTMLDivElement>(null);
  const [aboutShowcaseImgHeight, setAboutShowcaseImgHeight] = useState<number | null>(null);
  const [aboutShowcaseLg, setAboutShowcaseLg] = useState(false);

  const faqItems = faqs.length > 0 ? faqs : DEFAULT_FAQS;

  function onFooterNewsletterSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = footerNewsletterEmail.trim();
    if (!v) return;
    window.location.href = `mailto:${CUSTOMER_SUPPORT_EMAIL}?subject=${encodeURIComponent("Newsletter — cleaning tips")}&body=${encodeURIComponent(`Please add this email to updates: ${v}`)}`;
  }

  /** One sync for breakpoint + image box height so 4,500+ card gets half-height after first paint (avoids lg state lag vs CSS). */
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const el = aboutShowcaseImgRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => {
      setAboutShowcaseLg(mq.matches);
      const h = el.getBoundingClientRect().height;
      setAboutShowcaseImgHeight(h > 0 ? Math.round(h) : null);
    };

    sync();
    const ro = new ResizeObserver(() => {
      window.requestAnimationFrame(sync);
    });
    ro.observe(el);
    mq.addEventListener("change", sync);
    window.addEventListener("resize", sync);
    return () => {
      ro.disconnect();
      mq.removeEventListener("change", sync);
      window.removeEventListener("resize", sync);
    };
  }, []);

  const navClass =
    "rounded-lg px-3 py-2 text-sm font-medium text-white/90 transition hover:bg-white/10 hover:text-white";

  return (
    <div className="bg-white text-slate-900">
      {/* Site header (design-specific; GlobalTopNav hidden on `/`) */}
      <header className="sticky top-0 z-40 border-b border-blue-900/25 bg-[#1e4fd4] shadow-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:py-3.5">
          <Link
            href="/"
            className="flex shrink-0 items-center rounded-lg px-1 py-0.5 transition hover:bg-white/10"
            aria-label="Shalean home"
          >
            <ShaleanNavLogo className="h-10 w-10" />
          </Link>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
            <Link href={hash("#services")} className={navClass}>
              Services
            </Link>
            <Link href={hash("#locations")} className={navClass}>
              Locations
            </Link>
            <Link href={hash("#pricing")} className={navClass}>
              Pricing
            </Link>
            <Link href={hash("#about")} className={navClass}>
              About Us
            </Link>
            <Link href={hash("#faq")} className={navClass}>
              FAQs
            </Link>
          </nav>

          <div className="hidden items-center gap-3 lg:flex">
            <Link
              href="/login?role=customer"
              className="text-sm font-semibold text-white/90 underline-offset-4 hover:text-white hover:underline"
            >
              Login
            </Link>
            <GrowthCtaLink
              href={bookingEntry}
              source="marketing_header_book"
              className="inline-flex min-h-10 items-center rounded-xl bg-white px-5 py-2 text-sm font-semibold text-[#1e4fd4] shadow-sm transition hover:bg-blue-50"
            >
              Book now
            </GrowthCtaLink>
          </div>

          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/20 text-white lg:hidden"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            onClick={() => setMobileOpen((o) => !o)}
            suppressHydrationWarning
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {mobileOpen ? (
          <div className="border-t border-white/10 px-4 py-4 lg:hidden">
            <div className="flex flex-col gap-1">
              {[
                ["Services", hash("#services")],
                ["Locations", hash("#locations")],
                ["Pricing", hash("#pricing")],
                ["About Us", hash("#about")],
                ["FAQs", hash("#faq")],
              ].map(([label, href]) => (
                <Link
                  key={String(label)}
                  href={href}
                  className="rounded-lg px-3 py-3 text-sm font-medium text-white/95 hover:bg-white/10"
                  onClick={() => setMobileOpen(false)}
                >
                  {label}
                </Link>
              ))}
              <Link
                href="/login?role=customer"
                className="mt-2 rounded-xl border border-white/25 px-3 py-3 text-center text-sm font-semibold text-white"
                onClick={() => setMobileOpen(false)}
              >
                Login
              </Link>
              <GrowthCtaLink
                href={bookingEntry}
                source="marketing_header_mobile_book"
                className="mt-2 flex min-h-12 items-center justify-center rounded-xl bg-white py-3 text-sm font-semibold text-[#1e4fd4] transition hover:bg-blue-50"
              >
                Book now
              </GrowthCtaLink>
            </div>
          </div>
        ) : null}
      </header>

      <main>
      <MarketingFreshHero bookHref={bookingEntry} />

      {/* Trust banner (below hero) */}
      <section id="pricing" className="bg-[#1e4fd4] py-12 text-white md:py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="mx-auto max-w-4xl text-center text-lg font-semibold leading-snug tracking-tight text-white sm:text-xl md:text-2xl">
            Trusted by homeowners, tenants, and Airbnb hosts across Cape Town
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:mt-12 lg:grid-cols-4 lg:gap-5">
            {(
              [
                {
                  Icon: Star,
                  title: ratingTrustTitle,
                  subtitle: "From verified reviews",
                },
                {
                  Icon: Users,
                  title: "Trusted by 500+ homes",
                  subtitle: "Across Cape Town",
                },
                {
                  Icon: ShieldCheck,
                  title: "Vetted cleaners",
                  subtitle: "ID & reference checked",
                },
                {
                  Icon: Sparkles,
                  title: "Satisfaction guarantee",
                  subtitle: "Support if something is missed",
                },
              ] as const
            ).map(({ Icon, title, subtitle }) => (
              <div
                key={title}
                className="flex gap-4 rounded-xl border border-white/10 bg-white p-5 text-left shadow-md shadow-blue-950/10 sm:p-6"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-200/80 bg-white shadow-sm">
                  <Icon className="h-5 w-5 fill-none text-[#1e4fd4]" strokeWidth={1.75} aria-hidden />
                </div>
                <div className="min-w-0">
                  <p className="text-base font-bold leading-snug text-slate-800">{title}</p>
                  <p className="mt-1 text-sm leading-snug text-slate-500">{subtitle}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Choose Us (replaces former services grid; #services kept for nav) */}
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
                From verified professionals to eco-friendly products, we provide reliable, timely, and spotless
                cleaning services for every home and office.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-2.5 md:mt-8 md:gap-3">
                <GrowthCtaLink
                  href={bookingEntry}
                  source="marketing_why_choose_book"
                  className="inline-flex h-12 shrink-0 items-center justify-center rounded-full bg-blue-600 px-7 text-sm font-semibold tracking-tight text-white shadow-[0_4px_16px_rgba(37,99,235,0.35)] transition-colors hover:bg-blue-700 md:h-14 md:px-9"
                >
                  Book a Cleaner
                </GrowthCtaLink>
                <GrowthCtaLink
                  href={bookingEntry}
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

      {/* Our Services — between Why Choose Us and About */}
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
                  <Image src={image} alt={alt} fill className="object-cover object-center" sizes="(max-width:640px) 100vw, (max-width:1024px) 50vw, 25vw" />
                </div>
                <h3 className="mt-4 text-lg font-bold leading-snug tracking-tight text-slate-900 sm:mt-5 sm:text-xl">
                  {title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 sm:text-[0.9375rem]">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* About Us showcase */}
      <section id="about" className="scroll-mt-24 border-t border-slate-100 bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-start lg:gap-12 xl:gap-16">
            <div>
              <p className="text-sm font-medium tracking-wide text-slate-500">— About Us</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-[2.35rem] lg:leading-[1.15]">
                More Than Cleaning
                <br />
                We Care For Your Space
              </h2>
            </div>
            <div className="lg:pt-1">
              <p className="max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
                We started with a simple belief: a clean home brings a clear mind. From humble beginnings with a
                small team, today we proudly serve hundreds of homes and offices, delivering spotless results with
                care, honesty, and eco-friendly solutions.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-2.5 md:mt-8 md:gap-3">
                <Link
                  href="/services"
                  className="inline-flex h-12 shrink-0 items-center justify-center rounded-full bg-blue-600 px-8 text-sm font-semibold tracking-tight text-white shadow-[0_4px_16px_rgba(37,99,235,0.35)] transition-colors hover:bg-blue-700 md:h-14 md:px-10"
                >
                  Explore us
                </Link>
                <Link
                  href="/services"
                  aria-label="Explore our services"
                  className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-[0_4px_16px_rgba(37,99,235,0.35)] transition-colors hover:bg-blue-700 md:h-14 md:w-14"
                >
                  <ArrowUpRight size={20} strokeWidth={2.25} aria-hidden />
                </Link>
              </div>
            </div>
          </div>

          {/*
            Three columns on lg: bottom edges align (photo, stat cards, testimonial).
            Stat cards stack with normal gap; Since 2022 and 4,500+ are left-aligned in the middle column.
          */}
          <div className="mt-14 flex flex-col gap-10 lg:mt-20 lg:flex-row lg:items-end lg:gap-5 xl:gap-8">
            {/* Left: tall portrait photo */}
            <div className="w-full shrink-0 lg:min-w-0 lg:flex-1">
              <div
                ref={aboutShowcaseImgRef}
                className="relative mx-auto aspect-[4/5] w-full max-w-[20rem] overflow-hidden rounded-[1.75rem] shadow-md ring-1 ring-black/5 sm:rounded-3xl lg:mx-0 lg:max-w-none"
              >
                <Image
                  src={ABOUT_SHOWCASE_IMG}
                  alt="Shalean cleaner in uniform mopping a sunny tiled balcony by the water in Cape Town"
                  fill
                  className="object-cover object-center"
                  sizes="(max-width: 1024px) 100vw, 33vw"
                />
              </div>
            </div>

            {/* Middle: Since 2022 card right-aligned above 4,500+ (left); lg aligns to row bottom */}
            <div className="flex w-full shrink-0 flex-col items-start gap-5 lg:min-w-0 lg:flex-1 lg:gap-6 lg:self-end">
              <div className="box-border flex aspect-square w-40 max-w-full shrink-0 flex-col justify-center self-end rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:w-44 sm:p-5">
                <p className="flex items-center gap-1.5 text-lg font-bold leading-snug tracking-tight text-slate-900 sm:gap-2 sm:text-2xl">
                  <ArrowRight className="size-[1.1em] shrink-0 text-slate-700" strokeWidth={2} aria-hidden />
                  Since 2022
                </p>
                <p className="mt-2 text-[0.65rem] leading-tight text-slate-500 sm:mt-2.5 sm:text-[11px] sm:leading-snug">
                  Trusted by thousands of homes across Cape Town
                </p>
              </div>
              <div
                className="box-border flex w-full shrink-0 flex-col justify-center overflow-hidden rounded-2xl bg-[#1e4fd4] px-6 py-5 text-left text-white shadow-lg shadow-blue-900/25 ring-1 ring-white/15 sm:px-7 sm:py-6 lg:w-auto lg:shrink-0 lg:self-start lg:px-4 lg:py-4"
                style={
                  aboutShowcaseLg && aboutShowcaseImgHeight != null && aboutShowcaseImgHeight > 0
                    ? (() => {
                        const s = Math.round(aboutShowcaseImgHeight / 2);
                        return {
                          width: s,
                          minWidth: s,
                          maxWidth: s,
                          height: s,
                          minHeight: s,
                          maxHeight: s,
                        };
                      })()
                    : undefined
                }
              >
                <p className="text-2xl font-bold tracking-tight tabular-nums sm:text-4xl lg:text-2xl xl:text-3xl">
                  4,500+
                </p>
                <p className="mt-2 text-sm leading-snug text-blue-100 sm:mt-3 lg:text-[11px] lg:leading-snug">
                  Delivering spotless homes across Cape Town every week
                </p>
              </div>
            </div>

            {/* Right: testimonial card — bottom aligns with image & 4,500+ row */}
            <div className="relative w-full shrink-0 overflow-hidden rounded-3xl border border-emerald-100/60 bg-gradient-to-br from-[#eef6df] via-[#f4f9ec] to-[#faf8ef] p-8 shadow-md ring-1 ring-black/[0.04] sm:p-9 lg:min-w-0 lg:flex-1">
              <Quote
                className="pointer-events-none absolute left-6 top-6 h-14 w-14 text-emerald-300/90 sm:left-8 sm:top-8 sm:h-16 sm:w-16"
                strokeWidth={1}
                aria-hidden
              />
              <blockquote className="relative pt-10 text-base font-medium leading-relaxed text-slate-800 sm:pt-12 sm:text-lg">
                Shalean completely transformed my apartment in Claremont. The team was professional, fast, and paid
                attention to every detail. It honestly felt like walking into a brand-new home.
              </blockquote>
              <footer className="relative mt-8 flex items-center gap-4 border-t border-emerald-900/10 pt-8">
                <div
                  className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-100 text-sm font-bold tracking-tight text-emerald-900 ring-2 ring-white shadow-md"
                  aria-hidden
                >
                  SM
                </div>
                <div>
                  <cite className="not-italic">
                    <span className="block text-base font-bold text-slate-900">Sarah M.</span>
                    <span className="mt-0.5 block text-sm text-slate-500">Claremont</span>
                  </cite>
                </div>
              </footer>
            </div>
          </div>
        </div>
      </section>

      {/* Book your cleaner — mint bg, white card, blue CTAs (same as Why Choose / FAQ), local hero art. */}
      <section
        className="scroll-mt-24 bg-[#f4f9f4] py-16 sm:py-20 lg:py-24"
        aria-labelledby="book-sparkle-heading"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-14 xl:gap-20">
            <div className="max-w-xl lg:max-w-none">
              <p className="text-sm font-medium tracking-wide text-neutral-900">— Book Your Cleaner</p>
              <h2
                id="book-sparkle-heading"
                className="mt-3 text-3xl font-bold leading-[1.15] tracking-tight text-neutral-900 sm:text-4xl lg:text-[2.5rem] lg:leading-[1.12]"
              >
                Your Home Deserves A Sparkle
              </h2>
              <div className="mt-9 rounded-[1.75rem] bg-white p-7 shadow-sm sm:mt-10 sm:p-9 sm:rounded-[28px]">
                <Sparkles className="h-6 w-6 text-neutral-900" strokeWidth={1.25} aria-hidden />
                <p className="mt-5 max-w-md text-base leading-relaxed text-[#4A4A4A]">
                  Schedule a cleaning today with our trusted professionals and enjoy a spotless, fresh home without any
                  hassle.
                </p>
                <div className="mt-8 flex flex-wrap items-center gap-2.5 md:gap-3">
                  <GrowthCtaLink
                    href={bookingEntry}
                    source="marketing_book_sparkle_book"
                    className="inline-flex h-12 shrink-0 items-center justify-center rounded-full bg-blue-600 px-7 text-sm font-semibold tracking-tight text-white shadow-[0_4px_16px_rgba(37,99,235,0.35)] transition-colors hover:bg-blue-700 md:h-14 md:px-9"
                  >
                    Book a Cleaner
                  </GrowthCtaLink>
                  <GrowthCtaLink
                    href={bookingEntry}
                    source="marketing_book_sparkle_arrow"
                    className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-[0_4px_16px_rgba(37,99,235,0.35)] transition-colors hover:bg-blue-700 md:h-14 md:w-14"
                  >
                    <span className="sr-only">Book a cleaner</span>
                    <ArrowUpRight size={20} strokeWidth={2.25} aria-hidden />
                  </GrowthCtaLink>
                </div>
              </div>
            </div>
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[1.75rem] shadow-lg ring-1 ring-black/[0.06] sm:rounded-[28px] lg:aspect-[5/4]">
              <Image
                src={BOOK_CLEANER_SECTION_IMG}
                alt="Professional cleaning team working in a bright living room in Cape Town"
                fill
                className="object-cover object-center"
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
            </div>
          </div>
        </div>
      </section>

      {/* FAQ — same intro + surface rhythm as Why Choose / About */}
      <section id="faq" className="scroll-mt-24 border-t border-slate-100 bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-2 lg:items-start lg:gap-12 xl:gap-16">
            <div>
              <p className="text-sm font-medium tracking-wide text-slate-500">— FAQs</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-[2.35rem] lg:leading-[1.12]">
                Cleaning service FAQs
              </h2>
            </div>
            <div className="lg:pt-1">
              <p className="max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
                Straight answers about what&apos;s included, trust, payment, and what to do if something&apos;s not
                right — before you book.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-2.5 md:mt-8 md:gap-3">
                <GrowthCtaLink
                  href={bookingEntry}
                  source="marketing_faq_book"
                  className="inline-flex h-12 shrink-0 items-center justify-center rounded-full bg-blue-600 px-7 text-sm font-semibold tracking-tight text-white shadow-[0_4px_16px_rgba(37,99,235,0.35)] transition-colors hover:bg-blue-700 md:h-14 md:px-9"
                >
                  Book a Cleaner
                </GrowthCtaLink>
                <GrowthCtaLink
                  href={bookingEntry}
                  source="marketing_faq_book_arrow"
                  className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-[0_4px_16px_rgba(37,99,235,0.35)] transition-colors hover:bg-blue-700 md:h-14 md:w-14"
                >
                  <span className="sr-only">Book a cleaner</span>
                  <ArrowUpRight size={20} strokeWidth={2.25} aria-hidden />
                </GrowthCtaLink>
              </div>
            </div>
          </div>

          <div className="mt-14 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-black/[0.03] sm:mt-16 lg:mt-20">
            {faqItems.map((faq) => {
              const open = openFaqId === faq.id;
              return (
                <div key={faq.id} className="border-b border-slate-100 last:border-b-0">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-semibold text-slate-900 transition hover:bg-slate-50/80 sm:px-6 sm:py-5 sm:text-base"
                    onClick={() => setOpenFaqId(open ? null : faq.id)}
                    aria-expanded={open}
                    suppressHydrationWarning
                  >
                    {faq.question}
                    <ChevronDown
                      className={cn("h-5 w-5 shrink-0 text-slate-500 transition", open && "rotate-180")}
                    />
                  </button>
                  {open ? (
                    <div className="border-t border-slate-100 bg-slate-50/40 px-5 pb-5 pt-3 text-sm leading-relaxed text-slate-600 sm:px-6 sm:text-[0.9375rem]">
                      {faq.answer}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How it works — Our Services–style band + Why Choose–style step cards */}
      <section
        id="how-it-works"
        className="scroll-mt-24 border-t border-emerald-100/40 bg-gradient-to-b from-[#f3f8f1] via-[#f7faf6] to-[#fafaf8] py-16 sm:py-20"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-2 lg:items-start lg:gap-12 xl:gap-16">
            <div>
              <p className="text-sm font-medium tracking-wide text-slate-500">— How It Works</p>
              <h2 className="mt-3 text-center text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-left lg:text-[2.35rem] lg:leading-[1.12]">
                From booking to a fresh home
              </h2>
            </div>
            <p className="max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg lg:max-w-none lg:pt-1">
              Three simple steps: tell us what you need, we send a vetted team with supplies, and you enjoy the
              results — with secure payment and easy rebooking.
            </p>
          </div>

          <div className="mt-14 grid gap-6 sm:mt-16 sm:grid-cols-2 sm:gap-8 lg:mt-20 lg:grid-cols-3 lg:gap-8">
            {(
              [
                {
                  step: "1",
                  title: "Book online",
                  desc: "Choose your service, tell us about your space, and pick a time that suits you.",
                  icon: Sparkles,
                },
                {
                  step: "2",
                  title: "We clean",
                  desc: "Your vetted team arrives with supplies and follows our structured quality checklist.",
                  icon: ShieldCheck,
                },
                {
                  step: "3",
                  title: "You relax",
                  desc: "Come home to a fresh space — pay securely online and rebook in a few taps.",
                  icon: Home,
                },
              ] as const
            ).map((s) => (
              <div
                key={s.step}
                className="flex gap-4 rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm ring-1 ring-black/[0.03] sm:p-6"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm">
                  <s.icon className="h-6 w-6 text-slate-900" strokeWidth={1.5} aria-hidden />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Step {s.step}</p>
                  <h3 className="mt-1 text-base font-bold leading-snug text-slate-900 sm:text-lg">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Locations — About-style intro + chip row */}
      <section id="locations" className="scroll-mt-24 border-t border-slate-100 bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-2 lg:items-start lg:gap-12 xl:gap-16">
            <div>
              <p className="text-sm font-medium tracking-wide text-slate-500">— Areas We Serve</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-[2.35rem] lg:leading-[1.12]">
                Cape Town and surrounding suburbs
              </h2>
            </div>
            <div className="lg:pt-1">
              <p className="max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg lg:max-w-none">
                {locations.length > 0
                  ? "We currently serve the areas below. Add your address at checkout to confirm availability for your home or office."
                  : "We operate across Cape Town and surrounding suburbs — enter your address when you book to confirm we cover your area."}
              </p>
            </div>
          </div>

          {locations.length > 0 ? (
            <ul className="mt-12 flex flex-wrap gap-2.5 sm:mt-14 lg:mt-16">
              {locations.map((loc) => (
                <li
                  key={loc.id}
                  className="rounded-xl border border-slate-200/90 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-black/[0.02]"
                >
                  {loc.city ? `${loc.name}, ${loc.city}` : loc.name}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-10 flex flex-wrap items-center gap-2.5 sm:mt-12 md:gap-3">
            <GrowthCtaLink
              href={bookingEntry}
              source="marketing_locations_book"
              className="inline-flex h-12 shrink-0 items-center justify-center rounded-full bg-blue-600 px-7 text-sm font-semibold tracking-tight text-white shadow-[0_4px_16px_rgba(37,99,235,0.35)] transition-colors hover:bg-blue-700 md:h-14 md:px-9"
            >
              Check my area
            </GrowthCtaLink>
            <GrowthCtaLink
              href={bookingEntry}
              source="marketing_locations_book_arrow"
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-[0_4px_16px_rgba(37,99,235,0.35)] transition-colors hover:bg-blue-700 md:h-14 md:w-14"
            >
              <span className="sr-only">Book for your area</span>
              <ArrowUpRight size={20} strokeWidth={2.25} aria-hidden />
            </GrowthCtaLink>
          </div>
        </div>
      </section>
      </main>

      {/* Footer — four-column layout (brand, quick links, services, newsletter + social) */}
      <footer id="contact" className="scroll-mt-24 bg-black py-14 text-white sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-4 lg:gap-10">
            {/* Brand */}
            <div>
              <div className="relative inline-block">
                <span
                  className="pointer-events-none absolute -top-2 left-0 h-0.5 w-[min(100%,4.5rem)] bg-sky-400"
                  aria-hidden
                />
                <p className="text-2xl font-bold tracking-tight text-white">
                  Shalean<span className="text-sky-400">.</span>
                </p>
              </div>
              <p className="mt-4 max-w-xs text-sm font-normal leading-relaxed text-white/85">
                Making your world shine, one home at a time.
              </p>
              <p className="mt-8 text-xs leading-relaxed text-neutral-500">
                © {new Date().getFullYear()} Shalean Cleaning Services. All rights reserved.
              </p>
            </div>

            {/* Quick links */}
            <div>
              <p className="text-sm font-bold text-white">Quick Links</p>
              <ul className="mt-4 space-y-3 text-sm text-white/90">
                <li>
                  <Link href="/" className="transition hover:text-white">
                    Home
                  </Link>
                </li>
                <li>
                  <Link href={hash("#about")} className="transition hover:text-white">
                    About Us
                  </Link>
                </li>
                <li>
                  <Link href="/services" className="transition hover:text-white">
                    Services
                  </Link>
                </li>
                <li>
                  <Link href="/review" className="transition hover:text-white">
                    Reviews
                  </Link>
                </li>
                <li>
                  <a href={`mailto:${CUSTOMER_SUPPORT_EMAIL}`} className="transition hover:text-white">
                    Contact
                  </a>
                </li>
                <li>
                  <Link href="/login?role=customer" className="transition hover:text-white">
                    Login
                  </Link>
                </li>
              </ul>
            </div>

            {/* Popular services */}
            <div>
              <p className="text-sm font-bold text-white">Popular Services</p>
              <ul className="mt-4 space-y-3 text-sm text-white/90">
                <li>
                  <Link href="/services/deep-cleaning-cape-town" className="transition hover:text-white">
                    Deep Cleaning
                  </Link>
                </li>
                <li>
                  <Link href="/services/carpet-cleaning-cape-town" className="transition hover:text-white">
                    Sofa &amp; Carpet Care
                  </Link>
                </li>
                <li>
                  <Link href="/services/office-cleaning-cape-town" className="transition hover:text-white">
                    Office Cleaning
                  </Link>
                </li>
                <li>
                  <Link href="/services/standard-cleaning-cape-town" className="transition hover:text-white">
                    Standard Home Cleaning
                  </Link>
                </li>
              </ul>
            </div>

            {/* Newsletter + social */}
            <div>
              <p className="text-sm font-bold text-white">Get Cleaning Tips &amp; Updates</p>
              <form className="mt-4 space-y-3" onSubmit={onFooterNewsletterSubmit}>
                <div className="flex flex-col gap-2.5 sm:flex-row sm:items-stretch">
                  <label htmlFor="footer-newsletter-email" className="sr-only">
                    Email address
                  </label>
                  <input
                    id="footer-newsletter-email"
                    type="email"
                    name="email"
                    autoComplete="email"
                    placeholder="Email"
                    value={footerNewsletterEmail}
                    onChange={(e) => setFooterNewsletterEmail(e.target.value)}
                    className="min-h-11 w-full flex-1 rounded-full border border-white/15 bg-neutral-900 px-4 py-2.5 text-sm text-white placeholder:text-neutral-500 outline-none ring-0 transition focus:border-sky-400/60 focus:ring-2 focus:ring-sky-400/25"
                    suppressHydrationWarning
                  />
                  <button
                    type="submit"
                    className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-white px-6 text-sm font-semibold text-black transition hover:bg-neutral-100"
                    suppressHydrationWarning
                  >
                    Subscribe
                  </button>
                </div>
                <p className="text-[11px] leading-snug text-neutral-500">No spam, only sparkling ideas!</p>
              </form>
              <div className="mt-8 flex flex-wrap gap-2.5">
                <a
                  href="https://twitter.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/35 text-white transition hover:border-white/60 hover:bg-white/10"
                  aria-label="X"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                </a>
                <a
                  href="https://facebook.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/35 text-white transition hover:border-white/60 hover:bg-white/10"
                  aria-label="Facebook"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                  </svg>
                </a>
                <a
                  href="https://instagram.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/35 text-white transition hover:border-white/60 hover:bg-white/10"
                  aria-label="Instagram"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                  </svg>
                </a>
                <a
                  href="https://linkedin.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/35 text-white transition hover:border-white/60 hover:bg-white/10"
                  aria-label="LinkedIn"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </div>
      </footer>

      <a
        href={CUSTOMER_SUPPORT_WHATSAPP_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg transition hover:bg-emerald-600"
        aria-label="WhatsApp"
      >
        <svg viewBox="0 0 24 24" className="h-7 w-7 fill-current" aria-hidden>
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.881 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
      </a>
    </div>
  );
}
