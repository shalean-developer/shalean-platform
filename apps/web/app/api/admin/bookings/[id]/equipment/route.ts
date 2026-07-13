import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  buildEquipmentPricingSnapshot,
  equipmentPersistFields,
  quoteEquipmentForAddress,
} from "@/lib/booking-v2/equipmentPricing";
import { loadEquipmentPricingConfig } from "@/lib/booking-v2/loadEquipmentPricingConfig";
import {
  buildAdminEquipmentFeeUpdatePatch,
  type AdminEquipmentFeeBookingRow,
} from "@/lib/booking/adminEquipmentFeeUpdate";

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
      "id, location, suburb, status, payment_status, payment_completed_at, total_price, total_paid_zar, total_paid_cents, amount_paid_cents, equipment_logistics_fee, equipment_required, manual_quote_required",
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (readErr) return NextResponse.json({ error: "Could not load booking." }, { status: 500 });
  if (!existing?.id) return NextResponse.json({ error: "Booking not found." }, { status: 404 });

  const row = existing as AdminEquipmentFeeBookingRow;

  const equipConfig = await loadEquipmentPricingConfig();
  let quote = equipmentRequired
    ? await quoteEquipmentForAddress({
        config: equipConfig,
        address: address || String(row.location ?? ""),
        suburb: suburb || String(row.suburb ?? "Cape Town"),
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

  const prevFee = Number(row.equipment_logistics_fee ?? 0);
  const nextFee = equipmentRequired ? quote?.logistics_fee ?? 0 : 0;
  const built = buildAdminEquipmentFeeUpdatePatch({
    existing: row,
    equipmentPatch,
    nextFee,
    prevFee,
  });

  const { error: updateErr } = await admin.from("bookings").update(built.patch).eq("id", bookingId);

  if (updateErr) return NextResponse.json({ error: "Could not update equipment pricing." }, { status: 500 });

  await admin.from("booking_changes").insert({
    booking_id: bookingId,
    changed_by: auth.userId,
    before: {
      equipment_required: row.equipment_required,
      equipment_logistics_fee: row.equipment_logistics_fee,
      total_price: row.total_price,
      total_paid_zar: row.total_paid_zar,
      amount_paid_cents: row.amount_paid_cents,
    },
    after: {
      equipment_required: equipmentRequired,
      equipment_logistics_fee: nextFee,
      total_price: built.nextTotalPrice,
      total_paid_zar: built.preservedCashZar,
      amount_paid_cents: built.paid ? Math.round(built.preservedCashZar * 100) : 0,
      payment_mismatch: built.paymentMismatch,
    },
    summary: {
      equipment_fee_override: overrideFee != null && overrideFee !== prevFee,
      reason: overrideReason || null,
      fee_delta: nextFee - prevFee,
      cash_preserved: built.paid,
      payment_mismatch: built.paymentMismatch,
    },
  });

  return NextResponse.json({
    ok: true,
    equipment_logistics_fee: built.nextFee,
    total_price: built.nextTotalPrice,
    total_paid_zar: built.preservedCashZar,
    payment_mismatch: built.paymentMismatch,
  });
}
