import { NextResponse } from "next/server";
import { requireAdminFromRequest } from "@/lib/admin/requireAdmin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SERVICE_SLUGS = new Set([
  "regular-cleaning",
  "deep-cleaning",
  "moving-cleaning",
  "office-cleaning",
  "carpet-cleaning",
  "airbnb-cleaning",
]);

function normalizeServiceSlugs(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const slugs = [...new Set(value.filter((v): v is string => typeof v === "string").map((v) => v.trim()))];
  if (slugs.some((slug) => !SERVICE_SLUGS.has(slug))) return null;
  return slugs;
}

export async function GET(request: Request) {
  const auth = await requireAdminFromRequest(request);
  if (!auth.ok) return auth.response;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data, error } = await admin
    .from("pricing_extras")
    .select("id, slug, name, service_slugs, is_active, sort_order")
    .order("sort_order", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ extras: data ?? [] });
}

export async function PATCH(request: Request) {
  const auth = await requireAdminFromRequest(request);
  if (!auth.ok) return auth.response;

  let body: { id?: unknown; service_slugs?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  const serviceSlugs = normalizeServiceSlugs(body.service_slugs);
  if (!id) return NextResponse.json({ error: "id required." }, { status: 400 });
  if (!serviceSlugs) return NextResponse.json({ error: "service_slugs must contain valid booking service slugs." }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data: before } = await admin.from("pricing_extras").select("*").eq("id", id).maybeSingle();
  const { data, error } = await admin
    .from("pricing_extras")
    .update({ service_slugs: serviceSlugs, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, slug, name, service_slugs, is_active, sort_order")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { recordPricingCatalogAudit } = await import("@/lib/admin/recordPricingCatalogAudit");
  await recordPricingCatalogAudit(admin, {
    tableName: "pricing_extras",
    rowId: id,
    action: "update",
    beforeRow: (before as Record<string, unknown> | null) ?? null,
    afterRow: data as Record<string, unknown>,
    actorUserId: auth.user.id,
    actorEmail: auth.email,
  });

  return NextResponse.json({ ok: true, extra: data });
}
