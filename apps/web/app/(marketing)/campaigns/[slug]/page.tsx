import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PublicPageContainer } from "@/components/nav/PublicPageContainer";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getPromotionBySlug,
  listCampaignContent,
} from "@/lib/promotions/campaignContent";
import { formatOfferLabel } from "@/lib/promotions/offerCopy";
import { sanitizeCampaignTermsHtml } from "@/lib/promotions/campaignTermsHtml";
import { recordPromotionEvent } from "@/lib/promotions/server";
import { CampaignLandingClient } from "@/components/promotions/CampaignLandingClient";
import type { PromotionRow } from "@/lib/promotions/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

type LandingStructured = {
  heroHeadline?: string;
  heroSubheadline?: string;
  offer?: string;
  benefits?: string[];
  servicesIncluded?: string[];
  faqs?: { q: string; a: string }[];
  cta?: string;
  terms?: string;
};

/** Soft fallback when DB promo is missing but URL was shared (avoids hard 404). */
function fallbackPromo(slug: string): PromotionRow {
  const name = slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return {
    id: "fallback",
    slug,
    name,
    description: "Professional cleaning with Shalean in Cape Town.",
    promotion_type: "seasonal",
    status: "active",
    starts_at: null,
    ends_at: null,
    banner_image_url: null,
    landing_page_path: `/campaigns/${slug}`,
    promo_code: null,
    auto_apply: false,
    discount_type: "percent",
    discount_value: 0,
    max_discount_zar: null,
    min_booking_amount_zar: 0,
    customer_eligibility: {},
    booking_eligibility: {},
    usage_limit_total: null,
    usage_limit_per_customer: null,
    budget_zar: null,
    budget_spent_zar: 0,
    stackable: false,
    stack_priority: 100,
    show_on_homepage: false,
    show_on_booking: true,
    show_on_pricing: false,
    show_announcement_bar: false,
    display_config: {
      headline: name,
      subheadline: "Book online with Shalean — trusted Cape Town cleaners.",
      cta: "Book now",
      countdown: false,
    },
    views_count: 0,
    clicks_count: 0,
    bookings_started_count: 0,
    bookings_completed_count: 0,
    revenue_generated_zar: 0,
    redemptions_count: 0,
    created_by: null,
    updated_by: null,
    duplicated_from_id: null,
    created_at: "",
    updated_at: "",
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (!slug?.trim()) return { title: "Campaign | Shalean" };
  const admin = getSupabaseAdmin();
  if (!admin) return { title: "Campaign | Shalean" };
  try {
    const promo = await getPromotionBySlug(admin, slug);
    if (!promo || promo.status === "ended" || promo.status === "expired") {
      return { title: "Campaign | Shalean" };
    }
    let title = `${promo.name} | Shalean`;
    let description = promo.description ?? undefined;
    try {
      const content = await listCampaignContent(admin, promo.id);
      const seo = content.find((c) => c.channel === "meta_seo");
      if (seo?.body) {
        const parsed = JSON.parse(seo.body) as { title?: string; description?: string };
        title = parsed.title ?? title;
        description = parsed.description ?? description;
      }
    } catch {
      // content table may not exist yet
    }
    return { title, description };
  } catch {
    return { title: "Campaign | Shalean" };
  }
}

export default async function CampaignLandingPage({ params }: Props) {
  const { slug } = await params;
  if (!slug?.trim()) redirect("/book");

  const admin = getSupabaseAdmin();
  let promo: PromotionRow | null = null;
  let structured: LandingStructured = {};

  if (admin) {
    try {
      promo = await getPromotionBySlug(admin, slug);
    } catch {
      promo = null;
    }
  }

  const allowedStatuses = new Set(["active", "scheduled", "draft", "paused", "ended", "expired"]);
  if (!promo || !allowedStatuses.has(String(promo.status ?? ""))) {
    // Prefer soft landing over 404 for shared campaign URLs (pre-migration / pre-generate).
    promo = fallbackPromo(slug);
  }

  // Keep shared Facebook / QR URLs on the landing page even when the promo ended —
  // redirecting to /book broke some Facebook in-app browsers / .com domain hops.
  const offerExpired =
    promo.id !== "fallback" &&
    (promo.status === "ended" ||
      promo.status === "expired" ||
      (promo.ends_at != null && new Date(promo.ends_at).getTime() < Date.now()));

  if (admin && promo.id !== "fallback") {
    try {
      const content = await listCampaignContent(admin, promo.id);
      const landing = content.find((c) => c.channel === "landing");
      if (landing?.body) {
        structured = JSON.parse(landing.body) as LandingStructured;
      }
    } catch {
      structured = {};
    }

    try {
      await recordPromotionEvent(admin, {
        promotionId: promo.id,
        eventType: "landing_visit",
      });
    } catch {
      // best-effort
    }
  }

  const offer =
    structured.offer ??
    (promo.discount_value > 0
      ? formatOfferLabel({
          discountType: promo.discount_type,
          discountValue: promo.discount_value,
        })
      : "Professional Cleaning");

  const bookHref = `/book?promo=${encodeURIComponent(promo.promo_code ?? promo.slug)}`;

  // Defense-in-depth: sanitize at render even though terms are sanitized on write,
  // to cover pre-remediation rows and template-generated `structured.terms`.
  const safeTermsHtml =
    sanitizeCampaignTermsHtml(promo.terms_html || structured.terms) ||
    "Standard Shalean terms apply. Offer subject to eligibility and availability.";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header
        className="relative overflow-hidden text-white"
        style={{
          background: `linear-gradient(135deg, ${promo.display_config.colours?.primary ?? "#0B1F4A"}, ${promo.display_config.colours?.accent ?? "#2563EB"})`,
        }}
      >
        <PublicPageContainer size="content" className="flex flex-col gap-6 py-16 md:py-24">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/80">Shalean</p>
          {offerExpired ? (
            <p className="inline-flex w-fit rounded-[var(--ui-radius-pill)] bg-white/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide">
              Offer ended — you can still book online
            </p>
          ) : null}
          <p className="text-4xl font-bold tracking-tight md:text-5xl">{offer}</p>
          <h1 className="max-w-2xl text-3xl font-semibold md:text-4xl">
            {structured.heroHeadline ?? promo.display_config.headline ?? promo.name}
          </h1>
          <p className="max-w-xl text-lg text-white/90">
            {structured.heroSubheadline ??
              promo.display_config.subheadline ??
              promo.description}
          </p>
          {promo.promo_code ? (
            <p className="inline-flex w-fit rounded-[var(--ui-radius-pill)] bg-white/15 px-4 py-2 font-mono text-sm">
              Promo code: {promo.promo_code}
            </p>
          ) : null}
          <CampaignLandingClient promotionId={promo.id} endsAt={promo.ends_at} />
          <div className="flex flex-wrap gap-3">
            <Link
              href={bookHref}
              className="rounded-[var(--ui-radius-pill)] bg-white px-6 py-3 text-sm font-semibold text-slate-900"
            >
              {structured.cta ?? promo.cta_label ?? promo.display_config.cta ?? "Book now"}
            </Link>
            <Link
              href="/"
              className="rounded-[var(--ui-radius-pill)] border border-white/40 px-6 py-3 text-sm font-semibold text-white"
            >
              Back home
            </Link>
          </div>
        </PublicPageContainer>
      </header>

      <PublicPageContainer size="content" className="space-y-12 py-12">
        <section>
          <h2 className="text-2xl font-bold">Benefits</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {(structured.benefits ?? [
              "Professional Cape Town cleaners",
              "Easy online booking",
              "Transparent pricing",
            ]).map((b) => (
              <li key={b} className="rounded-[var(--ui-radius-2xl)] border border-border bg-card p-4 text-sm text-card-foreground">
                {b}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-bold">Services included</h2>
          <ul className="mt-4 list-disc space-y-1 pl-5 text-muted-foreground">
            {(structured.servicesIncluded ?? ["Standard home cleaning"]).map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>

        {promo.qr_code_data_url ? (
          <section className="rounded-[var(--ui-radius-2xl)] border border-border bg-card p-6 text-card-foreground">
            <h2 className="text-xl font-bold">Scan to book</h2>
            <p className="mt-1 text-sm text-muted-foreground">QR code for this campaign landing page.</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={promo.qr_code_data_url}
              alt="Campaign QR code"
              className="mt-4 h-40 w-40 rounded-[var(--ui-radius-lg)] border border-border"
            />
          </section>
        ) : null}

        {(structured.faqs?.length ?? 0) > 0 ? (
          <section>
            <h2 className="text-2xl font-bold">FAQs</h2>
            <div className="mt-4 space-y-3">
              {(structured.faqs ?? []).map((f) => (
                <details key={f.q} className="rounded-[var(--ui-radius-2xl)] border border-border bg-card p-4 text-card-foreground">
                  <summary className="cursor-pointer font-medium">{f.q}</summary>
                  <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
                </details>
              ))}
            </div>
          </section>
        ) : null}

        <section className="rounded-[var(--ui-radius-2xl)] border border-border bg-card p-6 text-sm text-muted-foreground">
          <h2 className="text-lg font-bold text-card-foreground">Terms & conditions</h2>
          <div
            className="mt-3 prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: safeTermsHtml }}
          />
        </section>
      </PublicPageContainer>
    </div>
  );
}
