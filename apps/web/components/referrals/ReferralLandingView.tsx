"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, CheckCircle2, Copy, Gift, MessageCircle, Share2, Users } from "lucide-react";
import { PromotionFooter } from "@/components/marketing/PromotionFooter";
import { PromotionHeader } from "@/components/marketing/PromotionHeader";
import { ReferralForm } from "@/components/referrals/ReferralForm";
import { Button } from "@/components/ui/button";
import { useReferralShareUrl } from "@/hooks/useReferralShareUrl";
import { marketingHeroImage, marketingHomeBookingHref } from "@/lib/marketing/marketingHomeAssets";
import {
  facebookSharerHref,
  isLocalReferralOrigin,
  toPublicReferralShareUrl,
  whatsAppShareHref,
} from "@/lib/referrals/referralShareUrls";

type PublicSettings = {
  enabled: boolean;
  rewardAmountZar: number;
  heroHeadline: string;
  heroSubheading: string;
  promotionalText: string | null;
  termsAndConditions: string | null;
};

const loginHref = "/auth/login?redirect=%2Frefer&intent=customer";

export function ReferralLandingView() {
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [copied, setCopied] = useState(false);
  const { shareUrl, ready: shareUrlReady, refCode } = useReferralShareUrl();

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

  const reward = settings?.rewardAmountZar ?? 50;
  const sharingFromLocalhost =
    shareUrlReady && typeof window !== "undefined" && isLocalReferralOrigin(window.location.origin);
  const publicShareUrl = shareUrlReady ? toPublicReferralShareUrl(shareUrl) : "";

  function scrollToForm() {
    document.getElementById("referral-form")?.scrollIntoView({ behavior: "smooth" });
  }

  function copyLink() {
    if (!shareUrlReady) return;
    void navigator.clipboard.writeText(publicShareUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  }

  function shareWhatsApp() {
    if (!shareUrlReady) return;
    const message = `Get R${reward} off your first Shalean cleaning: ${publicShareUrl}`;
    window.open(whatsAppShareHref(message), "_blank", "noopener,noreferrer");
  }

  function shareFacebook() {
    if (!shareUrlReady) return;
    window.open(facebookSharerHref(publicShareUrl), "_blank", "noopener,noreferrer,width=600,height=400");
  }

  if (settings?.enabled === false) {
    return (
      <div className="min-h-screen bg-white text-foreground">
        <PromotionHeader signInHref={loginHref} />
        <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-[var(--ui-page-gutter)] py-12 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-[#00164e]">Referral program paused</h1>
          <p className="mt-3 text-slate-600">Our referral program is temporarily unavailable. Please check back soon.</p>
          <Link href={marketingHomeBookingHref()} className="mt-6 inline-flex min-h-12 items-center justify-center rounded-md bg-[#0051ff] px-6 text-sm font-semibold text-white hover:bg-[#0033a1]">
            Book a cleaning
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
              className="object-cover object-center"
            />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,22,78,0.99)_0%,rgba(0,51,161,0.93)_55%,rgba(0,22,78,0.28)_100%)]" />
          </div>

          <div className="mx-auto flex min-h-[330px] w-full max-w-[var(--ui-container-marketing)] items-center px-[var(--ui-page-gutter)] py-10 md:min-h-[360px]">
            <div className="max-w-3xl">
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em]">
                <Check className="h-4 w-4" aria-hidden /> Shalean referral program
              </p>
              <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-[1.04] tracking-[-0.04em] sm:text-5xl lg:text-6xl">
                Share Shalean. Earn R{reward} Cleaning Credit.
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-white/90 md:text-lg">
                Invite a friend to book their first clean. After their eligible booking is completed and paid, your credit is added automatically.
              </p>
              <button
                type="button"
                onClick={scrollToForm}
                className="mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-[#0051ff] px-7 text-sm font-semibold text-white shadow-lg transition hover:bg-[#0033a1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                Refer a friend
                <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>
        </section>

        <section id="referral-form" className="scroll-mt-6 bg-[#f7f9fc] py-10 md:py-12">
          <div className="mx-auto max-w-[var(--ui-container-marketing)] px-[var(--ui-page-gutter)]">
            <div className="mb-7 text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0051ff]">Invite and share</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#00164e] md:text-3xl">Send your referral in minutes</h2>
              <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-600">
                Use the form for a direct invitation or share your personal link yourself.
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-5 lg:items-start">
              <div className="lg:col-span-3">
                <ReferralForm rewardAmountZar={reward} />
              </div>

              <aside className="rounded-xl border border-[#dfe7f5] bg-white p-5 shadow-sm lg:col-span-2" aria-labelledby="share-referral-title">
                <h3 id="share-referral-title" className="text-lg font-semibold text-[#00164e]">Share your referral link</h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Your friend opens this link, creates an account and books their first eligible clean.
                </p>
                {refCode ? (
                  <p className="mt-3 text-xs font-medium text-[#0051ff]">
                    Referral code: {refCode}
                  </p>
                ) : null}
                {shareUrlReady ? (
                  <p className="mt-3 truncate rounded-md bg-[#f7f9fc] px-3 py-2 font-mono text-xs text-slate-600" title={publicShareUrl}>
                    {publicShareUrl}
                  </p>
                ) : (
                  <p className="mt-3 text-xs text-slate-500">Sign in to load your personal referral link.</p>
                )}
                {sharingFromLocalhost ? (
                  <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950">
                    Social sharing uses your public shalean.co.za link because other people cannot open localhost.
                  </p>
                ) : null}
                <div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
                  <Button type="button" variant="outline" className="min-h-11 justify-start rounded-md" onClick={shareWhatsApp} disabled={!shareUrlReady}>
                    <MessageCircle className="mr-2 h-4 w-4 text-emerald-600" aria-hidden /> WhatsApp
                  </Button>
                  <Button type="button" variant="outline" className="min-h-11 justify-start rounded-md" onClick={shareFacebook} disabled={!shareUrlReady}>
                    <Share2 className="mr-2 h-4 w-4 text-[#0051ff]" aria-hidden /> Facebook
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 justify-start rounded-md text-slate-900"
                    onClick={copyLink}
                    disabled={!shareUrlReady}
                    aria-label={copied ? "Referral link copied" : "Copy referral link"}
                  >
                    <Copy className="mr-2 h-4 w-4 text-[#0051ff]" aria-hidden />
                    {copied ? "Copied" : "Copy link"}
                  </Button>
                </div>
                {settings?.promotionalText ? (
                  <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
                    {settings.promotionalText}
                  </p>
                ) : null}
              </aside>
            </div>
          </div>
        </section>

        <section className="bg-white py-9 md:py-10">
          <div className="mx-auto max-w-[var(--ui-container-marketing)] px-[var(--ui-page-gutter)]">
            <h2 className="text-center text-2xl font-semibold tracking-tight text-[#00164e]">How rewards work</h2>
            <ol className="mt-6 grid gap-3 md:grid-cols-3">
              {[
                [Users, "1", "Share your referral", "Send the personal link or submit the invitation form."],
                [CheckCircle2, "2", "Your friend completes a clean", "Their first eligible booking must be completed and fully paid."],
                [Gift, "3", `Receive R${reward} credit`, "Cleaning Credit is added to your account for a future booking."],
              ].map(([Icon, step, title, description]) => {
                const StepIcon = Icon as typeof Users;
                return (
                  <li key={String(step)} className="rounded-xl border border-[#dfe7f5] bg-[#f7f9fc] p-4">
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0051ff] text-sm font-semibold text-white">{String(step)}</span>
                      <StepIcon className="h-5 w-5 text-[#0051ff]" aria-hidden />
                      <h3 className="font-semibold text-[#00164e]">{String(title)}</h3>
                    </div>
                    <p className="mt-3 text-sm leading-5 text-slate-600">{String(description)}</p>
                  </li>
                );
              })}
            </ol>
            <p className="mx-auto mt-4 max-w-2xl text-center text-xs font-medium text-slate-600">
              Cleaning Credit is not cash, is not transferable and is issued only after the qualifying booking is completed and paid.
            </p>
          </div>
        </section>
      </main>

      <PromotionFooter />
    </div>
  );
}
