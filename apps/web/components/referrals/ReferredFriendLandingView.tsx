"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, CheckCircle2, ShieldCheck } from "lucide-react";
import { PromotionFooter } from "@/components/marketing/PromotionFooter";
import { PromotionHeader } from "@/components/marketing/PromotionHeader";
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
      <div className="min-h-screen bg-white text-foreground">
        <PromotionHeader signInHref={loginHref} />
        <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-[var(--ui-page-gutter)] py-12 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-[#00164e]">Referral offer unavailable</h1>
          <p className="mt-3 text-slate-600">Our referral program is temporarily paused. You can still explore Shalean cleaning services.</p>
          <Link href="/services" className="mt-6 inline-flex min-h-12 items-center justify-center rounded-md bg-[#0051ff] px-6 text-sm font-semibold text-white hover:bg-[#0033a1]">
            View services
          </Link>
        </main>
        <PromotionFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-foreground">
      <PromotionHeader signInHref={loginHref} />

      <main>
        <section className="relative isolate overflow-hidden bg-[#00164e] text-white">
          <div className="absolute inset-0 -z-10">
            <Image
              src={marketingHeroImage("homepage-hero-cleaning-team-cape-town.webp")}
              alt=""
              fill
              priority
              sizes="100vw"
              className="object-cover object-[68%_center] md:object-center"
            />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,22,78,0.99)_0%,rgba(0,51,161,0.92)_52%,rgba(0,22,78,0.22)_100%)]" />
          </div>

          <div className="mx-auto flex min-h-[360px] w-full max-w-[var(--ui-container-marketing)] items-center px-[var(--ui-page-gutter)] py-10 md:min-h-[390px] md:py-12">
            <div className="max-w-3xl">
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em]">
                <Check className="h-4 w-4" aria-hidden /> Your referral is saved
              </p>
              <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-[1.04] tracking-[-0.04em] sm:text-5xl lg:text-6xl">
                Get R{discount} off your first clean
              </h1>
              <p className="mt-4 max-w-xl text-base leading-7 text-white/90 md:text-lg">
                Create your account and book any eligible Shalean cleaning service. Your referral benefit is applied automatically at checkout.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
                <Link href={signupHref} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-[#0051ff] px-7 text-sm font-semibold text-white shadow-lg transition hover:bg-[#0033a1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                  Create account
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
                <Link href={loginHref} className="text-sm font-semibold text-white underline-offset-4 hover:underline">
                  Already registered? Sign in
                </Link>
              </div>
              <p className="mt-4 flex items-center gap-2 text-xs text-white/80">
                <ShieldCheck className="h-4 w-4" aria-hidden /> Secure account and online booking
              </p>
            </div>
          </div>
        </section>

        <section className="bg-[#f7f9fc] py-9 md:py-10">
          <div className="mx-auto max-w-[var(--ui-container-marketing)] px-[var(--ui-page-gutter)]">
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0051ff]">Three simple steps</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#00164e]">Create, book and enjoy your clean</h2>
            </div>
            <ol className="mt-6 grid gap-3 md:grid-cols-3">
              {[
                ["1", "Create your account", "Your saved invitation follows you into signup."],
                ["2", "Book your service", `Choose an eligible clean and receive R${discount} off at checkout.`],
                ["3", "Complete the clean", `After completion and confirmed payment, your friend receives R${reward} Cleaning Credit.`],
              ].map(([step, title, description]) => (
                <li key={step} className="rounded-xl border border-[#dfe7f5] bg-white p-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0051ff] text-sm font-semibold text-white">{step}</span>
                    <h3 className="font-semibold text-[#00164e]">{title}</h3>
                  </div>
                  <p className="mt-3 text-sm leading-5 text-slate-600">{description}</p>
                </li>
              ))}
            </ol>
            <p className="mx-auto mt-4 flex max-w-2xl items-center justify-center gap-2 text-center text-xs font-medium text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden /> No promotional code required.
            </p>
          </div>
        </section>

        <section className="bg-[#0051ff] py-7 text-white md:py-8">
          <div className="mx-auto flex max-w-[var(--ui-container-marketing)] flex-col items-center justify-between gap-5 px-[var(--ui-page-gutter)] text-center md:flex-row md:text-left">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Ready to book your first clean?</h2>
              <p className="mt-1 text-sm text-white/90">Create your account and keep your R{discount} referral benefit.</p>
            </div>
            <Link href={signupHref} className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-md bg-white px-7 text-sm font-semibold text-[#0033a1] transition hover:bg-blue-50">
              Create account
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </section>
      </main>

      <PromotionFooter />
    </div>
  );
}
