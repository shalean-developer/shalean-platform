"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  CalendarRange,
  CheckCircle2,
  Gift,
  Headphones,
  ShieldCheck,
  Sparkles,
  Star,
} from "lucide-react";
import { MarketingHomeHeader } from "@/components/marketing-home/MarketingHomeHeader";
import { SiteFooter } from "@/components/nav/SiteFooter";
import { Button } from "@/components/ui/button";
import { marketingHeroImage, marketingHomeBookingHref } from "@/lib/marketing/marketingHomeAssets";
import { appendStoredReferralToHref } from "@/lib/referrals/client";
import { marketingWhatsAppFloatMainPadding } from "@/lib/marketing/marketingMobileLayout";
import { cn } from "@/lib/utils";

type PublicSettings = {
  enabled: boolean;
  rewardAmountZar: number;
  checkoutDiscountZar: number;
  promotionalText: string | null;
  termsAndConditions: string | null;
};

const WHY_FEATURES = [
  { icon: ShieldCheck, title: "Trusted Professionals", desc: "Every cleaner is vetted, reviewed, and matched to your booking." },
  { icon: ShieldCheck, title: "Fully Insured", desc: "Professional cleaning with peace of mind for your home." },
  { icon: Sparkles, title: "Reliable & Punctual", desc: "On-time arrivals and consistent quality you can count on." },
  { icon: CalendarRange, title: "Easy Online Booking", desc: "Book your clean in minutes from any device." },
  { icon: Headphones, title: "Excellent Customer Service", desc: "Friendly support when you need help before or after a clean." },
  { icon: Star, title: "Satisfaction Guaranteed", desc: "Tell us within 24 hours if something was missed. We'll make it right." },
];

const STEPS = [
  { step: "1", title: "Book your clean", desc: "Choose your service, date, and time online in just a few minutes." },
  { step: "2", title: "Enjoy a spotless home", desc: "A trained Shalean professional arrives on time and gets the job done." },
  { step: "3", title: "Your discount is applied", desc: "Your referral discount is automatically applied at checkout on your first booking." },
];

const FAQ = [
  {
    q: "How do I get my discount?",
    a: "Your friend's referral link has already been saved. When you book your first cleaning, the discount is applied automatically at checkout — no code needed.",
  },
  {
    q: "Who can use this offer?",
    a: "This discount is for new Shalean customers booking their first paid cleaning. It cannot be combined with other offers unless stated otherwise.",
  },
  {
    q: "What services can I book?",
    a: "You can use your discount on any Shalean cleaning service available in your area — standard, deep, move-in/out, and more.",
  },
  {
    q: "Already a Shalean customer?",
    a: "This page is for friends invited by an existing customer. If you love our cleaning, you can refer others and earn Cleaning Credit from our referral program.",
  },
];

export function ReferredFriendLandingView() {
  const [bookingHref, setBookingHref] = useState(marketingHomeBookingHref());
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setBookingHref(appendStoredReferralToHref(marketingHomeBookingHref()));
  }, []);

  useEffect(() => {
    void fetch("/api/referrals/settings")
      .then((r) => r.json())
      .then((j: PublicSettings) => setSettings(j))
      .finally(() => setLoading(false));
  }, []);

  const discount = settings?.checkoutDiscountZar ?? 50;

  if (loading) {
    return (
      <div className="min-h-screen animate-pulse bg-background text-foreground">
        <div className="h-16 bg-muted" />
        <div className="mx-auto max-w-4xl px-4 py-24">
          <div className="h-12 w-2/3 rounded-xl bg-muted" />
          <div className="mt-4 h-6 w-full rounded-lg bg-muted/60" />
        </div>
      </div>
    );
  }

  if (settings && !settings.enabled) {
    return (
      <div className={cn("min-h-screen bg-background text-foreground", marketingWhatsAppFloatMainPadding)}>
        <MarketingHomeHeader bookingHref={bookingHref} />
        <main className="mx-auto max-w-lg px-4 py-24 text-center">
          <h1 className="text-2xl font-bold text-foreground">Referral offer unavailable</h1>
          <p className="mt-2 text-muted-foreground">Our referral program is temporarily paused. You can still book a cleaning with us.</p>
          <Button asChild className="mt-6 rounded-xl"><Link href={bookingHref}>Book a Cleaning</Link></Button>
        </main>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className={cn("min-h-screen bg-background text-foreground", marketingWhatsAppFloatMainPadding)}>
      <MarketingHomeHeader bookingHref={bookingHref} />

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white">
        <div className="absolute inset-0 opacity-20">
          <Image src={marketingHeroImage("professional-cleaner-cape-town.webp")} alt="" fill className="object-cover" priority />
        </div>
        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:py-24 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-blue-200">You&apos;ve been invited</p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
              Your friend invited you to try Shalean
            </h1>
            <p className="mt-4 text-lg text-blue-100">
              Book your first professional cleaning and get <strong>R {discount} off</strong> at checkout.
              Your referral is already saved — just book and go.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button
                size="lg"
                variant="outline"
                className="rounded-xl border-white bg-white font-semibold !text-blue-700 shadow-md hover:bg-blue-50 hover:!text-blue-800"
                asChild
              >
                <Link href={bookingHref}>Book Your First Clean</Link>
              </Button>
            </div>
          </div>
          <div className="hidden lg:block">
            <div className="rounded-3xl border border-white/20 bg-white/10 p-8 backdrop-blur">
              <Gift className="h-12 w-12 text-amber-300" />
              <p className="mt-4 text-3xl font-bold">R {discount} off</p>
              <p className="text-blue-100">Your first Shalean cleaning</p>
              <p className="mt-3 text-sm text-blue-200">Applied automatically at checkout</p>
            </div>
          </div>
        </div>
      </section>

      {/* Offer details */}
      <section className="border-b border-gray-100 py-16">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="text-2xl font-bold text-gray-900 sm:text-3xl">Welcome — here&apos;s your offer</h2>
          <p className="mt-4 text-gray-600">
            A friend thinks you&apos;ll love a professionally cleaned home. As a thank-you for trying Shalean,
            you get <strong>R {discount} off your first booking</strong>. Your friend earns Cleaning Credit when you complete your first paid clean.
          </p>
          <ul className="mt-8 space-y-2 text-left text-sm text-gray-500">
            {[
              "Discount applied automatically — no promo code to enter",
              "Valid on your first paid Shalean booking",
              `Your friend earns R ${settings?.rewardAmountZar ?? 50} Cleaning Credit after you book`,
            ].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-gray-50 py-16">
        <div className="mx-auto max-w-7xl px-4">
          <h2 className="text-center text-2xl font-bold text-gray-900">How It Works</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.step} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition hover:shadow-md">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                  {s.step}
                </div>
                <h3 className="mt-4 font-semibold text-gray-900">{s.title}</h3>
                <p className="mt-1 text-sm text-gray-500">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Shalean */}
      <section className="py-16">
        <div className="mx-auto max-w-7xl px-4">
          <h2 className="text-center text-2xl font-bold text-gray-900">Why You&apos;ll Love Shalean</h2>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {WHY_FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <li key={f.title} className="rounded-2xl border border-gray-100 p-5 shadow-sm transition hover:border-blue-100 hover:shadow-md">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-3 font-semibold text-gray-900">{f.title}</h3>
                  <p className="mt-1 text-sm text-gray-500">{f.desc}</p>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {settings?.promotionalText ? (
        <section className="border-t border-gray-100 py-8">
          <div className="mx-auto max-w-3xl px-4">
            <div className="rounded-2xl border border-amber-100 bg-amber-50 p-5 text-sm text-amber-900">
              {settings.promotionalText}
            </div>
          </div>
        </section>
      ) : null}

      {/* FAQ */}
      <section className="border-t border-gray-100 py-16">
        <div className="mx-auto max-w-3xl px-4">
          <h2 className="text-center text-2xl font-bold text-gray-900">Frequently Asked Questions</h2>
          <dl className="mt-8 space-y-4">
            {FAQ.map((item) => (
              <div key={item.q} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <dt className="font-semibold text-gray-900">{item.q}</dt>
                <dd className="mt-2 text-sm text-gray-600">{item.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="bg-blue-600 py-16 text-white">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="text-2xl font-bold sm:text-3xl">Ready for a spotless home?</h2>
          <p className="mt-3 text-blue-100">
            Book your first clean today and save R {discount}. Your referral discount is already waiting for you at checkout.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button
              size="lg"
              variant="outline"
              className="rounded-xl border-white bg-white font-semibold !text-blue-700 shadow-md hover:bg-blue-50 hover:!text-blue-800"
              asChild
            >
              <Link href={bookingHref}>Book Your First Clean</Link>
            </Button>
            <Button size="lg" variant="outline" className="rounded-xl border-white/40 text-white hover:bg-white/10" asChild>
              <Link href="/refer">Refer friends & earn credit</Link>
            </Button>
          </div>
        </div>
      </section>

      {settings?.termsAndConditions ? (
        <section className="border-t border-gray-100 py-8">
          <div className="mx-auto max-w-3xl px-4 text-xs text-gray-500">
            <h3 className="mb-2 font-semibold text-gray-700">Terms & Conditions</h3>
            <div className="whitespace-pre-wrap">{settings.termsAndConditions}</div>
          </div>
        </section>
      ) : null}

      <SiteFooter />
    </div>
  );
}
