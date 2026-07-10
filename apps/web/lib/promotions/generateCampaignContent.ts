import "server-only";

import OpenAI from "openai";
import type { CampaignContentChannel } from "./campaignChannels";
import { formatOfferLabel } from "./offerCopy";
import type { PromotionRow } from "./types";

export type GeneratedChannelContent = {
  channel: CampaignContentChannel;
  title: string | null;
  body: string;
  hashtags: string[];
  cta: string | null;
  htmlBody: string | null;
  meta: Record<string, unknown>;
};

type GenInput = {
  promotion: PromotionRow;
  bookingUrl: string;
  brandName?: string;
};

function offer(p: PromotionRow) {
  return formatOfferLabel({
    discountType: p.discount_type,
    discountValue: p.discount_value,
  });
}

function codeLine(p: PromotionRow): string {
  return p.promo_code ? `Use code ${p.promo_code}` : "Offer applied automatically at checkout where eligible";
}

function cta(p: PromotionRow): string {
  return p.cta_label?.trim() || p.display_config.cta || "Book now";
}

function hashtagsFor(p: PromotionRow): string[] {
  const base = ["#Shalean", "#CapeTownCleaning", "#HomeCleaning", "#ProfessionalCleaners"];
  if (p.promotion_type === "first_booking") base.push("#FirstBooking", "#NewCustomer");
  if (p.promotion_type === "referral") base.push("#Referral", "#ShareTheLove");
  if (p.slug.includes("spring")) base.push("#SpringCleaning");
  if (p.slug.includes("black") || p.name.toLowerCase().includes("black friday")) {
    base.push("#BlackFriday");
  }
  return base;
}

/** Deterministic, brand-safe copy for every channel (works without OpenAI). */
export function generateTemplateCampaignContent(input: GenInput): GeneratedChannelContent[] {
  const { promotion: p, bookingUrl } = input;
  const brand = input.brandName ?? "Shalean";
  const offerText = offer(p);
  const code = codeLine(p);
  const button = cta(p);
  const tags = hashtagsFor(p);
  const ends = p.ends_at
    ? `Offer ends ${new Date(p.ends_at).toLocaleDateString("en-ZA", { dateStyle: "medium" })}.`
    : "Limited-time offer — book while it lasts.";
  const desc =
    p.description?.trim() ||
    `${brand} professional home cleaning. ${offerText}. Trusted cleaners across Cape Town.`;

  const facebook = [
    `✨ ${p.name}`,
    "",
    `${offerText} on professional home cleaning with ${brand}.`,
    "",
    desc,
    "",
    `✅ Vetted, insured cleaners`,
    `✅ Easy online booking`,
    `✅ ${code}`,
    "",
    ends,
    "",
    `${button}: ${bookingUrl}`,
    "",
    tags.join(" "),
  ].join("\n");

  const instagram = [
    `${offerText} with ${brand} 🧼✨`,
    "",
    desc,
    "",
    `${code}`,
    ends,
    "",
    `Link in bio · ${button}`,
  ].join("\n");

  const linkedin = [
    `${brand} is running ${p.name}: ${offerText}.`,
    "",
    `Whether you need a once-off deep clean or a reliable recurring service, our professional teams help Cape Town homes and workplaces stay guest-ready.`,
    "",
    `${code}. ${ends}`,
    "",
    `Book here: ${bookingUrl}`,
  ].join("\n");

  const twitter = `${offerText} — ${p.name} from ${brand}. ${code}. ${button}: ${bookingUrl}`.slice(
    0,
    260,
  );

  const whatsapp = `Hi! ${brand} here 👋\n\n${p.name}: ${offerText}.\n${code}.\n\n${button}: ${bookingUrl}`;

  const gbp = `${p.name}\n\n${offerText} on ${brand} cleaning services.\n${code}.\n${ends}\n\n${button}: ${bookingUrl}`;

  const sms = `${brand}: ${offerText} — ${p.name}. ${p.promo_code ? `Code ${p.promo_code}. ` : ""}${button}: ${bookingUrl}`.slice(
    0,
    160,
  );

  const emailHtml = `<!DOCTYPE html>
<html><body style="font-family:Arial,sans-serif;color:#0B1F4A;line-height:1.5;max-width:560px;margin:0 auto;padding:24px">
  <p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#64748b">${brand}</p>
  <h1 style="font-size:28px;margin:8px 0 12px">${escapeHtml(p.name)}</h1>
  <p style="font-size:20px;font-weight:700;color:#2563EB">${escapeHtml(offerText)}</p>
  <p>${escapeHtml(desc)}</p>
  <p><strong>${escapeHtml(code)}</strong></p>
  <p>${escapeHtml(ends)}</p>
  <p style="margin:28px 0"><a href="${escapeAttr(bookingUrl)}" style="background:#2563EB;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600">${escapeHtml(button)}</a></p>
  <p style="font-size:12px;color:#64748b">Terms apply. Eligibility is checked at checkout.</p>
</body></html>`;

  const blog = [
    `# ${p.name}: ${offerText} with ${brand}`,
    "",
    `Looking for a reliable home clean in Cape Town? ${brand} is offering **${offerText}** as part of our ${p.name} campaign.`,
    "",
    "## Why book with Shalean",
    "",
    "- Professional, vetted cleaners",
    "- Transparent online booking",
    "- Flexible once-off and recurring options",
    "",
    "## How to claim the offer",
    "",
    `1. Visit ${bookingUrl}`,
    `2. ${code}`,
    "3. Complete your booking — savings show at checkout when eligible",
    "",
    ends,
    "",
    p.terms_html ? "## Terms & conditions\n\nSee campaign landing page for full terms." : "",
  ]
    .filter(Boolean)
    .join("\n");

  const landing = JSON.stringify({
    heroHeadline: p.display_config.headline ?? p.name,
    heroSubheadline: p.display_config.subheadline ?? desc,
    offer: offerText,
    benefits: [
      "Professional Cape Town cleaners",
      "Easy online booking",
      "Transparent pricing",
      code,
    ],
    servicesIncluded: ["Standard home cleaning", "Deep cleaning options", "Recurring plans"],
    faqs: [
      {
        q: "Who can use this offer?",
        a: "Eligibility is checked automatically at checkout based on campaign rules.",
      },
      {
        q: "How do I apply the discount?",
        a: p.promo_code
          ? `Enter promo code ${p.promo_code} at checkout, or it may auto-apply if eligible.`
          : "Eligible bookings receive the discount automatically at checkout.",
      },
      {
        q: "Can I combine this with other offers?",
        a: "Stacking depends on campaign settings. Checkout shows the best valid combination.",
      },
    ],
    cta: button,
    terms: p.terms_html ?? "Standard Shalean terms apply. Offer subject to availability and eligibility.",
  });

  const faq = JSON.stringify([
    {
      q: `What is the ${p.name} offer?`,
      a: `${offerText}. ${desc}`,
    },
    {
      q: "How long is the offer valid?",
      a: ends,
    },
    {
      q: "Where do I book?",
      a: `Book online at ${bookingUrl}.`,
    },
  ]);

  const metaSeo = JSON.stringify({
    title: `${p.name} | ${offerText} | ${brand}`,
    description: desc.slice(0, 155),
    ogTitle: `${offerText} — ${p.name}`,
    ogDescription: desc.slice(0, 155),
    keywords: ["Shalean", "cleaning Cape Town", p.name, offerText, p.promo_code].filter(Boolean),
  });

  const pinterest = `${offerText} home cleaning with ${brand}. ${code}. Save this pin & book: ${bookingUrl}`;

  return [
    { channel: "facebook", title: p.name, body: facebook, hashtags: tags, cta: button, htmlBody: null, meta: {} },
    {
      channel: "instagram",
      title: null,
      body: instagram,
      hashtags: tags,
      cta: button,
      htmlBody: null,
      meta: { caption: instagram },
    },
    { channel: "linkedin", title: p.name, body: linkedin, hashtags: [], cta: button, htmlBody: null, meta: {} },
    { channel: "twitter", title: null, body: twitter, hashtags: tags.slice(0, 3), cta: button, htmlBody: null, meta: {} },
    { channel: "whatsapp", title: null, body: whatsapp, hashtags: [], cta: button, htmlBody: null, meta: {} },
    {
      channel: "google_business",
      title: p.name,
      body: gbp,
      hashtags: [],
      cta: button,
      htmlBody: null,
      meta: {},
    },
    {
      channel: "email",
      title: `${offerText} — ${p.name}`,
      body: `${desc}\n\n${code}\n${ends}\n\n${button}: ${bookingUrl}`,
      hashtags: [],
      cta: button,
      htmlBody: emailHtml,
      meta: { subject: `${offerText} — ${p.name}` },
    },
    { channel: "sms", title: null, body: sms, hashtags: [], cta: button, htmlBody: null, meta: {} },
    { channel: "blog", title: `${p.name}: ${offerText}`, body: blog, hashtags: tags, cta: button, htmlBody: null, meta: {} },
    {
      channel: "landing",
      title: p.display_config.headline ?? p.name,
      body: landing,
      hashtags: [],
      cta: button,
      htmlBody: null,
      meta: { structured: true },
    },
    { channel: "faq", title: "Campaign FAQs", body: faq, hashtags: [], cta: null, htmlBody: null, meta: { structured: true } },
    {
      channel: "meta_seo",
      title: `${p.name} | ${brand}`,
      body: metaSeo,
      hashtags: [],
      cta: null,
      htmlBody: null,
      meta: { structured: true },
    },
    {
      channel: "pinterest",
      title: `${offerText} | ${brand}`,
      body: pinterest,
      hashtags: tags,
      cta: button,
      htmlBody: null,
      meta: {},
    },
  ];
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, "&#39;");
}

/**
 * Optionally polish template copy with OpenAI when `OPENAI_API_KEY` is set.
 * Falls back to templates on any failure.
 */
export async function generateCampaignContent(input: GenInput): Promise<{
  items: GeneratedChannelContent[];
  generatedBy: "template" | "ai";
}> {
  const templates = generateTemplateCampaignContent(input);
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return { items: templates, generatedBy: "template" };

  try {
    const openai = new OpenAI({ apiKey: key });
    const p = input.promotion;
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a growth copywriter for Shalean, a Cape Town professional cleaning brand. Return JSON with keys matching channels: facebook, instagram, linkedin, twitter, whatsapp, google_business, email, sms, blog, pinterest. Each value: {title, body, hashtags[], cta}. Keep brand voice warm, clear, South African English. No medical/financial claims. Twitter body under 260 chars. SMS under 160 chars.",
        },
        {
          role: "user",
          content: JSON.stringify({
            name: p.name,
            description: p.description,
            offer: offer(p),
            promoCode: p.promo_code,
            bookingUrl: input.bookingUrl,
            type: p.promotion_type,
            endsAt: p.ends_at,
          }),
        },
      ],
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) return { items: templates, generatedBy: "template" };
    const parsed = JSON.parse(raw) as Record<
      string,
      { title?: string; body?: string; hashtags?: string[]; cta?: string }
    >;

    const merged = templates.map((item) => {
      if (
        item.channel === "landing" ||
        item.channel === "faq" ||
        item.channel === "meta_seo" ||
        item.channel === "email"
      ) {
        return item;
      }
      const ai = parsed[item.channel];
      if (!ai?.body) return item;
      return {
        ...item,
        title: ai.title ?? item.title,
        body: ai.body,
        hashtags: Array.isArray(ai.hashtags) ? ai.hashtags : item.hashtags,
        cta: ai.cta ?? item.cta,
      };
    });

    return { items: merged, generatedBy: "ai" };
  } catch {
    return { items: templates, generatedBy: "template" };
  }
}
