import { NextResponse } from "next/server";
import { buildPricingRatesSnapshotFromDb } from "@/lib/pricing/buildPricingRatesSnapshotFromDb";
import { quoteLockFromRequestBodyWithSnapshot } from "@/lib/booking/bookingLockQuote";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server recomputes the quote from Supabase and compares with client-supplied totals (tamper check).
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const b = body !== null && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const clientTotal = Number(b.clientTotalZar ?? b.client_total_zar);
  const clientHours = Number(b.clientHours ?? b.client_hours);

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Validation unavailable." }, { status: 503 });
  }

  const snapshot = await buildPricingRatesSnapshotFromDb(admin);
  if (!snapshot) {
    return NextResponse.json({ ok: false, error: "Catalog unavailable." }, { status: 503 });
  }

  const q = quoteLockFromRequestBodyWithSnapshot(
    {
      serviceType: b.serviceType ?? b.service_type ?? b.service,
      bedrooms: b.bedrooms ?? b.rooms,
      bathrooms: b.bathrooms,
      extraRooms: b.extraRooms ?? b.extra_rooms,
      extras: b.extras,
      time: b.time,
      vipTier: b.vipTier ?? b.vip_tier,
      cleanersCount: b.cleanersCount ?? b.cleaners_count,
    },
    snapshot,
    { allowClientDynamicAdjustment: false },
  );

  if (!q.ok) {
    return NextResponse.json({ ok: false, error: q.error }, { status: q.status });
  }

  const server = q.quote;
  const totalOk = Number.isFinite(clientTotal) && Math.abs(clientTotal - server.totalZar) <= 1;
  const hoursOk = Number.isFinite(clientHours) && Math.abs(clientHours - server.hours) <= 0.1;

  if (!totalOk || !hoursOk) {
    return NextResponse.json(
      {
        ok: false,
        error: "Price mismatch — refresh your quote.",
        errorCode: "PRICE_MISMATCH",
        server: { totalZar: server.totalZar, hours: server.hours },
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    totalZar: server.totalZar,
    hours: server.hours,
  });
}
