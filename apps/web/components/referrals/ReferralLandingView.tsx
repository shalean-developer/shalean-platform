"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowDown,
  CalendarRange,
  CheckCircle2,
  Copy,
  Gift,
  Headphones,
  MessageCircle,
  Share2,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
} from "lucide-react";
import { FooterSection } from "@/components/home/sections/FooterSection";
import { MarketingHomeHeader } from "@/components/marketing-home/MarketingHomeHeader";
import { ReferralForm } from "@/components/referrals/ReferralForm";
import { Button } from "@/components/ui/button";
import { marketingHeroImage, marketingHomeBookingHref } from "@/lib/marketing/marketingHomeAssets";
import { marketingWhatsAppFloatMainPadding } from "@/lib/marketing/marketingMobileLayout";
import { useReferralShareUrl } from "@/hooks/useReferralShareUrl";
import {
  facebookSharerHref,
  isLocalReferralOrigin,
  toPublicReferralShareUrl,
  whatsAppShareHref,
} from "@/lib/referrals/referralShareUrls";
import { cn } from "@/lib/utils";

type PublicSettings = {
  enabled: boolean;
  rewardAmountZar: number;
  heroHeadline: string;
  heroSubheading: string;
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

const FAQ = [
  {
    q: "When do I receive my reward?",
    a: "Cleaning Credit is added to your account automatically after your referred friend completes their first cleaning and payment is fully received.",
  },
  {
    q: "Can I refer multiple people?",
    a: "Yes! You can refer as many friends as you like. Each successful referral earns you Cleaning Credit towards your next booking.",
  },
  {
    q: "Can I refer businesses?",
    a: "Absolutely. Offices, Airbnb hosts, and commercial spaces are welcome. Refer anyone who would benefit from professional cleaning.",
  },
  {
    q: "What happens if they don't book?",
    a: "No reward is issued until your friend completes and pays for their first booking. There's no penalty if they don't book.",
  },
  {
    q: "How do I use my Cleaning Credit?",
    a: "Your Cleaning Credit balance is available on your account and can be applied towards future Shalean bookings. It cannot be exchanged for cash.",
  },
];

const STEPS = [
  { step: "1", icon: Users, title: "Refer a Friend", desc: "Complete the referral form with your friend's details." },
  { step: "2", icon: CalendarRange, title: "They Book", desc: "Your friend books and completes their first cleaning." },
  { step: "3", icon: Gift, title: "Earn Your Reward", desc: "Cleaning Credit is automatically added to your account." },
];

export function ReferralLandingView() {
  const bookingHref = marketingHomeBookingHref();
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const { shareUrl, ready: shareUrlReady, refCode } = useReferralShareUrl();

  useEffect(() => {
    void fetch("/api/referrals/settings")
      .then((r) => r.json())
      .then((j: PublicSettings) => setSettings(j))
      .finally(() => setLoading(false));
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
    setTimeout(() => setCopied(false), 2500);
  }

  function shareWhatsApp() {
    if (!shareUrlReady) return;
    const publicUrl = toPublicReferralShareUrl(shareUrl);
    const msg = `Get professional cleaning from Shalean. Refer friends and earn R${reward} Cleaning Credit! ${publicUrl}`;
    window.open(whatsAppShareHref(msg), "_blank", "noopener,noreferrer");
  }

  function shareFacebook() {
    if (!shareUrlReady) return;
    window.open(facebookSharerHref(shareUrl), "_blank", "noopener,noreferrer,width=600,height=400");
  }

  if (loading) {
    return (
      <div className="min-h-screen animate-pulse bg-white">
        <div className="h-16 bg-gray-100" />
        <div className="mx-auto max-w-4xl px-4 py-24">
          <div className="h-12 w-2/3 rounded-xl bg-gray-100" />
          <div className="mt-4 h-6 w-full rounded-lg bg-gray-50" />
        </div>
      </div>
    );
  }

  if (settings && !settings.enabled) {
    return (
      <div className={cn("min-h-screen bg-white", marketingWhatsAppFloatMainPadding)}>
        <MarketingHomeHeader bookingHref={bookingHref} />
        <main className="mx-auto max-w-lg px-4 py-24 text-center">
          <h1 className="text-2xl font-bold text-gray-900">Referral program paused</h1>
          <p className="mt-2 text-gray-600">Our referral program is temporarily unavailable. Please check back soon.</p>
          <Button asChild className="mt-6 rounded-xl"><Link href={marketingHomeBookingHref()}>Book a Cleaning</Link></Button>
        </main>
        <FooterSection />
      </div>
    );
  }

  return (
    <div className={cn("min-h-screen bg-white", marketingWhatsAppFloatMainPadding)}>
      <MarketingHomeHeader bookingHref={bookingHref} />

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white">
        <div className="absolute inset-0 opacity-20">
          <Image src={marketingHeroImage("professional-cleaner-cape-town.webp")} alt="" fill className="object-cover" priority />
        </div>
        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:py-24 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-blue-200">Shalean Referral Program</p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
              {settings?.heroHeadline ?? "Love Our Cleaning? Get Rewarded for Sharing Shalean!"}
            </h1>
            <p className="mt-4 text-lg text-blue-100">
              {settings?.heroSubheading}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button
                size="lg"
                variant="outline"
                className="rounded-xl border-white bg-white font-semibold !text-blue-700 shadow-md hover:bg-blue-50 hover:!text-blue-800"
                onClick={scrollToForm}
              >
                Refer a Friend
              </Button>
              <Button size="lg" variant="outline" className="rounded-xl border-white/40 bg-white/10 text-white hover:bg-white/20" asChild>
                <Link href={marketingHomeBookingHref()}>Book a Cleaning</Link>
              </Button>
            </div>
          </div>
          <div className="hidden lg:block">
            <div className="rounded-3xl border border-white/20 bg-white/10 p-8 backdrop-blur">
              <Gift className="h-12 w-12 text-amber-300" />
              <p className="mt-4 text-3xl font-bold">R {reward}</p>
              <p className="text-blue-100">Cleaning Credit per successful referral</p>
            </div>
          </div>
        </div>
      </section>

      {/* Rewards */}
      <section className="border-b border-gray-100 py-16">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="text-2xl font-bold text-gray-900 sm:text-3xl">Earn Cleaning Credit for Your Next Booking</h2>
          <p className="mt-4 text-gray-600">
            Rewards are issued as <strong>Cleaning Credit only</strong>, not cash. Credit can only be used towards future Shalean Cleaning Services bookings, after your friend&apos;s first cleaning is completed and fully paid.
          </p>
          <blockquote className="mt-8 rounded-2xl border border-blue-100 bg-blue-50 px-6 py-5 text-left text-blue-900">
            Refer a friend. They book. You earn Cleaning Credit towards your next cleaning.
          </blockquote>
          <ul className="mt-6 space-y-2 text-left text-sm text-gray-500">
            {["No cash payments or claims", "Cannot be transferred or exchanged for cash", "Issued only after first booking completed & paid"].map((t) => (
              <li key={t} className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />{t}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-gray-50 py-16">
        <div className="mx-auto max-w-7xl px-4">
          <h2 className="text-center text-2xl font-bold text-gray-900">How It Works</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <div key={s.step} className="relative">
                  <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition hover:shadow-md">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">{s.step}</div>
                    <Icon className="mt-4 h-6 w-6 text-blue-600" />
                    <h3 className="mt-3 font-semibold text-gray-900">{s.title}</h3>
                    <p className="mt-1 text-sm text-gray-500">{s.desc}</p>
                  </div>
                  {i < STEPS.length - 1 ? (
                    <ArrowDown className="absolute -bottom-5 left-1/2 hidden h-5 w-5 -translate-x-1/2 text-gray-300 md:block lg:hidden" />
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Why Shalean */}
      <section className="py-16">
        <div className="mx-auto max-w-7xl px-4">
          <h2 className="text-center text-2xl font-bold text-gray-900">Why Recommend Shalean</h2>
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

      {/* Form + sharing */}
      <section id="referral-form" className="scroll-mt-20 bg-gradient-to-b from-blue-50/50 to-white py-16">
        <div className="mx-auto max-w-7xl px-4">
          <div className="grid gap-10 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <ReferralForm rewardAmountZar={reward} />
            </div>
            <div className="space-y-4 lg:col-span-2">
              <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                <h3 className="font-semibold text-gray-900">Share this page</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Spread the word on social media or copy your link.
                  {refCode ? (
                    <span className="mt-1 block text-xs text-blue-600">
                      Your referral code <strong>{refCode}</strong> is included in the link.
                    </span>
                  ) : null}
                </p>
                {shareUrlReady ? (
                  <p className="mt-3 truncate rounded-lg bg-gray-50 px-3 py-2 font-mono text-xs text-gray-600" title={publicShareUrl}>
                    {publicShareUrl}
                  </p>
                ) : null}
                {sharingFromLocalhost ? (
                  <p className="mt-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    Facebook cannot preview <strong>localhost</strong> links. Social sharing uses your live link{" "}
                    <strong>shalean.co.za/refer</strong> so previews show correctly. Deploy the referral page to production for the link to work for visitors.
                  </p>
                ) : null}
                <div className="mt-4 grid gap-2">
                  <Button type="button" variant="outline" className="justify-start rounded-xl" onClick={shareWhatsApp} disabled={!shareUrlReady}>
                    <MessageCircle className="mr-2 h-4 w-4 text-green-600" /> WhatsApp
                  </Button>
                  <Button type="button" variant="outline" className="justify-start rounded-xl" onClick={shareFacebook} disabled={!shareUrlReady}>
                    <Share2 className="mr-2 h-4 w-4 text-blue-600" /> Facebook
                  </Button>
                  <Button type="button" variant="outline" className="justify-start rounded-xl" onClick={() => void copyLink()} disabled={!shareUrlReady}>
                    <Copy className="mr-2 h-4 w-4" /> {copied ? "Copied!" : "Copy Link"}
                  </Button>
                </div>
              </div>
              {settings?.promotionalText ? (
                <div className="rounded-2xl border border-amber-100 bg-amber-50 p-5 text-sm text-amber-900">
                  {settings.promotionalText}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

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
          <h2 className="text-2xl font-bold sm:text-3xl">Start Referring Today</h2>
          <p className="mt-3 text-blue-100">
            Help someone enjoy a professionally cleaned home while earning Cleaning Credit for your next booking.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button
              size="lg"
              variant="outline"
              className="rounded-xl border-white bg-white font-semibold !text-blue-700 shadow-md hover:bg-blue-50 hover:!text-blue-800"
              onClick={scrollToForm}
            >
              Refer a Friend
            </Button>
            <Button size="lg" variant="outline" className="rounded-xl border-white/40 text-white hover:bg-white/10" asChild>
              <Link href={marketingHomeBookingHref()}>Book a Cleaning</Link>
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

      <FooterSection />
    </div>
  );
}
