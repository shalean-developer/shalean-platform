import { NextResponse } from "next/server";

import { loadQuotePricingCatalog } from "@/lib/quote/loadQuotePricingCatalog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public catalog for quote form — names only, no prices. */
export async function GET() {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Service unavailable." }, { status: 503 });

  try {
    return NextResponse.json(await loadQuotePricingCatalog(admin));
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (code === "42P01") return NextResponse.json({ services: [], extras: [] });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Catalog unavailable." }, { status: 500 });
  }
}
