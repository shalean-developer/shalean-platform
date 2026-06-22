import type { Metadata } from "next";
import Link from "next/link";
import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { FooterSection } from "@/components/home/sections/FooterSection";
import { MarketingHomeHeader } from "@/components/marketing-home/MarketingHomeHeader";
import { marketingHomeBookingHref } from "@/lib/marketing/marketingHomeAssets";
import { clampMetaDescription } from "@/lib/seo/metaDescription";
import { absoluteCanonicalUrl } from "@/lib/site/canonical";
import {
  CUSTOMER_SUPPORT_EMAIL,
  CUSTOMER_SUPPORT_TELEPHONE_DISPLAY,
  CUSTOMER_SUPPORT_TELEPHONE_TEL,
  CUSTOMER_SUPPORT_WHATSAPP_DISPLAY,
  customerSupportWhatsAppHref,
} from "@/lib/site/customerSupport";
import { SEO_INDEX_FOLLOW } from "@/lib/site/seoRobots";

const PATH = "/contact";
const CANONICAL = absoluteCanonicalUrl(PATH);

const CONTACT_META_DESC = clampMetaDescription(
  "Contact Shalean Cleaning Services in Cape Town—call, WhatsApp, or email for booking help, quotes, and support. Office hours Mon–Sat.",
);

export const metadata: Metadata = {
  title: "Contact Shalean | Cape Town Cleaning Services",
  description: CONTACT_META_DESC,
  robots: SEO_INDEX_FOLLOW,
  alternates: { canonical: CANONICAL },
  openGraph: {
    type: "website",
    url: CANONICAL,
    title: "Contact Shalean | Cape Town Cleaning Services",
    description: CONTACT_META_DESC,
  },
  twitter: {
    card: "summary",
    title: "Contact Shalean | Cape Town Cleaning Services",
    description: CONTACT_META_DESC,
  },
};

const contactMethods = [
  {
    icon: Phone,
    label: "Call us",
    value: CUSTOMER_SUPPORT_TELEPHONE_DISPLAY,
    href: CUSTOMER_SUPPORT_TELEPHONE_TEL,
    external: false,
  },
  {
    icon: MessageCircle,
    label: "WhatsApp",
    value: CUSTOMER_SUPPORT_WHATSAPP_DISPLAY,
    href: customerSupportWhatsAppHref(),
    external: true,
  },
  {
    icon: Mail,
    label: "Email",
    value: "hello@shalean.co.za",
    href: "mailto:hello@shalean.co.za",
    external: false,
  },
] as const;

export default function ContactPage() {
  const bookingHref = marketingHomeBookingHref();

  return (
    <div className="bg-white text-slate-900">
      <MarketingHomeHeader bookingHref={bookingHref} />
      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">Contact</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Get in touch with Shalean
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-600">
          Questions about booking, pricing, or an existing clean? Reach our Cape Town team by phone,
          WhatsApp, or email—we typically reply within one business day.
        </p>

        <ul className="mt-10 space-y-4">
          {contactMethods.map(({ icon: Icon, label, value, href, external }) => (
            <li key={label}>
              <a
                href={href}
                {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className="flex items-start gap-4 rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 transition hover:border-blue-200 hover:bg-blue-50/50"
              >
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" aria-hidden />
                <span>
                  <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {label}
                  </span>
                  <span className="mt-1 block text-base font-semibold text-slate-900">{value}</span>
                </span>
              </a>
            </li>
          ))}
          <li className="flex items-start gap-4 rounded-xl border border-slate-200 bg-slate-50 px-5 py-4">
            <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" aria-hidden />
            <span>
              <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Service area
              </span>
              <span className="mt-1 block text-base font-semibold text-slate-900">
                Cape Town, South Africa
              </span>
            </span>
          </li>
        </ul>

        <p className="mt-4 text-sm text-slate-500">
          For privacy enquiries:{" "}
          <a href={`mailto:${CUSTOMER_SUPPORT_EMAIL}`} className="text-blue-600 hover:underline">
            {CUSTOMER_SUPPORT_EMAIL}
          </a>
        </p>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/quote"
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Get a free quote
          </Link>
          <Link
            href="/faq"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
          >
            Browse FAQs
          </Link>
          <Link
            href={bookingHref}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
          >
            Book online
          </Link>
        </div>
      </main>
      <FooterSection />
    </div>
  );
}
