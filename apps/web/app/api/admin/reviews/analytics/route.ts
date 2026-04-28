import { NextResponse } from "next/server";
import { requireAdminFromRequest } from "@/lib/admin/requireAdmin";
import { computeReviewPromptConversionRate } from "@/lib/reviews/reviewFunnelMetrics";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminFromRequest(request);
  if (!auth.ok) return auth.response;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const daysRaw = Number(searchParams.get("days") ?? "7");
  const days = Number.isFinite(daysRaw) && daysRaw > 0 && daysRaw <= 90 ? daysRaw : 7;
  const untilIso = new Date().toISOString();
  const sinceIso = new Date(Date.now() - days * 86400000).toISOString();

  const funnel = await computeReviewPromptConversionRate(admin, sinceIso, untilIso);

  return NextResponse.json({
    window: { sinceIso, untilIso, days },
    promptsSent: funnel.promptsSent,
    promptClicks: funnel.promptClicks,
    reviewsSubmitted: funnel.reviewsSubmitted,
    conversionSubmittedPerPrompt: funnel.conversionRate,
    clickThroughClicksPerPrompt: funnel.clickThroughRate,
    conversionPct:
      funnel.conversionRate != null ? Math.round(funnel.conversionRate * 10000) / 100 : null,
    clickThroughPct:
      funnel.clickThroughRate != null ? Math.round(funnel.clickThroughRate * 10000) / 100 : null,
  });
}
