"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, CheckCircle2, Gift, ShieldCheck, UserPlus } from "lucide-react";
import { MarketingHomeHeader } from "@/components/marketing-home/MarketingHomeHeader";
import { PromotionFooter } from "@/components/marketing/PromotionFooter";
import { marketingHeroImage, marketingHomeBookingHref } from "@/lib/marketing/marketingHomeAssets";
import { appendStoredReferralToHref } from "@/lib/referrals/client";
import { buildReferralAuthHref } from "@/lib/referrals/referralInviteJourney";

type PublicSettings = {
  enabled: boolean;
  rewardAmountZar: number;
  checkoutDiscountZar: number;
  promotionalText: string | null;
  termsAndConditions: string | null;
};

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
        if (!(error instanceof DOMException && error.name === "AbortError")) setSettings(null);
      });

    return () => controller.abort();
  }, []);

  const signupHref = useMemo(() => buildReferralAuthHref("signup", bookingHref), [bookingHref]);
  const loginHref = useMemo(() => buildReferralAuthHref("login", bookingHref), [bookingHref]);
  const discount = settings?.checkoutDiscountZar ?? 50;
  const reward = settings?.rewardAmountZar ?? 50;

  if (settings?.enabled === false) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <MarketingHomeHeader bookingHref={bookingHref} />
        <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-[var(--ui-page-gutter)] py-16 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-[#00164e]">Referral offer unavailable</h1>
          <p className="mt-3 text-slate-600">Our referral program is temporarily paused. You can still explore Shalean cleaning services.</p>
          <Link href="/services" className="mt-7 inline-flex min-h-12 items-center justify-center rounded-md bg-[#0051ff] px-6 text-sm font-semibold uppercase tracking-wide text-white hover:bg-[#0033a1]">
            View services
          </Link>
        </main>
        <PromotionFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-foreground">
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
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,22,78,0.99)_0%,rgba(0,51,161,0.94)_52%,rgba(0,22,78,0.42)_100%)]" />
          </div>

          <div className="mx-auto grid w-full max-w-[var(--ui-container-marketing)] gap-8 px-[var(--ui-page-gutter)] py-12 md:py-16 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-center">
            <div className="max-w-2xl">
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em]">
                <Check className="h-4 w-4" aria-hidden /> Your referral is saved
              </p>
              <h1 className="mt-4 text-4xl font-semibold leading-[1.05] tracking-[-0.04em] sm:text-5xl">
                Get R {discount} off your first Shalean clean
              </h1>
              <p className="mt-4 max-w-xl text-base leading-7 text-white/90 md:text-lg">
                Create your account, choose a service and book online. Your referral benefit stays attached automatically.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Link href={signupHref} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-[#0051ff] px-7 text-sm font-semibold uppercase tracking-wide text-white shadow-lg transition hover:bg-[#0033a1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                  Create account
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
                <Link href={loginHref} className="inline-flex min-h-12 items-center justify-center rounded-md border border-white/50 bg-white/10 px-6 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                  Already registered? Sign in
                </Link>
              </div>
              <p className="mt-4 flex items-center gap-2 text-xs text-white/75">
                <ShieldCheck className="h-4 w-4" aria-hidden /> Secure account and online booking
              </p>
            </div>

            <aside className="rounded-2xl border border-white/20 bg-white/10 p-6 shadow-2xl backdrop-blur-md" aria-label="Referral offer">
              <Gift className="h-9 w-9 text-[#ffd166]" aria-hidden />
              <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-white/70">First-clean offer</p>
              <p className="mt-1 text-4xl font-semibold">R {discount} off</p>
              <p className="mt-3 text-sm leading-6 text-white/80">Checked and applied automatically at checkout when eligible.</p>
            </aside>
          </div>
        </section>

        <section className="bg-[#f7f9fc] py-12 md:py-14">
          <div className="mx-auto max-w-[var(--ui-container-marketing)] px-[var(--ui-page-gutter)]">
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0051ff]">Three simple steps</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#00164e] md:text-3xl">Create, book and enjoy your clean</h2>
            </div>
            <ol className="mt-8 grid gap-4 md:grid-cols-3">
              {[
                ["1", "Create your account", "Your saved invitation follows you into signup."],
                ["2", "Book your service", `Choose an eligible clean and receive R ${discount} off at checkout.`],
                ["3", "Complete the clean", `After completion and confirmed payment, your friend receives R ${reward} Cleaning Credit.`],
              ].map(([step, title, description]) => (
                <li key={step} className="rounded-xl border border-[#dfe7f5] bg-white p-5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0051ff] text-sm font-semibold text-white">{step}</span>
                  <h3 className="mt-4 font-semibold text-[#00164e]">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
                </li>
              ))}
            </ol>
            <p className="mx-auto mt-5 flex max-w-2xl items-center justify-center gap-2 text-center text-xs text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden /> No promotional code to enter. Continue in this browser when booking.
            </p>
          </div>
        </section>

        <section className="bg-[#0051ff] py-10 text-white md:py-12">
          <div className="mx-auto max-w-2xl px-[var(--ui-page-gutter)] text-center">
            <UserPlus className="mx-auto h-8 w-8" aria-hidden />
            <h2 className="mt-3 text-2xl font-semibold tracking-tight md:text-3xl">Ready to book your first clean?</h2>
            <p className="mt-2 text-sm text-white/85">Create your Shalean account and keep your R {discount} referral benefit.</p>
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href={signupHref} className="inline-flex min-h-12 items-center justify-center rounded-md bg-white px-7 text-sm font-semibold uppercase tracking-wide text-[#0033a1] hover:bg-blue-50">
                Create account
              </Link>
              <Link href={loginHref} className="inline-flex min-h-12 items-center justify-center rounded-md border border-white/60 px-6 text-sm font-semibold text-white hover:bg-white/10">
                Sign in
              </Link>
            </div>
            <p className="mt-4 text-[11px] leading-5 text-white/65">
              Offer eligibility is confirmed at checkout. Referral credit is issued after the first eligible booking is completed and paid.
            </p>
          </div>
        </section>
      </main>

      <PromotionFooter />
    </div>
  );
}
