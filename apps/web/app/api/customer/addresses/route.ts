import { NextResponse } from "next/server";
import {
  CUSTOMER_ADDRESS_SELECT,
  clearOtherDefaultAddresses,
  parseCustomerAddressWriteBody,
} from "@/lib/customer/customerAddresses";
import { resolveBookingRouteBearerAuth } from "@/lib/supabase/bookingRouteBearerAuth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await resolveBookingRouteBearerAuth(request);
  if (auth.kind === "invalid_token") {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  if (auth.kind !== "authenticated") {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data, error } = await admin
    .from("customer_saved_addresses")
    .select(CUSTOMER_ADDRESS_SELECT)
    .eq("user_id", auth.userId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ addresses: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await resolveBookingRouteBearerAuth(request);
  if (auth.kind === "invalid_token") {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  if (auth.kind !== "authenticated") {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  delete body.user_id;
  delete body.userId;
  delete body.id;

  const parsed = parseCustomerAddressWriteBody(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  if (parsed.value.isDefault) {
    const cleared = await clearOtherDefaultAddresses(admin, auth.userId);
    if (!cleared.ok) return NextResponse.json({ error: cleared.error }, { status: 500 });
  }

  const now = new Date().toISOString();
  const insertRow: Record<string, unknown> = {
    user_id: auth.userId,
    label: parsed.value.label,
    line1: parsed.value.line1,
    suburb: parsed.value.suburb,
    city: parsed.value.city || "Cape Town",
    postal_code: parsed.value.postalCode,
    is_default: parsed.value.isDefault,
    updated_at: now,
  };
  if (parsed.value.notes) insertRow.notes = parsed.value.notes;

  const { data, error } = await admin
    .from("customer_saved_addresses")
    .insert(insertRow)
    .select(CUSTOMER_ADDRESS_SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ address: data });
}
