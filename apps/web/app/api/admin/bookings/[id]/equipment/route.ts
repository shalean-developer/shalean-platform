import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  buildEquipmentPricingSnapshot,
  equipmentPersistFields,
  quoteEquipmentForAddress,
} from "@/lib/booking-v2/equipmentPricing";
import { loadEquipmentPricingConfig } from "@/lib/booking-v2/loadEquipmentPricingConfig";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id: bookingId } = await context.params;
  if (!bookingId) {
    return NextResponse.json({ error: "Missing booking id." }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const equipmentRequired = body.equipment_required === true;
  const overrideReasonRaw =
    typeof body.equipment_fee_override_reason === "string" ? body.equipment_fee_override_reason.trim() : "";
  const overrideReason = overrideReasonRaw.slice(0, 500);
  const overrideFee =
    typeof body.equipment_logistics_fee === "number" && Number.isFinite(body.equipment_logistics_fee)
      ? Math.round(body.equipment_logistics_fee)
      : null;

  const address = typeof body.address === "string" ? body.address.trim() : "";
  const suburb = typeof body.suburb === "string" ? body.suburb.trim() : "";
  const city = typeof body.city === "string" ? body.city.trim() : "Cape Town";
  const postalCode = typeof body.postal_code === "string" ? body.postal_code.trim() : "";

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const { data: existing, error: readErr } = await admin
    .from("bookings")
    .select(
      "id, location, suburb, total_paid_zar, equipment_logistics_fee, equipment_required, manual_quote_required",
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!existing?.id) return NextResponse.json({ error: "Booking not found." }, { status: 404 });

  const equipConfig = await loadEquipmentPricingConfig();
  let quote = equipmentRequired
    ? await quoteEquipmentForAddress({
        config: equipConfig,
        address: address || String(existing.location ?? ""),
        suburb: suburb || String(existing.suburb ?? "Cape Town"),
        city,
        postalCode,
        equipmentRequired: true,
      })
    : null;

  if (equipmentRequired && quote && overrideFee != null && overrideFee !== quote.logistics_fee) {
    if (overrideReason.length < 3) {
      return NextResponse.json(
        { error: "equipment_fee_override_reason is required when overriding the equipment fee." },
        { status: 400 },
      );
    }
    quote = { ...quote, logistics_fee: overrideFee };
  }

  const equipmentPatch = equipmentPersistFields({
    equipmentRequired,
    quote,
    pricingSnapshot:
      equipmentRequired && quote
        ? buildEquipmentPricingSnapshot({ config: equipConfig, quote })
        : null,
    overrideReason: overrideReason || null,
  });

  const prevFee = Number(existing.equipment_logistics_fee ?? 0);
  const nextFee = equipmentRequired ? quote?.logistics_fee ?? 0 : 0;
  const feeDelta = nextFee - prevFee;
  const prevTotal = Number(existing.total_paid_zar ?? 0);
  const nextTotal = Math.max(0, Math.round(prevTotal + feeDelta));

  const { error: updateErr } = await admin
    .from("bookings")
    .update({
      ...equipmentPatch,
      total_paid_zar: nextTotal,
      amount_paid_cents: nextTotal * 100,
    })
    .eq("id", bookingId);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  await admin.from("booking_changes").insert({
    booking_id: bookingId,
    changed_by: auth.userId,
    before: {
      equipment_required: existing.equipment_required,
      equipment_logistics_fee: existing.equipment_logistics_fee,
      total_paid_zar: existing.total_paid_zar,
    },
    after: {
      equipment_required: equipmentRequired,
      equipment_logistics_fee: nextFee,
      total_paid_zar: nextTotal,
    },
    summary: {
      equipment_fee_override: overrideFee != null && overrideFee !== prevFee,
      reason: overrideReason || null,
      fee_delta: feeDelta,
    },
  });

  return NextResponse.json({ ok: true, equipment_logistics_fee: nextFee, total_paid_zar: nextTotal });
}
