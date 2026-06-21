import { NextResponse } from "next/server";
import { requireAdminFromRequest } from "@/lib/admin/requireAdmin";
import { loadAdminReviewsList } from "@/lib/admin/loadAdminReviewsList";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminFromRequest(request);
  if (!auth.ok) return auth.response;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const url = new URL(request.url);
  const limitRaw = Number.parseInt(url.searchParams.get("limit") ?? "200", 10);
  const limit = Number.isFinite(limitRaw) ? limitRaw : 200;

  const result = await loadAdminReviewsList(admin, limit);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ reviews: result.reviews });
}

export async function PATCH(request: Request) {
  const auth = await requireAdminFromRequest(request);
  if (!auth.ok) return auth.response;

  let body: { id?: string; is_hidden?: unknown };
  try {
    body = (await request.json()) as { id?: string; is_hidden?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) {
    return NextResponse.json({ error: "Missing id." }, { status: 400 });
  }
  if (typeof body.is_hidden !== "boolean") {
    return NextResponse.json({ error: "is_hidden boolean required." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { error } = await admin.from("reviews").update({ is_hidden: body.is_hidden }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const auth = await requireAdminFromRequest(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const id = url.searchParams.get("id")?.trim() ?? "";
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { error } = await admin.from("reviews").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
