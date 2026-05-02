import { NextResponse } from "next/server";
import { getServiceLabel } from "@/components/booking/serviceCategories";
import { insertBookingRowUnified } from "@/lib/booking/createBookingUnified";
import { CLEANER_RESPONSE } from "@/lib/dispatch/cleanerResponseStatus";
import { ensureBookingAssignment } from "@/lib/dispatch/ensureBookingAssignment";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function loadTestSecret(): string | null {
  const s = process.env.DISPATCH_LOAD_TEST_SECRET?.trim();
  return s && s.length > 0 ? s : null;
}

function offerTimeoutMsForLoadTest(): number {
  const raw = process.env.DISPATCH_LOAD_TEST_OFFER_TIMEOUT_MS?.trim();
  const n = raw ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return 12_000;
  return Math.min(120_000, Math.max(3_000, Math.floor(n)));
}

function futureDateYmd(daysAhead: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

/**
 * Creates a real `bookings` row (standard service, paid-ish pending) and runs the same
 * auto-dispatch path as admin/cron (`ensureBookingAssignment`).
 *
 * Guarded by `DISPATCH_LOAD_TEST_SECRET` (header `x-dispatch-load-test-secret`).
 * Disabled on production deploys unless `ENABLE_DISPATCH_LOAD_TEST=true`.
 */
export async function POST(request: Request) {
  const isProd =
    process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
  if (isProd && process.env.ENABLE_DISPATCH_LOAD_TEST !== "true") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const secret = loadTestSecret();
  if (!secret) {
    return NextResponse.json(
      { error: "DISPATCH_LOAD_TEST_SECRET is not configured on the server." },
      { status: 503 },
    );
  }

  const provided =
    request.headers.get("x-dispatch-load-test-secret")?.trim() ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ??
    "";
  if (provided !== secret) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: { index?: number; test?: boolean } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  const index = typeof body.index === "number" && Number.isFinite(body.index) ? Math.floor(body.index) : 0;

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  type LocRow = {
    id: string;
    city_id: string | null;
    name: string | null;
    slug: string | null;
    latitude: number | null;
    longitude: number | null;
  };

  const { data: locWithCoords, error: locErr } = await admin
    .from("locations")
    .select("id, city_id, name, slug, latitude, longitude")
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .limit(1)
    .maybeSingle();

  if (locErr) {
    return NextResponse.json({ error: `locations: ${locErr.message}` }, { status: 503 });
  }

  let loc: LocRow | null =
    locWithCoords && typeof (locWithCoords as { id?: unknown }).id === "string"
      ? (locWithCoords as LocRow)
      : null;

  if (!loc) {
    if (isProd) {
      return NextResponse.json(
        {
          error:
            "No location with coordinates — add latitude/longitude on at least one `locations` row (required in production).",
        },
        { status: 503 },
      );
    }

    const { data: anyLoc, error: anyErr } = await admin
      .from("locations")
      .select("id, city_id, name, slug, latitude, longitude")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (anyErr || !anyLoc || typeof (anyLoc as { id?: unknown }).id !== "string") {
      return NextResponse.json(
        {
          error:
            "No `locations` rows (or none with coordinates). Create a service area row, or add lat/lng via migration / SQL.",
        },
        { status: 503 },
      );
    }

    const row = anyLoc as LocRow;
    const la = row.latitude;
    const lo = row.longitude;
    if (
      la != null &&
      lo != null &&
      Number.isFinite(Number(la)) &&
      Number.isFinite(Number(lo))
    ) {
      loc = row;
    } else {
      const defLat = Number(process.env.DISPATCH_LOAD_TEST_SEED_LAT ?? "-33.9249");
      const defLng = Number(process.env.DISPATCH_LOAD_TEST_SEED_LNG ?? "18.4241");
      if (!Number.isFinite(defLat) || !Number.isFinite(defLng)) {
        return NextResponse.json(
          { error: "Invalid DISPATCH_LOAD_TEST_SEED_LAT or DISPATCH_LOAD_TEST_SEED_LNG." },
          { status: 503 },
        );
      }
      const { data: patched, error: patchErr } = await admin
        .from("locations")
        .update({ latitude: defLat, longitude: defLng })
        .eq("id", row.id)
        .select("id, city_id, name, slug, latitude, longitude")
        .maybeSingle();
      if (patchErr || !patched || typeof (patched as { id?: unknown }).id !== "string") {
        return NextResponse.json(
          {
            error: `Could not set default coordinates on location ${row.id}: ${patchErr?.message ?? "unknown"}.`,
          },
          { status: 503 },
        );
      }
      loc = patched as LocRow;
    }
  }

  const locationLabel = String((loc as { name?: string | null; slug?: string | null }).name ?? "").trim()
    ? String((loc as { name?: string | null }).name)
    : String((loc as { slug?: string | null }).slug ?? "load-test");
  const cityId =
    typeof (loc as { city_id?: string | null }).city_id === "string"
      ? (loc as { city_id: string }).city_id
      : null;

  const dateYmd = futureDateYmd(3);
  const minute = index % 59;
  const timeHm = `10:${String(minute).padStart(2, "0")}`;

  const paystackReference = `loadtest_${crypto.randomUUID().replace(/-/g, "")}`;

  const ins = await insertBookingRowUnified(admin, {
    source: "dispatch_load_test",
    rowBase: {
      paystack_reference: paystackReference,
      customer_email: null,
      customer_name: "Dispatch load test",
      customer_phone: null,
      user_id: null,
      amount_paid_cents: 1,
      total_paid_cents: 1,
      base_amount_cents: 1,
      extras_amount_cents: 0,
      currency: "ZAR",
      service_slug: "standard",
      status: "pending",
      dispatch_status: "searching",
      cleaner_response_status: CLEANER_RESPONSE.NONE,
      surge_multiplier: 1,
      service: getServiceLabel("standard"),
      location: locationLabel,
      location_id: (loc as { id: string }).id,
      city_id: cityId,
      date: dateYmd,
      time: timeHm,
      total_paid_zar: 1,
      service_fee_cents: 0,
      booking_source: "load_test",
    },
    rooms: 2,
    bathrooms: 1,
    extrasRaw: [],
    serviceSlugForFlat: "standard",
    locationForFlat: locationLabel,
    dateForFlat: dateYmd,
    timeForFlat: timeHm,
    snapshotExtension: { load_test: true, index },
    select: "id",
    logInsert: false,
  });

  if (!ins.ok) {
    return NextResponse.json({ ok: false, error: ins.error, pgCode: ins.pgCode }, { status: 400 });
  }

  const bookingId = ins.id;
  const tLabel = `dispatch-${bookingId}`;
  console.time(tLabel);

  const offerTimeoutMs = offerTimeoutMsForLoadTest();
  const result = await ensureBookingAssignment(admin, bookingId, {
    source: "admin_dispatch_api",
    smartAssign: { offerTimeoutMs },
  });

  console.timeEnd(tLabel);

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        bookingId,
        error: result.error,
        message: result.message,
        offerTimeoutMs,
      },
      { status: result.error === "no_candidate" ? 422 : 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    bookingId,
    assignmentKind: result.assignmentKind,
    cleanerId: result.assignmentKind === "individual" ? result.cleanerId : undefined,
    teamId: result.assignmentKind === "team" ? result.teamId : undefined,
    offerTimeoutMs,
  });
}
