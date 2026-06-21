import { NextResponse } from "next/server";
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
    const first = parsed.error.errors[0];
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

  return NextResponse.json({ quote, config: { manual_quote_message: config.manual_quote_message } });
}
