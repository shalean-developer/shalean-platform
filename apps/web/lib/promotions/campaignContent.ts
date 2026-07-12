import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import QRCode from "qrcode";
import { SOCIAL_IMAGE_SPECS, type CampaignContentChannel } from "./campaignChannels";
import { generateCampaignContent } from "./generateCampaignContent";
import { absoluteCampaignUrl, campaignLandingPath } from "./offerCopy";
import { formatOfferLabel } from "./offerCopy";
import type { PromotionRow } from "./types";

type Admin = SupabaseClient;

export type CampaignContentRow = {
  id: string;
  promotion_id: string;
  channel: CampaignContentChannel;
  title: string | null;
  body: string;
  hashtags: string[];
  cta: string | null;
  html_body: string | null;
  meta: Record<string, unknown>;
  status: "draft" | "ready" | "published" | "archived";
  generated_by: "template" | "ai" | "manual";
  version: number;
  created_at: string;
  updated_at: string;
};

export type CampaignAssetRow = {
  id: string;
  promotion_id: string;
  asset_type: string;
  label: string;
  width: number | null;
  height: number | null;
  image_url: string | null;
  template_payload: Record<string, unknown>;
  sort_order: number;
};

export type CampaignTemplateRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category: string;
  promotion_type: string;
  default_discount_type: string;
  default_discount_value: number;
  default_promo_code_prefix: string | null;
  default_display_config: Record<string, unknown>;
  default_eligibility: Record<string, unknown>;
  default_copy_hints: Record<string, unknown>;
  enabled: boolean;
  sort_order: number;
};

export async function listCampaignContent(
  admin: Admin,
  promotionId: string,
): Promise<CampaignContentRow[]> {
  const { data, error } = await admin
    .from("campaign_content")
    .select("*")
    .eq("promotion_id", promotionId)
    .order("channel");
  if (error) {
    // Table may not exist until migration 20261067 is applied.
    if (/campaign_content|does not exist|schema cache/i.test(error.message)) return [];
    throw new Error(error.message);
  }
  return (data ?? []) as CampaignContentRow[];
}

export async function listCampaignAssets(
  admin: Admin,
  promotionId: string,
): Promise<CampaignAssetRow[]> {
  const { data, error } = await admin
    .from("campaign_assets")
    .select("*")
    .eq("promotion_id", promotionId)
    .order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []) as CampaignAssetRow[];
}

export async function listCampaignTemplates(admin: Admin): Promise<CampaignTemplateRow[]> {
  const { data, error } = await admin
    .from("campaign_templates")
    .select("*")
    .eq("enabled", true)
    .order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []) as CampaignTemplateRow[];
}

export async function getCampaignTemplateByKey(
  admin: Admin,
  key: string,
): Promise<CampaignTemplateRow | null> {
  const { data, error } = await admin
    .from("campaign_templates")
    .select("*")
    .eq("key", key)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as CampaignTemplateRow | null) ?? null;
}

export async function generateQrDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 512,
    color: { dark: "#0B1F4A", light: "#ffffff" },
  });
}

function brandPayload(promo: PromotionRow) {
  const offer = formatOfferLabel({
    discountType: promo.discount_type,
    discountValue: promo.discount_value,
  });
  const landing = absoluteCampaignUrl(promo);
  const isFirstBooking = promo.promotion_type === "first_booking";
  return {
    brand: "Shalean",
    campaignName: promo.name,
    offer,
    promoCode: promo.promo_code,
    headline: promo.display_config.headline ?? promo.name,
    subheadline: promo.display_config.subheadline ?? promo.description,
    cta: promo.cta_label ?? promo.display_config.cta ?? "Book Now",
    primary: promo.display_config.colours?.primary ?? "#0B1F4A",
    accent: promo.display_config.colours?.accent ?? "#2563EB",
    landing,
    website: "shalean.co.za",
    endsAt: promo.ends_at,
    heroImageUrl: promo.hero_image_url ?? promo.banner_image_url ?? null,
    logoUrl: promo.logo_url ?? null,
    badgeLabel: isFirstBooking ? "New customers" : "Limited offer",
    ratingLabel: "4.9 Rating",
    benefits: ["Trusted Cleaners", "Fully Insured", "Easy Online Booking"],
    trustItems: [
      { icon: "★", label: "4.9 Rating" },
      { icon: "✓", label: "Fully Insured" },
      { icon: "✓", label: "Background Checked" },
    ],
  };
}

/** Generate all channel copy, social templates, QR, and wire landing path. */
export async function generateFullCampaign(
  admin: Admin,
  promo: PromotionRow,
  actor?: string,
): Promise<{
  content: CampaignContentRow[];
  assets: CampaignAssetRow[];
  promotion: PromotionRow;
  generatedBy: "template" | "ai";
}> {
  const landingPath = campaignLandingPath(promo);
  const bookingUrl = absoluteCampaignUrl({ ...promo, landing_page_path: landingPath });
  const { items, generatedBy } = await generateCampaignContent({
    promotion: promo,
    bookingUrl,
  });

  const now = new Date().toISOString();
  const contentRows = items.map((item) => ({
    promotion_id: promo.id,
    channel: item.channel,
    title: item.title,
    body: item.body,
    hashtags: item.hashtags,
    cta: item.cta,
    html_body: item.htmlBody,
    meta: item.meta,
    status: "ready" as const,
    generated_by: generatedBy,
    version: 1,
    updated_at: now,
  }));

  const { error: contentErr } = await admin.from("campaign_content").upsert(contentRows, {
    onConflict: "promotion_id,channel",
  });
  if (contentErr) throw new Error(contentErr.message);

  const qrDataUrl = await generateQrDataUrl(bookingUrl);
  const payload = brandPayload(promo);

  await admin.from("campaign_assets").delete().eq("promotion_id", promo.id).in(
    "asset_type",
    [...SOCIAL_IMAGE_SPECS.map((s) => s.assetType), "qr_code"],
  );

  const assetRows = [
    ...SOCIAL_IMAGE_SPECS.map((spec, i) => ({
      promotion_id: promo.id,
      asset_type: spec.assetType,
      label: spec.label,
      width: spec.width,
      height: spec.height,
      image_url: null as string | null,
      template_payload: { ...payload, format: spec.assetType },
      sort_order: i,
      updated_at: now,
    })),
    {
      promotion_id: promo.id,
      asset_type: "qr_code",
      label: "Campaign QR Code",
      width: 512,
      height: 512,
      image_url: qrDataUrl,
      template_payload: { url: bookingUrl },
      sort_order: 100,
      updated_at: now,
    },
  ];

  const { error: assetErr } = await admin.from("campaign_assets").insert(assetRows);
  if (assetErr) throw new Error(assetErr.message);

  const { data: updated, error: updErr } = await admin
    .from("promotions")
    .update({
      landing_page_path: landingPath,
      qr_code_data_url: qrDataUrl,
      content_generated_at: now,
      cta_label: promo.cta_label ?? promo.display_config.cta ?? "Book now",
      updated_by: actor ?? null,
      updated_at: now,
      display_config: {
        ...promo.display_config,
        countdown: promo.display_config.countdown ?? true,
        landing: landingPath,
      },
    })
    .eq("id", promo.id)
    .select("*")
    .single();
  if (updErr) throw new Error(updErr.message);

  await admin.from("promotion_events").insert({
    promotion_id: promo.id,
    event_type: "content_generated",
    metadata: { generatedBy, channels: items.length, actor: actor ?? null },
  });

  await admin.from("promotion_audit_log").insert({
    promotion_id: promo.id,
    action: "generate_campaign",
    actor: actor ?? null,
    after_state: { generatedBy, channels: items.map((i) => i.channel) },
  });

  const content = await listCampaignContent(admin, promo.id);
  const assets = await listCampaignAssets(admin, promo.id);

  return {
    content,
    assets,
    promotion: {
      ...promo,
      landing_page_path: landingPath,
      qr_code_data_url: qrDataUrl,
      content_generated_at: now,
      cta_label: (updated as { cta_label?: string | null }).cta_label ?? promo.cta_label,
    },
    generatedBy,
  };
}

export async function getPromotionBySlug(
  admin: Admin,
  slug: string,
): Promise<PromotionRow | null> {
  const { data, error } = await admin.from("promotions").select("*").eq("slug", slug).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const { mapPromotionRow } = await import("./evaluate");
  return mapPromotionRow(data as Record<string, unknown>);
}

export async function listAllCampaignContent(
  admin: Admin,
  channel?: CampaignContentChannel,
): Promise<(CampaignContentRow & { promotion?: { name: string; slug: string; status: string } })[]> {
  let q = admin
    .from("campaign_content")
    .select("*, promotions(name, slug, status)")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (channel) q = q.eq("channel", channel);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const r = row as CampaignContentRow & {
      promotions?: { name: string; slug: string; status: string } | null;
    };
    return { ...r, promotion: r.promotions ?? undefined };
  });
}

export async function listAllCampaignAssets(admin: Admin): Promise<
  (CampaignAssetRow & { promotion?: { name: string; slug: string; status: string } })[]
> {
  const { data, error } = await admin
    .from("campaign_assets")
    .select("*, promotions(name, slug, status)")
    .order("updated_at", { ascending: false })
    .limit(300);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const r = row as CampaignAssetRow & {
      promotions?: { name: string; slug: string; status: string } | null;
    };
    return { ...r, promotion: r.promotions ?? undefined };
  });
}
