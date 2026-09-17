"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CalendarRange,
  Check,
  CheckCircle2,
  Gift,
  Headphones,
  ShieldCheck,
  Sparkles,
  Star,
  UserPlus,
} from "lucide-react";
import { MarketingHomeHeader } from "@/components/marketing-home/MarketingHomeHeader";
import { SiteFooter } from "@/components/nav/SiteFooter";
import { marketingHeroImage, marketingHomeBookingHref } from "@/lib/marketing/marketingHomeAssets";
import { marketingWhatsAppFloatMainPadding } from "@/lib/marketing/marketingMobileLayout";
import { appendStoredReferralToHref } from "@/lib/referrals/client";
import { buildReferralAuthHref } from "@/lib/referrals/referralInviteJourney";
import { cn } from "@/lib/utils";

type PublicSettings = {
  enabled: boolean;
  rewardAmountZar: number;
  checkoutDiscountZar: number;
  promotionalText: string | null;
  termsAndConditions: string | null;
};

const WHY_FEATURES = [
  { icon: ShieldCheck, title: "Vetted professionals", desc: "Every cleaner is screened and matched to your booking." },
  { icon: Sparkles, title: "Reliable service", desc: "Clear booking details and consistent care for your space." },
  { icon: CalendarRange, title: "Easy online booking", desc: "Choose your service, date and time from any device." },
  { icon: Headphones, title: "Local support", desc: "Our Cape Town team is available before and after your clean." },
  { icon: Star, title: "Satisfaction support", desc: "Tell us promptly if something was missed so we can help." },
  { icon: Gift, title: "Automatic referral saving", desc: "Your invitation stays attached through account creation and checkout." },
] as const;

const FAQ = [
  {
    q: "Why do I need an account?",
    a: "Your account keeps the invitation attached to you, lets you manage the booking and protects the referral benefit.",
  },
  {
    q: "How do I get the discount?",
    a: "Create or sign in to your Shalean account from this page. The saved referral is checked automatically at checkout on your eligible first booking.",
  },
  {
    q: "Who can use this offer?",
    a: "The offer is for eligible new Shalean customers making their first paid cleaning booking. Other offer rules may apply.",
  },
  {
    q: "When does my friend receive Cleaning Credit?",
    a: "Your friend receives Cleaning Credit once your first eligible booking has been completed and the payment is confirmed.",
  },
] as const;

export function ReferredFriendLandingView() {
  const [bookingHref, setBookingHref] = useState(marketingHomeBookingHref());
  const [settings, setSettings] = useState<PublicSettings | null>(null);

  useEffect(() => {
    setBookingHref(appendStoredReferralToHref(marketingHomeBookingHref()));
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    void fetch("/api/referrals/settings", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Referral settings unavailable");
        return response.json() as Promise<PublicSettings>;
      })
      .then(setSettings)
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setSettings(null);
        }
      });

    return () => controller.abort();
  }, []);

  const signupHref = useMemo(() => buildReferralAuthHref("signup", bookingHref), [bookingHref]);
  const loginHref = useMemo(() => buildReferralAuthHref("login", bookingHref), [bookingHref]);
  const discount = settings?.checkoutDiscountZar ?? 50;
  const reward = settings?.rewardAmountZar ?? 50;

  if (settings?.enabled === false) {
    return (
      <div className={cn("min-h-screen bg-background text-foreground", marketingWhatsAppFloatMainPadding)}>
        <MarketingHomeHeader bookingHref={bookingHref} />
        <main className="mx-auto max-w-xl px-[var(--ui-page-gutter)] py-24 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-[#00164e]">Referral offer unavailable</h1>
          <p className="mt-3 text-muted-foreground">
            Our referral program is temporarily paused. You can still explore Shalean cleaning services.
          </p>
          <Link
            href="/services"
            className="mt-7 inline-flex min-h-12 items-center justify-center rounded-md bg-[#0051ff] px-6 text-sm font-semibold uppercase tracking-wide text-white hover:bg-[#0033a1]"
          >
            View services
          </Link>
        </main>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className={cn("min-h-screen bg-background text-foreground", marketingWhatsAppFloatMainPadding)}>
      <MarketingHomeHeader bookingHref={bookingHref} />

      <main>
        <section className="relative isolate overflow-hidden bg-[#00164e] text-white">
          <div className="absolute inset-0 -z-10">
            <Image
              src={marketingHeroImage("homepage-hero-cleaning-team-cape-town.webp")}
              alt=""
              fill
              priority
              sizes="100vw"
              className="object-cover object-center"
            />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,22,78,0.98)_0%,rgba(0,51,161,0.92)_48%,rgba(0,22,78,0.4)_100%)]" />
          </div>

          <div className="mx-auto grid w-full max-w-[var(--ui-container-marketing)] gap-10 px-[var(--ui-page-gutter)] py-16 md:py-20 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-center lg:py-24">
            <div className="max-w-2xl">
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em]">
                <Check className="h-4 w-4" aria-hidden /> Your invitation is saved
              </p>
              <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-[-0.04em] sm:text-5xl">
                Create your account and get R {discount} off your first clean
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-white/90 md:text-lg">
                A friend invited you to Shalean. Create your account first, then book when you are ready. Your referral stays attached automatically.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href={signupHref}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-[#0051ff] px-6 text-sm font-semibold uppercase tracking-wide text-white shadow-lg transition hover:bg-[#0033a1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  Create account
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
                <Link
                  href={loginHref}
                  className="inline-flex min-h-12 items-center justify-center rounded-md border border-white/50 bg-white/10 px-6 text-sm font-semibold uppercase tracking-wide text-white backdrop-blur transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  Already have an account? Sign in
                </Link>
              </div>
            </div>

            <aside className="rounded-2xl border border-white/20 bg-white/10 p-7 shadow-2xl backdrop-blur-md" aria-label="Referral offer">
              <Gift className="h-10 w-10 text-[#ffd166]" aria-hidden />
              <p className="mt-5 text-sm font-medium uppercase tracking-wide text-white/75">Your first-clean offer</p>
              <p className="mt-1 text-4xl font-semibold">R {discount} off</p>
              <p className="mt-3 text-sm leading-6 text-white/80">
                Applied automatically at checkout when the referral and first-booking eligibility checks pass.
              </p>
            </aside>
          </div>
        </section>

        <section className="border-b border-border bg-white py-16">
          <div className="mx-auto max-w-[var(--ui-container-marketing)] px-[var(--ui-page-gutter)]">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0051ff]">Simple and protected</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[#00164e]">How your invitation works</h2>
            </div>
            <ol className="mt-10 grid gap-5 md:grid-cols-3">
              {[
                ["1", "Create your account", "Use the button above so the saved invitation follows you into signup."],
                ["2", "Book your first clean", `Choose an eligible service. Your R ${discount} benefit is checked at checkout.`],
                ["3", "Complete the paid clean", `After completion and confirmed payment, your friend receives R ${reward} Cleaning Credit.`],
              ].map(([step, title, description]) => (
                <li key={step} className="rounded-xl border border-[#dfe7f5] bg-[#f7faff] p-6">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0051ff] text-sm font-semibold text-white">{step}</span>
                  <h3 className="mt-5 text-lg font-semibold text-[#00164e]">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
                </li>
              ))}
            </ol>
            <div className="mx-auto mt-8 max-w-3xl rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-900">
              <CheckCircle2 className="mr-2 inline h-4 w-4" aria-hidden />
              No promo code to type. Keep using this browser until your booking is complete.
            </div>
          </div>
        </section>

        <section className="bg-[#f7f9fc] py-16">
          <div className="mx-auto max-w-[var(--ui-container-marketing)] px-[var(--ui-page-gutter)]">
            <h2 className="text-center text-3xl font-semibold tracking-tight text-[#00164e]">Why choose Shalean</h2>
            <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {WHY_FEATURES.map(({ icon: Icon, title, desc }) => (
                <li key={title} className="rounded-xl border border-[#dfe7f5] bg-white p-5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#eaf1ff] text-[#0051ff]">
                    <Icon className="h-5 w-5" aria-hidden />
                  </div>
                  <h3 className="mt-4 font-semibold text-[#00164e]">{title}</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{desc}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {settings?.promotionalText ? (
          <section className="border-t border-border bg-white py-8">
            <div className="mx-auto max-w-3xl px-[var(--ui-page-gutter)]">
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">{settings.promotionalText}</div>
            </div>
          </section>
        ) : null}

        <section className="bg-white py-16">
          <div className="mx-auto max-w-3xl px-[var(--ui-page-gutter)]">
            <h2 className="text-center text-3xl font-semibold tracking-tight text-[#00164e]">Frequently asked questions</h2>
            <dl className="mt-8 divide-y divide-[#dfe7f5] rounded-xl border border-[#dfe7f5]">
              {FAQ.map(({ q, a }) => (
                <div key={q} className="p-5 sm:p-6">
                  <dt className="font-semibold text-[#00164e]">{q}</dt>
                  <dd className="mt-2 text-sm leading-6 text-slate-600">{a}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="bg-[#0051ff] py-14 text-white">
          <div className="mx-auto max-w-3xl px-[var(--ui-page-gutter)] text-center">
            <UserPlus className="mx-auto h-9 w-9" aria-hidden />
            <h2 className="mt-4 text-3xl font-semibold tracking-tight">Ready to use your invitation?</h2>
            <p className="mt-3 text-white/85">Create your account now. You can choose and book your cleaning next.</p>
            <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href={signupHref} className="inline-flex min-h-12 items-center justify-center rounded-md bg-white px-6 text-sm font-semibold uppercase tracking-wide text-[#0033a1] hover:bg-blue-50">
                Create account
              </Link>
              <Link href={loginHref} className="inline-flex min-h-12 items-center justify-center rounded-md border border-white/60 px-6 text-sm font-semibold uppercase tracking-wide text-white hover:bg-white/10">
                Sign in
              </Link>
            </div>
          </div>
        </section>

        {settings?.termsAndConditions ? (
          <section className="border-t border-border bg-white py-8">
            <div className="mx-auto max-w-3xl px-[var(--ui-page-gutter)] text-xs leading-5 text-slate-500">
              <h2 className="mb-2 font-semibold text-slate-700">Terms and conditions</h2>
              <div className="whitespace-pre-wrap">{settings.termsAndConditions}</div>
            </div>
          </section>
        ) : null}
      </main>

      <SiteFooter />
    </div>
  );
}
