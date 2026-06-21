import { NextResponse } from "next/server";
import type { CleanerPricingTier, TeamPricingConfig } from "@/lib/admin/officePricingTypes";
import { parseEquipmentPricingConfig } from "@/lib/booking-v2/equipmentPricing";
import { requireAdminFromRequest } from "@/lib/admin/requireAdmin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONFIG_ID = "default";

function isDiscountRule(raw: unknown): raw is { type: string; value: number } {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  const type = o.type;
  const value = Number(o.value);
  return (type === "percent" || type === "fixed") && Number.isFinite(value) && value >= 0;
}

function mergeRecurringDiscounts(
  existing: unknown,
  patch: unknown,
): Record<string, { type: "percent" | "fixed"; value: number }> {
  const base =
    existing && typeof existing === "object"
      ? { ...(existing as Record<string, { type: "percent" | "fixed"; value: number }>) }
      : {};

  if (!patch || typeof patch !== "object") return base;

  for (const [freq, rule] of Object.entries(patch as Record<string, unknown>)) {
    const key = freq.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_").slice(0, 40);
    if (!key) continue;
    if (!isDiscountRule(rule)) continue;
    base[key] = {
      type: rule.type === "fixed" ? "fixed" : "percent",
      value: Math.round(rule.value),
    };
  }

  return base;
}

function parseCleanerTiers(raw: unknown): CleanerPricingTier[] | null {
  if (!Array.isArray(raw)) return null;
  const tiers: CleanerPricingTier[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id.trim() : "";
    const label = typeof o.label === "string" ? o.label.trim().slice(0, 120) : "";
    const cleanerCount = Number(o.cleaner_count);
    const surcharge = Number(o.surcharge_zar);
    if (!id || !label || !Number.isFinite(cleanerCount) || cleanerCount < 1 || cleanerCount > 10) continue;
    if (!Number.isFinite(surcharge) || surcharge < 0) continue;
    tiers.push({
      id,
      label,
      cleaner_count: Math.round(cleanerCount),
      surcharge_zar: Math.round(surcharge),
    });
  }
  return tiers;
}

function parseTeamPricing(raw: unknown): TeamPricingConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const count = Number(o.team_member_count);
  const label = typeof o.label === "string" ? o.label.trim().slice(0, 120) : "";
  const notes = typeof o.notes === "string" ? o.notes.trim().slice(0, 500) : "";
  if (!Number.isFinite(count) || count < 1 || count > 15 || !label) return null;
  return {
    team_member_count: Math.round(count),
    label,
    notes,
  };
}

export async function GET(request: Request) {
  const auth = await requireAdminFromRequest(request);
  if (!auth.ok) return auth.response;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data, error } = await admin
    .from("pricing_booking_config")
    .select("config, updated_at")
    .eq("id", CONFIG_ID)
    .maybeSingle();

  if (error) {
    if (error.message.includes("does not exist") || error.code === "42P01") {
      return NextResponse.json({ config: {}, message: "Run migration 20260951_pricing_booking_config.sql" });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    config: (data as { config?: unknown } | null)?.config ?? {},
    updated_at: (data as { updated_at?: string } | null)?.updated_at ?? null,
  });
}

export async function PATCH(request: Request) {
  const auth = await requireAdminFromRequest(request);
  if (!auth.ok) return auth.response;

  let body: {
    recurring_discounts?: unknown;
    remove_recurring_discounts?: unknown;
    extra_cleaner_fee_zar?: unknown;
    cleaner_pricing_tiers?: unknown;
    team_pricing?: unknown;
    equipment_pricing?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data: existing, error: readErr } = await admin
    .from("pricing_booking_config")
    .select("config")
    .eq("id", CONFIG_ID)
    .maybeSingle();

  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });

  const current =
    existing && typeof (existing as { config?: unknown }).config === "object"
      ? ({ ...((existing as { config: Record<string, unknown> }).config) } as Record<string, unknown>)
      : {};

  let changed = false;

  if (body.recurring_discounts != null) {
    current.recurring_discounts = mergeRecurringDiscounts(current.recurring_discounts, body.recurring_discounts);
    changed = true;
  }

  if (Array.isArray(body.remove_recurring_discounts)) {
    const discounts =
      current.recurring_discounts && typeof current.recurring_discounts === "object"
        ? { ...(current.recurring_discounts as Record<string, unknown>) }
        : {};
    for (const key of body.remove_recurring_discounts) {
      if (typeof key !== "string") continue;
      delete discounts[key.trim().toLowerCase()];
    }
    current.recurring_discounts = discounts;
    changed = true;
  }

  if (typeof body.extra_cleaner_fee_zar === "number" && Number.isFinite(body.extra_cleaner_fee_zar)) {
    current.extra_cleaner_fee_zar = Math.max(0, Math.round(body.extra_cleaner_fee_zar));
    changed = true;
  }

  if (body.cleaner_pricing_tiers != null) {
    const tiers = parseCleanerTiers(body.cleaner_pricing_tiers);
    if (!tiers) return NextResponse.json({ error: "Invalid cleaner_pricing_tiers." }, { status: 400 });
    current.cleaner_pricing_tiers = tiers;
    changed = true;
  }

  if (body.team_pricing != null) {
    const team = parseTeamPricing(body.team_pricing);
    if (!team) return NextResponse.json({ error: "Invalid team_pricing." }, { status: 400 });
    current.team_pricing = team;
    changed = true;
  }

  if (body.equipment_pricing != null) {
    current.equipment_pricing = parseEquipmentPricingConfig(body.equipment_pricing);
    changed = true;
  }

  if (!changed) {
    return NextResponse.json({ error: "No updatable fields." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { error: writeErr } = await admin.from("pricing_booking_config").upsert(
    {
      id: CONFIG_ID,
      config: current,
      updated_at: now,
    },
    { onConflict: "id" },
  );

  if (writeErr) return NextResponse.json({ error: writeErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, config: current, updated_at: now });
}
