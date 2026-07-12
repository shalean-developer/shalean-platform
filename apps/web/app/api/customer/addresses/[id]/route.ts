import { NextResponse } from "next/server";
import {
  CUSTOMER_ADDRESS_SELECT,
  clearOtherDefaultAddresses,
  customerOwnsAddressRow,
} from "@/lib/customer/customerAddresses";
import { resolveBookingRouteBearerAuth } from "@/lib/supabase/bookingRouteBearerAuth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await resolveBookingRouteBearerAuth(request);
  if (auth.kind === "invalid_token") {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  if (auth.kind !== "authenticated") {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { id } = await ctx.params;
  const addressId = (id ?? "").trim();
  if (!UUID_RE.test(addressId)) {
    return NextResponse.json({ error: "Invalid address id." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data, error } = await admin
    .from("customer_saved_addresses")
    .select(CUSTOMER_ADDRESS_SELECT)
    .eq("id", addressId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || !customerOwnsAddressRow(data, auth.userId)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json({ address: data });
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await resolveBookingRouteBearerAuth(request);
  if (auth.kind === "invalid_token") {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  if (auth.kind !== "authenticated") {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { id } = await ctx.params;
  const addressId = (id ?? "").trim();
  if (!UUID_RE.test(addressId)) {
    return NextResponse.json({ error: "Invalid address id." }, { status: 400 });
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

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data: existing, error: loadErr } = await admin
    .from("customer_saved_addresses")
    .select("id, user_id")
    .eq("id", addressId)
    .maybeSingle();
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!existing || !customerOwnsAddressRow(existing, auth.userId)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.label === "string") {
    const label = body.label.trim();
    if (label.length < 1 || label.length > 120) {
      return NextResponse.json({ error: "label (property name) is required (1–120 chars)." }, { status: 400 });
    }
    patch.label = label;
  }
  if (typeof body.line1 === "string") {
    const line1 = body.line1.trim();
    if (line1.length < 1 || line1.length > 240) {
      return NextResponse.json({ error: "line1 is required (1–240 chars)." }, { status: 400 });
    }
    patch.line1 = line1;
  }
  if (typeof body.suburb === "string") {
    const suburb = body.suburb.trim();
    if (suburb.length < 1 || suburb.length > 120) {
      return NextResponse.json({ error: "suburb is required (1–120 chars)." }, { status: 400 });
    }
    patch.suburb = suburb;
  }
  if (typeof body.city === "string" && body.city.trim()) patch.city = body.city.trim();
  if (typeof body.postalCode === "string" || typeof body.postal_code === "string") {
    patch.postal_code = String(body.postalCode ?? body.postal_code).trim();
  }
  if (typeof body.notes === "string") {
    patch.notes = body.notes.trim().slice(0, 2000) || null;
  }
  const isDefault = body.isDefault ?? body.is_default;
  if (typeof isDefault === "boolean") {
    patch.is_default = isDefault;
    if (isDefault) {
      const cleared = await clearOtherDefaultAddresses(admin, auth.userId, addressId);
      if (!cleared.ok) return NextResponse.json({ error: cleared.error }, { status: 500 });
    }
  }

  if (Object.keys(patch).length <= 1) {
    return NextResponse.json({ error: "No address fields to update." }, { status: 400 });
  }

  const { data, error } = await admin
    .from("customer_saved_addresses")
    .update(patch)
    .eq("id", addressId)
    .eq("user_id", auth.userId)
    .select(CUSTOMER_ADDRESS_SELECT)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ address: data });
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await resolveBookingRouteBearerAuth(request);
  if (auth.kind === "invalid_token") {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  if (auth.kind !== "authenticated") {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { id } = await ctx.params;
  const addressId = (id ?? "").trim();
  if (!UUID_RE.test(addressId)) {
    return NextResponse.json({ error: "Invalid address id." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data: deleted, error } = await admin
    .from("customer_saved_addresses")
    .delete()
    .eq("id", addressId)
    .eq("user_id", auth.userId)
    .select("id");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!deleted?.length) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
