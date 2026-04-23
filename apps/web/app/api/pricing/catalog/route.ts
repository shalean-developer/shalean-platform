import { NextResponse } from "next/server";
import { buildPricingRatesSnapshotFromDb } from "@/lib/pricing/buildPricingRatesSnapshotFromDb";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public read of active pricing catalog (RLS allows anon/authenticated SELECT).
 * Returns a {@link PricingRatesSnapshot}-compatible payload for the booking funnel + widgets.
 */
export async function GET() {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Catalog unavailable." }, { status: 503 });
  }

  const { data: extrasMeta, error: metaErr } = await admin
    .from("pricing_extras")
    .select("slug, name, description, is_popular, sort_order, service_type, price")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (metaErr) {
    console.error("[pricing/catalog] extras meta:", metaErr.message);
    return NextResponse.json({ ok: false, error: "Catalog unavailable." }, { status: 503 });
  }

  const snapshot = await buildPricingRatesSnapshotFromDb(admin);
  if (!snapshot) {
    return NextResponse.json({ ok: false, error: "Catalog unavailable." }, { status: 503 });
  }

  const orderedExtraSlugs = (extrasMeta ?? [])
    .map((r) => (r as { slug?: string }).slug)
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0);

  return NextResponse.json({
    ok: true,
    snapshot,
    orderedExtraSlugs,
    extrasMeta: extrasMeta ?? [],
  });
}
