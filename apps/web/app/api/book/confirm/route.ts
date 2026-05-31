import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { validateCustomerDetails } from "@/lib/booking/customerDetailsValidation";
import { insertAuthenticatedBookFlowIntake } from "@/lib/booking/insertAuthenticatedBookFlowIntake";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
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
  serviceAreaLocationId?: unknown;
  serviceAreaCityId?: unknown;
  serviceAreaName?: unknown;
  selected_cleaner_id?: unknown;
  cleanerId?: unknown;
};

async function resolveAuthenticatedCustomer(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  userId: string,
  authEmail: string,
): Promise<
  | { ok: true; name: string; email: string; phone: string }
  | { ok: false; error: string; status: number }
> {
  const email = normalizeEmail(authEmail);
  if (!email) {
    return { ok: false, error: "Account email is required.", status: 400 };
  }

  const { data: authData, error: authErr } = await admin.auth.admin.getUserById(userId);
  if (authErr || !authData.user) {
    return { ok: false, error: "Could not load account.", status: 401 };
  }

  const meta = authData.user.user_metadata as { full_name?: string; phone?: string } | undefined;
  let name = meta?.full_name?.trim() ?? "";
  let phone = meta?.phone?.trim() ?? "";

  const { data: profile } = await admin
    .from("user_profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle();
  const profileName =
    profile && typeof profile === "object" && "full_name" in profile
      ? String((profile as { full_name?: string | null }).full_name ?? "").trim()
      : "";
  if (profileName) name = profileName;

  if (!phone) {
    const { data: lastBooking } = await admin
      .from("bookings")
      .select("customer_phone")
      .eq("user_id", userId)
      .not("customer_phone", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    phone =
      lastBooking && typeof lastBooking === "object" && "customer_phone" in lastBooking
        ? String((lastBooking as { customer_phone?: string | null }).customer_phone ?? "").trim()
        : "";
  }

  const v = validateCustomerDetails({ customerName: name, customerEmail: email, customerPhone: phone });
  if (!v.ok) {
    return {
      ok: false,
      error: "Complete your profile (full name and cell number) before confirming a booking.",
      status: 400,
    };
  }

  return { ok: true, name, email, phone };
}

/** Authenticated booking confirmation for `/book` — guest bookings are rejected. */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) {
    return NextResponse.json({ success: false, error: "Sign in to confirm your booking." }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json({ success: false, error: "Server unavailable." }, { status: 503 });
  }

  const pub = createClient(url, anon);
  const { data: userData, error: userErr } = await pub.auth.getUser(token);
  if (userErr || !userData.user?.id) {
    return NextResponse.json({ success: false, error: "Invalid or expired session." }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ success: false, error: "Server unavailable." }, { status: 503 });
  }

  const userId = userData.user.id;
  const customer = await resolveAuthenticatedCustomer(admin, userId, userData.user.email ?? "");
  if (!customer.ok) {
    return NextResponse.json({ success: false, error: customer.error }, { status: customer.status });
  }

  let body: JsonBody;
  try {
    body = (await request.json()) as JsonBody;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON." }, { status: 400 });
  }

  const service = typeof body.service === "string" ? body.service : "";
  const bedrooms = typeof body.bedrooms === "number" ? body.bedrooms : Number(body.bedrooms);
  const bathrooms = typeof body.bathrooms === "number" ? body.bathrooms : Number(body.bathrooms);
  const extraRooms = typeof body.extraRooms === "number" ? body.extraRooms : Number(body.extraRooms);
  const extras = Array.isArray(body.extras) ? body.extras.filter((x): x is string => typeof x === "string") : [];
  const date = typeof body.date === "string" ? body.date : "";
  const time = typeof body.time === "string" ? body.time : "";
  const location = typeof body.location === "string" ? body.location : "";
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

  if (!selectedFromBody) {
    return NextResponse.json({ success: false, error: "Select a cleaner before confirming." }, { status: 400 });
  }

  const meta = userData.user.user_metadata as { book_auth_type?: string } | undefined;
  const authType = meta?.book_auth_type === "register" ? "register" : "login";

  const result = await insertAuthenticatedBookFlowIntake(admin, {
    service,
    bedrooms: Math.round(bedrooms),
    bathrooms: Math.round(bathrooms),
    extraRooms: Math.round(extraRooms),
    extras,
    date,
    time,
    location,
    serviceAreaLocationId: serviceAreaLocationId.trim() || null,
    serviceAreaCityId: serviceAreaCityId.trim() || null,
    serviceAreaName: serviceAreaName.trim() || null,
    selected_cleaner_id: selectedFromBody,
    customerName: customer.name,
    customerEmail: customer.email,
    customerPhone: customer.phone,
    userId,
    authType,
  });

  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true, bookingId: result.bookingId });
}
