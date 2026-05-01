import { NextResponse } from "next/server";
import { validateCustomerDetails } from "@/lib/booking/customerDetailsValidation";
import { insertBookingFromFlowIntake } from "@/lib/booking/insertBookingFlowIntake";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JsonBody = {
  service?: unknown;
  bedrooms?: unknown;
  bathrooms?: unknown;
  extraRooms?: unknown;
  extras?: unknown;
  date?: unknown;
  time?: unknown;
  location?: unknown;
  locationSlug?: unknown;
  serviceAreaLocationId?: unknown;
  serviceAreaCityId?: unknown;
  serviceAreaName?: unknown;
  selected_cleaner_id?: unknown;
  cleanerId?: unknown;
  customerName?: unknown;
  customerEmail?: unknown;
  customerPhone?: unknown;
};

export async function POST(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ success: false, error: "Server unavailable." }, { status: 503 });
  }

  let body: JsonBody;
  try {
    body = (await request.json()) as JsonBody;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON." }, { status: 400 });
  }

  const customerName = typeof body.customerName === "string" ? body.customerName : "";
  const customerEmail = typeof body.customerEmail === "string" ? body.customerEmail : "";
  const customerPhone = typeof body.customerPhone === "string" ? body.customerPhone : "";
  const v = validateCustomerDetails({ customerName, customerEmail, customerPhone });
  if (!v.ok) {
    return NextResponse.json({ success: false, error: v.error }, { status: 400 });
  }

  const service = typeof body.service === "string" ? body.service : "";
  const bedrooms = typeof body.bedrooms === "number" ? body.bedrooms : Number(body.bedrooms);
  const bathrooms = typeof body.bathrooms === "number" ? body.bathrooms : Number(body.bathrooms);
  const extraRooms = typeof body.extraRooms === "number" ? body.extraRooms : Number(body.extraRooms);
  const extras = Array.isArray(body.extras) ? body.extras.filter((x): x is string => typeof x === "string") : [];
  const date = typeof body.date === "string" ? body.date : "";
  const time = typeof body.time === "string" ? body.time : "";
  const location = typeof body.location === "string" ? body.location : "";
  const locationSlug = typeof body.locationSlug === "string" ? body.locationSlug : "";
  const serviceAreaLocationId = typeof body.serviceAreaLocationId === "string" ? body.serviceAreaLocationId : "";
  const serviceAreaCityId = typeof body.serviceAreaCityId === "string" ? body.serviceAreaCityId : "";
  const serviceAreaName = typeof body.serviceAreaName === "string" ? body.serviceAreaName : "";
  const selectedFromBody =
    typeof body.selected_cleaner_id === "string" && body.selected_cleaner_id.trim()
      ? body.selected_cleaner_id.trim()
      : body.cleanerId == null
        ? null
        : typeof body.cleanerId === "string" && body.cleanerId.trim()
          ? body.cleanerId.trim()
          : null;

  if (!Number.isFinite(bedrooms) || !Number.isFinite(bathrooms) || !Number.isFinite(extraRooms)) {
    return NextResponse.json({ success: false, error: "Invalid room counts." }, { status: 400 });
  }

  const result = await insertBookingFromFlowIntake(admin, {
    service,
    bedrooms: Math.round(bedrooms),
    bathrooms: Math.round(bathrooms),
    extraRooms: Math.round(extraRooms),
    extras,
    date,
    time,
    location,
    locationSlug: locationSlug.trim() || null,
    serviceAreaLocationId: serviceAreaLocationId.trim() || null,
    serviceAreaCityId: serviceAreaCityId.trim() || null,
    serviceAreaName: serviceAreaName.trim() || null,
    selected_cleaner_id: selectedFromBody,
    customerName,
    customerEmail,
    customerPhone,
  });

  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true, bookingId: result.bookingId });
}
