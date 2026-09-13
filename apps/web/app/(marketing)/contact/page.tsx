import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Briefcase,
  CalendarClock,
  CalendarPlus,
  Clock,
  CreditCard,
  Mail,
  MessageCircle,
  Phone,
  Sparkles,
  UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ContactPageForm } from "@/components/contact/ContactPageForm";
import { MarketingHomeHeader } from "@/components/marketing-home/MarketingHomeHeader";
import { PublicPageContainer } from "@/components/nav/PublicPageContainer";
import { SiteFooter } from "@/components/nav/SiteFooter";
import { marketingHomeBookingHref } from "@/lib/marketing/marketingHomeAssets";
import { marketingWhatsAppFloatMainPadding } from "@/lib/marketing/marketingMobileLayout";
import { clampMetaDescription } from "@/lib/seo/metaDescription";
import { clipSerpTitle } from "@/lib/seo/metaTitle";
import {
  HOME_OG_IMAGE,
  HOME_OG_IMAGE_ALT,
  HOME_OG_IMAGE_HEIGHT,
  HOME_OG_IMAGE_WIDTH,
} from "@/lib/seo/homePageMeta";
import { absoluteCanonicalUrl } from "@/lib/site/canonical";
import {
  CUSTOMER_SUPPORT_EMAIL,
  CUSTOMER_SUPPORT_TELEPHONE_DISPLAY,
  CUSTOMER_SUPPORT_TELEPHONE_TEL,
  CUSTOMER_SUPPORT_WHATSAPP_DISPLAY,
  buildCustomerSupportWhatsAppUrl,
  customerSupportWhatsAppHref,
} from "@/lib/site/customerSupport";
import { buildContactPageJsonLdGraph } from "@/lib/seo/contactPageJsonLd";
import { SEO_INDEX_FOLLOW } from "@/lib/site/seoRobots";

const contactJsonLdHtml = JSON.stringify(buildContactPageJsonLdGraph()).replace(/</g, "\\u003c");

const PATH = "/contact";
const CANONICAL = absoluteCanonicalUrl(PATH);
const CONTACT_TITLE = clipSerpTitle("Contact Shalean | Cape Town Cleaning Support");

const CONTACT_META_DESC = clampMetaDescription(
  "Contact Shalean Cleaning Services in Cape Town—call, WhatsApp, or email for booking help, quotes, and support. Mon–Sat, 8am–6pm.",
);

export const metadata: Metadata = {
  title: CONTACT_TITLE,
  description: CONTACT_META_DESC,
  robots: SEO_INDEX_FOLLOW,
  alternates: { canonical: CANONICAL, languages: { "en-ZA": CANONICAL } },
  openGraph: {
    type: "website",
    url: CANONICAL,
    locale: "en_ZA",
    siteName: "Shalean Cleaning Services",
    title: CONTACT_TITLE,
    description: CONTACT_META_DESC,
    images: [
      {
        url: HOME_OG_IMAGE,
        width: HOME_OG_IMAGE_WIDTH,
        height: HOME_OG_IMAGE_HEIGHT,
        alt: HOME_OG_IMAGE_ALT,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: CONTACT_TITLE,
    description: CONTACT_META_DESC,
    images: [HOME_OG_IMAGE],
  },
};

const BUSINESS_EMAIL = "hello@shalean.co.za";

type JourneyCard = {
  icon: LucideIcon;
  title: string;
  description: string;
  href: string;
  cta: string;
  external?: boolean;
};

const journeyCards: JourneyCard[] = [
  {
    icon: CalendarPlus,
    title: "New bookings",
    description: "Get an instant quote or book a cleaner online in minutes.",
    href: "/book",
    cta: "Book online",
  },
  {
    icon: Sparkles,
    title: "Free quotes",
    description: "Not ready to book? Request a tailored quote for your home or office.",
    href: "/quote",
    cta: "Get a quote",
  },
  {
    icon: UserRound,
    title: "Existing bookings",
    description: "View upcoming cleans, notes, and cleaner details in your account.",
    href: "/account/bookings",
    cta: "My bookings",
  },
  {
    icon: CalendarClock,
    title: "Reschedule",
    description: "Change your date or time from your bookings dashboard.",
    href: "/account/bookings",
    cta: "Reschedule",
  },
  {
    icon: CreditCard,
    title: "Payments & invoices",
    description: "Review invoices, payment status, and billing history.",
    href: "/account/invoices",
    cta: "View invoices",
  },
  {
    icon: MessageCircle,
    title: "Complaints & feedback",
    description: "Tell us what went wrong—we aim to respond the same day during office hours.",
    href: buildCustomerSupportWhatsAppUrl("Hi, I'd like to share feedback about my recent Shalean clean."),
    cta: "WhatsApp us",
    external: true,
  },
  {
    icon: Briefcase,
    title: "Cleaner applications",
    description: "Join the Shalean team as a professional cleaner in Cape Town.",
    href: "/cleaner/apply",
    cta: "Apply now",
  },
  {
    icon: Mail,
    title: "Business enquiries",
    description: "Offices, estates, Airbnb portfolios, and recurring contracts.",
    href: `mailto:${BUSINESS_EMAIL}?subject=${encodeURIComponent("Shalean business enquiry")}`,
    cta: "Email hello@",
  },
];

const contactMethods = [
  {
    icon: Phone,
    label: "Call us",
    value: CUSTOMER_SUPPORT_TELEPHONE_DISPLAY,
    href: CUSTOMER_SUPPORT_TELEPHONE_TEL,
    external: false,
    note: "Same-day response during office hours",
  },
  {
    icon: MessageCircle,
    label: "WhatsApp",
    value: CUSTOMER_SUPPORT_WHATSAPP_DISPLAY,
    href: customerSupportWhatsAppHref(),
    external: true,
    note: "Fastest for booking changes and quick questions",
  },
  {
    icon: Mail,
    label: "Email",
    value: BUSINESS_EMAIL,
    href: `mailto:${BUSINESS_EMAIL}`,
    external: false,
    note: "We reply within one business day",
  },
] as const;

export default function ContactPage() {
  const bookingHref = marketingHomeBookingHref();

  return (
    <div className="bg-background text-foreground">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: contactJsonLdHtml }} />
      <MarketingHomeHeader bookingHref={bookingHref} />
      <main className={marketingWhatsAppFloatMainPadding}>
        <PublicPageContainer size="content" className="py-10 sm:py-16">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">Contact</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Contact Shalean Cleaning Services in Cape Town
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
            Choose the path that matches your question—new bookings, account help, payments, or general support. Our
            Cape Town team is here Mon–Sat, 8am–6pm.
          </p>

          <section className="mt-10" aria-labelledby="journeys-heading">
            <h2 id="journeys-heading" className="text-lg font-bold text-foreground sm:text-xl">
              How can we help?
            </h2>
            <ul className="mt-5 grid gap-4 sm:grid-cols-2">
              {journeyCards.map(({ icon: Icon, title, description, href, cta, external }) => (
                <li key={title}>
                  <a
                    href={href}
                    {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    className="group flex h-full flex-col rounded-[var(--ui-radius-2xl)] border border-border bg-card p-5 shadow-[var(--ui-shadow-sm)] transition hover:border-blue-200 hover:shadow-[var(--ui-shadow-md)]"
                  >
                    <Icon className="h-5 w-5 text-blue-600" aria-hidden />
                    <h3 className="mt-3 font-semibold text-card-foreground">{title}</h3>
                    <p className="mt-1 flex-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
                    <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-blue-600 group-hover:underline">
                      {cta}
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </span>
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-muted-foreground">
              Not signed in yet?{" "}
              <Link href="/login" className="font-semibold text-blue-600 hover:underline">
                Log in
              </Link>{" "}
              to manage bookings, or browse the{" "}
              <Link href="/faq" className="font-semibold text-blue-600 hover:underline">
                Help Centre
              </Link>
              .
            </p>
          </section>

          <section className="mt-12" aria-labelledby="reach-heading">
            <h2 id="reach-heading" className="text-lg font-bold text-foreground sm:text-xl">
              Reach us directly
            </h2>
            <ul className="mt-5 space-y-4">
              {contactMethods.map(({ icon: Icon, label, value, href, external, note }) => (
                <li key={label}>
                  <a
                    href={href}
                    {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    className="flex items-start gap-4 rounded-[var(--ui-radius-xl)] border border-border bg-muted px-5 py-4 transition hover:border-blue-200 hover:bg-accent"
                  >
                    <Icon className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" aria-hidden />
                    <span>
                      <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
                      <span className="mt-1 block text-base font-semibold text-foreground">{value}</span>
                      <span className="mt-1 block text-sm text-muted-foreground">{note}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </section>

          <section
            className="mt-10 rounded-[var(--ui-radius-2xl)] border border-blue-100 bg-blue-50/40 px-5 py-5 sm:px-6"
            aria-labelledby="hours-heading"
          >
            <div className="flex items-start gap-3">
              <Clock className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" aria-hidden />
              <div>
                <h2 id="hours-heading" className="font-semibold text-foreground">
                  Office hours & response times
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  <strong className="font-semibold text-foreground">Mon–Sat, 8am–6pm</strong> (SAST). Phone and
                  WhatsApp enquiries are typically answered the same day during these hours. Email replies within{" "}
                  <strong className="font-semibold text-foreground">one business day</strong>.
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Service area: Cape Town, South Africa. For privacy enquiries:{" "}
                  <a href={`mailto:${CUSTOMER_SUPPORT_EMAIL}`} className="text-blue-600 hover:underline">
                    {CUSTOMER_SUPPORT_EMAIL}
                  </a>
                </p>
              </div>
            </div>
          </section>

          <div className="mt-12">
            <ContactPageForm />
          </div>
        </PublicPageContainer>
      </main>
      <SiteFooter />
    </div>
  );
}
