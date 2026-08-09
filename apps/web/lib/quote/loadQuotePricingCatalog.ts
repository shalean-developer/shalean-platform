import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  attachExtrasToPricingServices,
  type QuotePricingExtraRow,
} from "@/lib/quote/quotePricingExtras";
import type { QuotePublicExtra, QuotePublicService } from "@/lib/quote/types";

export async function loadQuotePricingCatalog(
  admin: SupabaseClient,
): Promise<{ services: QuotePublicService[]; extras: QuotePublicExtra[] }> {
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

  if (servicesRes.error) throw servicesRes.error;
  if (extrasRes.error) throw extrasRes.error;

  const configJson = (configRes.data as { config?: unknown } | null)?.config ?? null;
  const pricingExtras = (extrasRes.data ?? []) as QuotePricingExtraRow[];
  const services = attachExtrasToPricingServices(servicesRes.data ?? [], pricingExtras, configJson);
  const extras: QuotePublicExtra[] = pricingExtras.map(
    ({ id, slug, name, service_type, is_popular }) => ({
      id,
      slug,
      name,
      service_type,
      is_popular,
    }),
  );
  return { services, extras } as { services: QuotePublicService[]; extras: QuotePublicExtra[] };
}
