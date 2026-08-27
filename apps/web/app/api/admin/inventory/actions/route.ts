import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { inventoryMovementNeedsBooking } from "@/lib/admin/inventory";

export const runtime = "nodejs";

const textOrNull = (value: unknown) => String(value ?? "").trim() || null;

export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  const action = String(body.action ?? "movement");
  let result: { data: unknown; error: { message: string } | null };

  if (action === "close_issue") {
    const issueId = textOrNull(body.issue_id);
    const outcome = String(body.outcome ?? "returned");
    if (!issueId || !["returned", "lost"].includes(outcome)) return NextResponse.json({ error: "Valid issue and outcome are required." }, { status: 400 });
    result = await admin.rpc("close_inventory_equipment_issue", { p_issue_id: issueId, p_outcome: outcome, p_condition_in: textOrNull(body.condition_in), p_notes: textOrNull(body.notes), p_actor: auth.userId });
  } else if (action === "issue") {
    const itemId = textOrNull(body.item_id);
    const quantity = Number(body.quantity);
    if (!itemId || !Number.isFinite(quantity) || quantity <= 0) return NextResponse.json({ error: "Item and positive quantity are required." }, { status: 400 });
    result = await admin.rpc("issue_inventory_equipment", { p_item_id: itemId, p_quantity: quantity, p_booking_id: textOrNull(body.booking_id), p_cleaner_id: textOrNull(body.cleaner_id), p_team_id: textOrNull(body.team_id), p_due_at: textOrNull(body.due_at), p_condition_out: textOrNull(body.condition_out), p_notes: textOrNull(body.notes), p_actor: auth.userId });
  } else {
    const itemId = textOrNull(body.item_id);
    const type = String(body.movement_type ?? "");
    const quantity = Number(body.quantity);
    const bookingId = textOrNull(body.booking_id);
    if (!itemId || !["purchase", "consume", "loss", "adjustment_in", "adjustment_out"].includes(type) || !Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json({ error: "Item, movement type and positive quantity are required." }, { status: 400 });
    }
    if (inventoryMovementNeedsBooking(type) && !bookingId) return NextResponse.json({ error: "Booking is required for supply consumption." }, { status: 400 });
    result = await admin.rpc("record_inventory_movement", { p_item_id: itemId, p_movement_type: type, p_quantity: quantity, p_booking_id: bookingId, p_cleaner_id: textOrNull(body.cleaner_id), p_team_id: textOrNull(body.team_id), p_notes: textOrNull(body.notes), p_actor: auth.userId });
  }
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
  return NextResponse.json({ ok: true, id: result.data });
}
