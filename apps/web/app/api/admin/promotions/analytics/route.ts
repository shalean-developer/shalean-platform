import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getPromotionsAnalytics, promotionsAnalyticsToCsv } from "@/lib/promotions/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;
  const promotionId = url.searchParams.get("promotionId") ?? undefined;
  const format = url.searchParams.get("format");

  try {
    const analytics = await getPromotionsAnalytics(admin, { from, to, promotionId });
    if (format === "csv") {
      const csv = promotionsAnalyticsToCsv(analytics.summaries);
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="promotions-analytics.csv"',
        },
      });
    }
    return NextResponse.json(analytics);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load analytics." },
      { status: 500 },
    );
  }
}
