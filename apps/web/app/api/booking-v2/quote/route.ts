import { NextResponse } from "next/server";
import { z } from "zod";
import { buildSignedCustomerPricingFromForm } from "@/lib/booking-v2/buildSignedCustomerPricingFromForm";
import { buildPricingRatesSnapshotFromDb } from "@/lib/pricing/buildPricingRatesSnapshotFromDb";
import { getOrCreatePricingVersionId } from "@/lib/booking/pricingVersionDb";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { loadCachedBookingV2Catalog } from "@/lib/booking-v2/loadBookingV2Catalog";
import { SERVICE_SLUGS } from "@/src/features/booking-v2/config/serviceConfig";
import type { EquipmentQuoteResult } from "@/lib/booking-v2/equipmentPricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const detailValue = z.union([z.string(), z.number(), z.boolean()]);
const quoteSchema = z.object({
  serviceSlug: z.enum(SERVICE_SLUGS),
  serviceDetails: z.record(detailValue).default({}),
  selectedExtras: z.array(z.string()).default([]),
  cleanerMode: z.enum(["team", "individual_cleaners"]),
  cleanerCount: z.number().int().min(1).max(3).default(1),
  bookingType: z.enum(["once_off", "recurring"]),
  recurringFrequency: z.enum(["weekly", "fortnightly", "monthly", "custom", ""]).default(""),
  equipmentRequired: z.enum(["yes", "no", ""]).default("no"),
  equipmentQuote: z.record(z.unknown()).nullable().default(null),
  vipTier: z.string().nullable().default(null),
});

export async function POST(request: Request) {
  const startedAt = performance.now();
  const parsed = quoteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid quote details." }, { status: 400 });
  }

  try {
    const { catalog, feesConfig } = await loadCachedBookingV2Catalog();
    const liveConfig = catalog[parsed.data.serviceSlug] ?? null;
    if (!liveConfig) {
      return NextResponse.json({ error: "Live pricing is unavailable." }, { status: 503 });
    }

    const pricingSummary = buildSignedCustomerPricingFromForm({
      serviceSlug: parsed.data.serviceSlug,
      values: {
        serviceDetails: parsed.data.serviceDetails,
        selectedExtras: parsed.data.selectedExtras,
        cleanerMode: parsed.data.cleanerMode,
        cleanerCount: parsed.data.cleanerCount,
        bookingType: parsed.data.bookingType,
        recurringFrequency: parsed.data.recurringFrequency,
        equipmentRequired: parsed.data.equipmentRequired,
        equipmentQuote: parsed.data.equipmentQuote as EquipmentQuoteResult | null,
      },
      liveConfig,
      feesConfig,
      vipTier: parsed.data.vipTier,
    });

    const admin = getSupabaseAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Live pricing is unavailable." }, { status: 503 });
    }
    const snapshot = await buildPricingRatesSnapshotFromDb(admin);
    const pricingVersion = snapshot ? await getOrCreatePricingVersionId(admin, snapshot) : null;
    if (!pricingVersion || !pricingSummary.quote_signature) {
      return NextResponse.json({ error: "Could not lock the current price." }, { status: 503 });
    }
    const lockedAt = new Date();
    return NextResponse.json(
      {
        pricingSummary,
        quoteLock: {
          pricingVersionId: pricingVersion.id,
          quoteSignature: pricingSummary.quote_signature,
          lockedAt: lockedAt.toISOString(),
          expiresAt: new Date(lockedAt.getTime() + 30 * 60 * 1000).toISOString(),
        },
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "Server-Timing": `quote;dur=${(performance.now() - startedAt).toFixed(1)}`,
        },
      },
    );
  } catch (error) {
    console.error("[booking-v2/quote] live pricing failed", error);
    return NextResponse.json({ error: "Live pricing is unavailable." }, { status: 503 });
  }
}
