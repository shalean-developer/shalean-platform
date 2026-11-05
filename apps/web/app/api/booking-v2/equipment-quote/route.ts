import { NextResponse } from "next/server";
import { issueEquipmentQuoteReceipt } from "@/lib/booking-v2/equipmentQuoteAuthority";
import { fcoEquipmentReceiptEnforced, fcoEquipmentReceiptSecret, fcoEquipmentPricingRevision } from "@/lib/booking-v2/fcoEquipmentServerGuard";
import { z } from "zod";
import { loadEquipmentPricingConfig } from "@/lib/booking-v2/loadEquipmentPricingConfig";
import { quoteEquipmentForAddress } from "@/lib/booking-v2/equipmentPricing";

export const runtime = "nodejs";

const bodySchema = z.object({
  address: z.string().min(5),
  suburb: z.string().min(2),
  city: z.string().optional().default("Cape Town"),
  postalCode: z.string().optional().default(""),
  equipmentRequired: z.boolean().default(true),
  serviceSlug: z.string().optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json({ error: first?.message ?? "Invalid address." }, { status: 422 });
  }

  const config = await loadEquipmentPricingConfig();

  if (!config.is_active) {
    return NextResponse.json({
      quote: null,
      message: "Equipment delivery is not available at this time.",
    });
  }

  const quote = await quoteEquipmentForAddress({
    config,
    address: parsed.data.address,
    suburb: parsed.data.suburb,
    city: parsed.data.city,
    postalCode: parsed.data.postalCode,
    equipmentRequired: parsed.data.equipmentRequired,
  });

  if (fcoEquipmentReceiptEnforced(parsed.data.serviceSlug ?? "") && parsed.data.equipmentRequired) {
    // An unavailable/manual quotation is not a valid automatic checkout price.
    if (!quote || quote.manual_quote_required || quote.geocode_error || !config.is_active) {
      return NextResponse.json({
        quote: quote ?? null,
        error: "Equipment delivery requires a manual quotation.",
        code: "EQUIPMENT_MANUAL_QUOTE_REQUIRED",
      }, { status: 409 });
    }
    try {
      const revision = fcoEquipmentPricingRevision(config);
      const nowMs = Date.now();
      const receipt = issueEquipmentQuoteReceipt({
        address: {
          address: parsed.data.address,
          suburb: parsed.data.suburb,
          city: parsed.data.city,
          postalCode: parsed.data.postalCode,
        },
        distanceKm: quote.distance_km,
        baseFeeZar: quote.base_fee,
        distanceChargeZar: quote.distance_charge,
        logisticsFeeZar: quote.logistics_fee,
        pricePerKmZar: quote.price_per_km,
        baseLocation: quote.base_location,
        pricingConfigRevision: revision,
        manualQuoteRequired: false,
        issuedAtMs: nowMs,
        expiresAtMs: nowMs + 10 * 60_000,
        secret: fcoEquipmentReceiptSecret(),
      });
      return NextResponse.json({
        quote: { ...quote, authorityReceipt: receipt },
        config: { manual_quote_message: config.manual_quote_message },
      }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      console.error("[equipment-quote] receipt issuance failed", error);
      return NextResponse.json({ error: "Equipment quote security unavailable." }, { status: 503 });
    }
  }
  return NextResponse.json({ quote, config: { manual_quote_message: config.manual_quote_message } });
}
