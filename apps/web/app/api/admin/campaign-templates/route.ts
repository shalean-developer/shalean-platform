import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  listAllCampaignAssets,
  listAllCampaignContent,
  listCampaignTemplates,
} from "@/lib/promotions/campaignContent";
import type { CampaignContentChannel } from "@/lib/promotions/campaignChannels";
import { createPromotion } from "@/lib/promotions/server";
import { getCampaignTemplateByKey } from "@/lib/promotions/campaignContent";
import type { CreatePromotionInput, DiscountType, PromotionType } from "@/lib/promotions/types";
import { generateFullCampaign } from "@/lib/promotions/campaignContent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const url = new URL(request.url);
  const view = url.searchParams.get("view") ?? "templates";
  const channel = url.searchParams.get("channel") as CampaignContentChannel | null;

  try {
    if (view === "content") {
      const content = await listAllCampaignContent(admin, channel ?? undefined);
      return NextResponse.json({ content });
    }
    if (view === "assets") {
      const assets = await listAllCampaignAssets(admin);
      return NextResponse.json({ assets });
    }
    const templates = await listCampaignTemplates(admin);
    return NextResponse.json({ templates });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load." },
      { status: 500 },
    );
  }
}

/** Instantiate a campaign from a reusable template. */
export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  let body: {
    templateKey?: string;
    name?: string;
    discountValue?: number;
    promoCode?: string;
    startsAt?: string | null;
    endsAt?: string | null;
    generate?: boolean;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  if (!body.templateKey) {
    return NextResponse.json({ error: "templateKey required." }, { status: 400 });
  }

  try {
    const template = await getCampaignTemplateByKey(admin, body.templateKey);
    if (!template) return NextResponse.json({ error: "Template not found." }, { status: 404 });

    const discountValue = body.discountValue ?? Number(template.default_discount_value);
    const prefix = template.default_promo_code_prefix;
    const promoCode =
      body.promoCode?.trim() ||
      (prefix ? `${prefix}-${Math.round(discountValue)}` : null);

    const input: CreatePromotionInput = {
      name: body.name?.trim() || template.name,
      description: template.description,
      promotion_type: template.promotion_type as PromotionType,
      discount_type: template.default_discount_type as DiscountType,
      discount_value: discountValue,
      promo_code: promoCode,
      status: body.startsAt ? "scheduled" : "draft",
      starts_at: body.startsAt ?? null,
      ends_at: body.endsAt ?? null,
      auto_apply: template.promotion_type === "first_booking",
      customer_eligibility: (template.default_eligibility as CreatePromotionInput["customer_eligibility"]) ?? {},
      display_config: (template.default_display_config as CreatePromotionInput["display_config"]) ?? {},
      show_on_homepage: true,
      show_on_booking: true,
      show_on_pricing: true,
      show_announcement_bar: true,
      show_featured_card: true,
      show_booking_banner: true,
      show_popup: false,
      show_dashboard_card: true,
      template_key: template.key,
      usage_limit_per_customer: template.promotion_type === "first_booking" ? 1 : null,
    };

    const promotion = await createPromotion(admin, input, auth.email);
    let generated = null;
    if (body.generate !== false) {
      generated = await generateFullCampaign(admin, promotion, auth.email);
    }

    return NextResponse.json(
      { promotion: generated?.promotion ?? promotion, generated },
      { status: 201 },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to create from template." },
      { status: 500 },
    );
  }
}
