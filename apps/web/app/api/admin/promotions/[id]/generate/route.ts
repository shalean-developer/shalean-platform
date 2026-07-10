import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { generateFullCampaign, listCampaignAssets, listCampaignContent } from "@/lib/promotions/campaignContent";
import { getPromotionById } from "@/lib/promotions/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Generate multi-channel campaign content, social templates, and QR. */
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { id } = await ctx.params;
  try {
    const promotion = await getPromotionById(admin, id);
    if (!promotion) return NextResponse.json({ error: "Not found." }, { status: 404 });

    const result = await generateFullCampaign(admin, promotion, auth.email);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to generate campaign." },
      { status: 500 },
    );
  }
}

export async function GET(request: Request, ctx: Ctx) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { id } = await ctx.params;
  try {
    const [content, assets] = await Promise.all([
      listCampaignContent(admin, id),
      listCampaignAssets(admin, id),
    ]);
    return NextResponse.json({ content, assets });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load campaign content." },
      { status: 500 },
    );
  }
}
