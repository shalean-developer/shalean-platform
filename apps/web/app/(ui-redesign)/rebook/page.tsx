import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  History,
  LayoutGrid,
  Lock,
  ShieldCheck,
  Star,
} from "lucide-react";
import { BookIndexHeader } from "@/components/booking/BookIndexHeader";
import { loadRebookLandingContext } from "@/lib/customer/loadRebookLandingContext";
import { loadBookingV2Catalog } from "@/lib/booking-v2/loadBookingV2Catalog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { marketingPrimaryCtaClassName } from "@/lib/marketing/marketingHomeCtaClasses";
import { getFreeQuoteButtonClass } from "@/lib/marketing/getFreeQuote";
import { SERVICE_CONFIG, SERVICE_SLUGS } from "@/src/features/booking-v2/config/serviceConfig";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type RebookPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const HERO_TRUST_ITEMS = [
  "Trusted Cleaners",
  "Easy Online Booking",
  "Secure Payment",
  "100% Satisfaction Guarantee",
] as const;

const REPEAT_REASONS = [
  "Trusted & vetted cleaners",
  "Reliable arrival times",
  "Secure online payments",
  "Easy rescheduling",
  "Satisfaction Guarantee",
] as const;

export default async function RebookPage({ searchParams }: RebookPageProps) {
  const sp = await searchParams;
  const token = typeof sp.t === "string" ? sp.t : Array.isArray(sp.t) ? sp.t[0] : null;

  const admin = getSupabaseAdmin();
  const ctx = admin ? await loadRebookLandingContext(admin, token) : null;
  const identified = ctx?.identified ?? false;
  const firstName = ctx?.firstName ?? null;
  const lastBooking = ctx?.lastBooking ?? null;
  const nudgeMessage = ctx?.nudgeMessage ?? null;

  const { catalog } = await loadBookingV2Catalog();

  const heroTitle = identified && firstName ? `Welcome back, ${firstName}!` : "Welcome Back 👋";
  const showReturningCards = identified && lastBooking;

  return (
    <div className="min-h-dvh bg-white">
      <BookIndexHeader />

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        {/* Hero */}
        <section className="text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl">
            {heroTitle}
          </h1>
          {identified ? (
            <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
              Thank you for choosing Shalean Cleaning Services.
              <br className="hidden sm:inline" /> We&apos;re excited to clean your home again.
            </p>
          ) : (
            <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
              Ready for another spotless home?
              <br className="hidden sm:inline" /> Choose a service below.
            </p>
          )}

          {nudgeMessage ? (
            <p className="mt-4 text-sm font-medium text-blue-700">{nudgeMessage}</p>
          ) : null}

          <ul className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-3 text-sm text-slate-600">
            {HERO_TRUST_ITEMS.map((item) => (
              <li key={item} className="flex items-center gap-2">
                <Check className="h-4 w-4 shrink-0 text-blue-600" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </section>

        {/* Last booking summary — identified customers with history */}
        {identified && lastBooking ? (
          <section className="mt-10">
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-6 shadow-sm sm:p-8">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Last Booking</p>
              <h2 className="mt-2 text-xl font-bold text-slate-900">{lastBooking.serviceLabel}</h2>
              {lastBooking.roomLines.length > 0 ? (
                <ul className="mt-3 space-y-1 text-sm text-slate-600">
                  {lastBooking.roomLines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
                <span className="inline-flex items-center rounded-full bg-green-50 px-3 py-1 font-medium text-green-700">
                  {lastBooking.statusLabel}
                </span>
                {lastBooking.completedDateLabel ? (
                  <span className="text-slate-500">{lastBooking.completedDateLabel}</span>
                ) : null}
              </div>
              <div className="mt-6">
                <Link href={lastBooking.rebookUrl} className={marketingPrimaryCtaClassName}>
                  Book This Again
                </Link>
              </div>
            </div>
          </section>
        ) : null}

        {/* Main action cards — returning customers */}
        {showReturningCards ? (
          <section className="mt-10 grid gap-5 sm:grid-cols-2">
            <div
              className={cn(
                "flex flex-col justify-between rounded-2xl border bg-white p-6 shadow-sm sm:p-8",
                lastBooking.isRegularCleaning
                  ? "border-blue-200 ring-2 ring-blue-100"
                  : "border-slate-100",
              )}
            >
              <div>
                <div
                  className={cn(
                    "flex h-12 w-12 items-center justify-center rounded-xl",
                    lastBooking.isRegularCleaning ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-600",
                  )}
                >
                  <History className="h-6 w-6" aria-hidden />
                </div>
                <h2 className="mt-4 text-lg font-bold text-slate-900">Book Your Previous Service</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">
                  Book the same type of cleaning again in just a few clicks.
                </p>
              </div>
              <Link
                href={lastBooking.rebookUrl}
                className={cn(
                  "mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-xl px-6 text-sm font-semibold transition sm:text-base",
                  lastBooking.isRegularCleaning
                    ? "bg-blue-600 text-white shadow-sm hover:bg-blue-700"
                    : getFreeQuoteButtonClass.outline,
                )}
              >
                Book Previous Service
              </Link>
            </div>

            <div className="flex flex-col justify-between rounded-2xl border border-slate-100 bg-white p-6 shadow-sm sm:p-8">
              <div>
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                  <LayoutGrid className="h-6 w-6" aria-hidden />
                </div>
                <h2 className="mt-4 text-lg font-bold text-slate-900">Choose Another Service</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">
                  Need something different this time? Browse all our services.
                </p>
              </div>
              <Link href="/book" className={cn("mt-6 w-full", getFreeQuoteButtonClass.outlineSubtle)}>
                Browse Services
              </Link>
            </div>
          </section>
        ) : null}

        {/* Service cards — unidentified or no booking history */}
        {!showReturningCards ? (
          <section className="mt-10">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {SERVICE_SLUGS.map((slug) => {
                const config = SERVICE_CONFIG[slug];
                const basePrice = catalog[slug].basePrice;
                const hasRoomPricing = catalog[slug].pricePerBedroom > 0;

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
                        {hasRoomPricing ? (
                          <span className="ml-1.5 text-xs text-slate-400">+ per room</span>
                        ) : null}
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
          </section>
        ) : null}

        {/* Why customers book again */}
        <section className="mt-14 rounded-2xl border border-slate-100 bg-slate-50 px-6 py-10 sm:px-10">
          <div className="flex flex-col items-center text-center">
            <div className="flex items-center gap-0.5" aria-label="5 star rating">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className="h-5 w-5 fill-amber-400 text-amber-400" aria-hidden />
              ))}
            </div>
            <h2 className="mt-3 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              Why customers book with us again
            </h2>
          </div>
          <ul className="mx-auto mt-8 grid max-w-2xl gap-3 sm:grid-cols-2">
            {REPEAT_REASONS.map((reason) => (
              <li key={reason} className="flex items-start gap-3 text-sm text-slate-600">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden />
                {reason}
              </li>
            ))}
          </ul>
        </section>

        {/* Compact trust strip */}
        <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { icon: ShieldCheck, label: "Vetted cleaners", bg: "bg-blue-100", color: "text-blue-600" },
            { icon: Lock, label: "Secure payments", bg: "bg-green-100", color: "text-green-600" },
            { icon: BadgeCheck, label: "Satisfaction guarantee", bg: "bg-amber-100", color: "text-amber-600" },
            { icon: Check, label: "Easy rescheduling", bg: "bg-violet-100", color: "text-violet-600" },
          ].map(({ icon: Icon, label, bg, color }) => (
            <div
              key={label}
              className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"
            >
              <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", bg)}>
                <Icon className={cn("h-5 w-5", color)} strokeWidth={1.75} aria-hidden />
              </div>
              <p className="text-sm font-semibold text-gray-900">{label}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
