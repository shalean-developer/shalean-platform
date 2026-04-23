import { NextResponse } from "next/server";
import { requireAdminFromRequest } from "@/lib/admin/requireAdmin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminFromRequest(request);
  if (!auth.ok) return auth.response;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data, error } = await admin
    .from("pricing_services")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) {
    if (error.message.includes("does not exist") || error.code === "42P01") {
      return NextResponse.json({ services: [], message: "Run migration 20260476_admin_pricing_tables.sql" });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ services: data ?? [] });
}

export async function PATCH(request: Request) {
  const auth = await requireAdminFromRequest(request);
  if (!auth.ok) return auth.response;

  let body: {
    id?: unknown;
    name?: unknown;
    base_price?: unknown;
    price_per_bedroom?: unknown;
    price_per_bathroom?: unknown;
    min_hours?: unknown;
    max_hours?: unknown;
    is_active?: unknown;
    sort_order?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) return NextResponse.json({ error: "id required." }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof body.name === "string") patch.name = body.name.trim().slice(0, 200);
  if (typeof body.base_price === "number" && Number.isFinite(body.base_price)) patch.base_price = Math.max(0, Math.round(body.base_price));
  if (typeof body.price_per_bedroom === "number" && Number.isFinite(body.price_per_bedroom)) {
    patch.price_per_bedroom = Math.max(0, Math.round(body.price_per_bedroom));
  }
  if (typeof body.price_per_bathroom === "number" && Number.isFinite(body.price_per_bathroom)) {
    patch.price_per_bathroom = Math.max(0, Math.round(body.price_per_bathroom));
  }
  if (typeof body.min_hours === "number" && Number.isFinite(body.min_hours)) patch.min_hours = Math.max(0.25, Math.min(24, body.min_hours));
  if (typeof body.max_hours === "number" && Number.isFinite(body.max_hours)) patch.max_hours = Math.max(0.25, Math.min(24, body.max_hours));
  if (typeof body.is_active === "boolean") patch.is_active = body.is_active;
  if (typeof body.sort_order === "number" && Number.isFinite(body.sort_order)) patch.sort_order = Math.round(body.sort_order);

  if (Object.keys(patch).length <= 1) {
    return NextResponse.json({ error: "No updatable fields." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { error } = await admin.from("pricing_services").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
