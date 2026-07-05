import { NextResponse } from "next/server";

import { attachExtrasToPricingServices } from "@/lib/quote/quotePricingExtras";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public catalog for quote form — names only, no prices. */
export async function GET() {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Service unavailable." }, { status: 503 });

  const [servicesRes, extrasRes, configRes] = await Promise.all([
    admin
      .from("pricing_services")
      .select("id, slug, name, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    admin
      .from("pricing_extras")
      .select("id, slug, name, service_type, is_popular, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    admin.from("pricing_booking_config").select("config").eq("id", "default").maybeSingle(),
  ]);

  if (servicesRes.error?.code === "42P01" || extrasRes.error?.code === "42P01") {
    return NextResponse.json({ services: [], extras: [] });
  }

  if (servicesRes.error) {
    return NextResponse.json({ error: servicesRes.error.message }, { status: 500 });
  }
  if (extrasRes.error) {
    return NextResponse.json({ error: extrasRes.error.message }, { status: 500 });
  }

  const configJson = (configRes.data as { config?: unknown } | null)?.config ?? null;
  const extras = extrasRes.data ?? [];
  const services = attachExtrasToPricingServices(servicesRes.data ?? [], extras, configJson);

  return NextResponse.json({ services, extras });
}
