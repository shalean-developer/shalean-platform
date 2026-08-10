import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { summarizeInventory, type InventoryItem } from "@/lib/admin/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function canManage(admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>, userId: string) {
  for (const permission of ["expense.manage", "booking.assign", "finance.full.view"]) {
    const { data } = await admin.rpc("admin_has_permission", { p_user_id: userId, p_permission: permission, p_branch_id: null, p_team_id: null });
    if (data === true) return true;
  }
  return false;
}

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  if (!(await canManage(admin, auth.userId))) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const [itemsResult, movementsResult, issuesResult] = await Promise.all([
    admin.from("inventory_items").select("*").order("name"),
    admin.from("inventory_movements").select("*, inventory_items(name,sku,unit)").order("created_at", { ascending: false }).limit(100),
    admin.from("inventory_equipment_issues").select("*, inventory_items(name,sku,unit)").eq("status", "issued").order("due_at", { ascending: true }).limit(100),
  ]);
  const error = itemsResult.error ?? movementsResult.error ?? issuesResult.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const items = (itemsResult.data ?? []) as InventoryItem[];
  return NextResponse.json({ items, movements: movementsResult.data ?? [], openIssues: issuesResult.data ?? [], summary: summarizeInventory(items) });
}

export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  if (!(await canManage(admin, auth.userId))) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  const sku = String(body.sku ?? "").trim().toUpperCase();
  const name = String(body.name ?? "").trim();
  const itemType = String(body.item_type ?? "");
  const unit = String(body.unit ?? "unit").trim();
  const reorderLevel = Number(body.reorder_level ?? 0);
  const unitCostCents = Number(body.unit_cost_cents ?? 0);
  if (!sku || !name || !unit || !["supply", "equipment"].includes(itemType) || reorderLevel < 0 || !Number.isInteger(unitCostCents) || unitCostCents < 0) {
    return NextResponse.json({ error: "Valid SKU, name, type, unit, reorder level and unit cost are required." }, { status: 400 });
  }
  const { data, error } = await admin.from("inventory_items").insert({ sku, name, item_type: itemType, unit, reorder_level: reorderLevel, unit_cost_cents: unitCostCents }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "23505" ? 409 : 500 });
  return NextResponse.json({ ok: true, id: data.id }, { status: 201 });
}

