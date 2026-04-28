import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isUuid(s: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(s);
}

/** Admin: update a saved address (service role). */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await ctx.params;
  const addressId = (id ?? "").trim();
  if (!isUuid(addressId)) {
    return NextResponse.json({ error: "Invalid address id." }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  const str = (k: string, max: number) => {
    if (typeof body[k] !== "string") return;
    const v = (body[k] as string).trim();
    if (!v.length || v.length > max) return;
    patch[k] = v;
  };

  str("label", 120);
  str("line1", 240);
  str("suburb", 120);
  str("city", 120);
  str("postal_code", 32);
  if (typeof body.notes === "string") {
    patch.notes = body.notes.trim().slice(0, 2000) || null;
  }
  if (typeof body.is_default === "boolean") {
    patch.is_default = body.is_default;
  }

  if (Object.keys(patch).length <= 1) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  if (patch.is_default === true) {
    const { data: row, error: fetchErr } = await admin
      .from("customer_saved_addresses")
      .select("user_id")
      .eq("id", addressId)
      .maybeSingle();
    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }
    const uid = (row as { user_id?: string } | null)?.user_id;
    if (uid && typeof uid === "string") {
      await admin
        .from("customer_saved_addresses")
        .update({ is_default: false, updated_at: patch.updated_at as string })
        .eq("user_id", uid);
    }
  }

  const { data, error } = await admin
    .from("customer_saved_addresses")
    .update(patch)
    .eq("id", addressId)
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Address not found." }, { status: 404 });
  }

  return NextResponse.json({ address: data });
}

/** Admin: delete a saved address (service role). */
export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi(_request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await ctx.params;
  const addressId = (id ?? "").trim();
  if (!isUuid(addressId)) {
    return NextResponse.json({ error: "Invalid address id." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const { data: deleted, error } = await admin.from("customer_saved_addresses").delete().eq("id", addressId).select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!deleted?.length) {
    return NextResponse.json({ error: "Address not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
