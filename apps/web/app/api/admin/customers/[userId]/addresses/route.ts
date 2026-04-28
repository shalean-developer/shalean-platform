import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isUuid(s: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(s);
}

/** Admin: create a saved address for a customer (service role). */
export async function POST(request: Request, ctx: { params: Promise<{ userId: string }> }) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { userId } = await ctx.params;
  const uid = (userId ?? "").trim();
  if (!isUuid(uid)) {
    return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const label = typeof body.label === "string" ? body.label.trim() : "";
  const line1 = typeof body.line1 === "string" ? body.line1.trim() : "";
  const suburb = typeof body.suburb === "string" ? body.suburb.trim() : "";
  const postal_code =
    typeof body.postal_code === "string" && body.postal_code.trim().length > 0 ? body.postal_code.trim() : "";
  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) : null;

  if (label.length < 1 || label.length > 120) {
    return NextResponse.json({ error: "label (property name) is required (1–120 chars)." }, { status: 400 });
  }
  if (line1.length < 1 || line1.length > 240) {
    return NextResponse.json({ error: "line1 is required (1–240 chars)." }, { status: 400 });
  }
  if (suburb.length < 1 || suburb.length > 120) {
    return NextResponse.json({ error: "suburb is required (1–120 chars)." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const now = new Date().toISOString();
  const insertRow: Record<string, unknown> = {
    user_id: uid,
    label,
    line1,
    suburb,
    city: "Cape Town",
    postal_code,
    is_default: false,
    updated_at: now,
  };
  if (notes && notes.length > 0) {
    insertRow.notes = notes;
  }

  const { data, error } = await admin
    .from("customer_saved_addresses")
    .insert(insertRow)
    .select("id, user_id, label, line1, suburb, city, postal_code, notes, is_default, created_at, updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ address: data });
}
