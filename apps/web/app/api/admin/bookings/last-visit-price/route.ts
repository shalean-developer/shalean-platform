import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { bookingLocationVariantsForSavedAddress } from "@/lib/admin/buildBookingLocationFromSavedAddress";
import type { CustomerAddressRow } from "@/lib/dashboard/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isUuid(s: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(s);
}

/**
 * Admin: most recent visit price (ZAR) for same customer + location, or same customer + saved address
 * (matches new and legacy location strings).
 */
export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const userId = (searchParams.get("user_id") ?? "").trim();
  const location = typeof searchParams.get("location") === "string" ? searchParams.get("location")!.trim() : "";
  const addressId = (searchParams.get("address_id") ?? "").trim();

  if (!isUuid(userId)) {
    return NextResponse.json({ error: "user_id is required." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  let locations: string[] = [];
  if (isUuid(addressId)) {
    const { data: addr, error: addrErr } = await admin
      .from("customer_saved_addresses")
      .select("id, user_id, label, line1, suburb, city, postal_code, is_default, created_at, updated_at")
      .eq("id", addressId)
      .eq("user_id", userId)
      .maybeSingle();
    if (addrErr) {
      return NextResponse.json({ error: addrErr.message }, { status: 500 });
    }
    if (addr) {
      locations = bookingLocationVariantsForSavedAddress(addr as CustomerAddressRow);
    }
  }
  if (locations.length === 0 && location.length >= 3) {
    locations = [location];
  }
  if (locations.length === 0) {
    return NextResponse.json({ last_total_paid_zar: null });
  }

  const { data, error } = await admin
    .from("bookings")
    .select("total_paid_zar, created_at")
    .eq("user_id", userId)
    .in("location", locations)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const row = data as { total_paid_zar?: number | null } | null;
  const z = row?.total_paid_zar;
  const last_total_paid_zar = typeof z === "number" && Number.isFinite(z) && z > 0 ? z : null;

  return NextResponse.json({ last_total_paid_zar });
}
