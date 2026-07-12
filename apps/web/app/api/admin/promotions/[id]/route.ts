import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  deletePromotion,
  duplicatePromotion,
  getPromotionById,
  resumePromotion,
  setPromotionStatus,
  updatePromotion,
} from "@/lib/promotions/server";
import type { CreatePromotionInput, PromotionStatus } from "@/lib/promotions/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { id } = await ctx.params;
  try {
    const promotion = await getPromotionById(admin, id);
    if (!promotion) return NextResponse.json({ error: "Not found." }, { status: 404 });

    const [{ data: bundles }, { data: redemptions }, { data: audit }] = await Promise.all([
      admin.from("promotion_bundles").select("*").eq("promotion_id", id).order("sort_order"),
      admin
        .from("promotion_redemptions")
        .select("*")
        .eq("promotion_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
      admin
        .from("promotion_audit_log")
        .select("*")
        .eq("promotion_id", id)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

    return NextResponse.json({ promotion, bundles: bundles ?? [], redemptions: redemptions ?? [], audit: audit ?? [] });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load promotion." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { id } = await ctx.params;
  let body: Partial<CreatePromotionInput> & { status?: PromotionStatus };
  try {
    body = (await request.json()) as Partial<CreatePromotionInput> & { status?: PromotionStatus };
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  try {
    const promotion = await updatePromotion(admin, id, body, auth.email);
    return NextResponse.json({ promotion });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to update promotion." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { id } = await ctx.params;
  try {
    await deletePromotion(admin, id, auth.email);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to delete promotion.";
    const status = message === "Promotion not found." ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { id } = await ctx.params;
  let body: { action?: string; status?: PromotionStatus };
  try {
    body = (await request.json()) as { action?: string; status?: PromotionStatus };
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  try {
    if (body.action === "duplicate") {
      const promotion = await duplicatePromotion(admin, id, auth.email);
      return NextResponse.json({ promotion }, { status: 201 });
    }
    if (body.action === "delete") {
      await deletePromotion(admin, id, auth.email);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "pause") {
      return NextResponse.json({ promotion: await setPromotionStatus(admin, id, "paused", auth.email) });
    }
    if (body.action === "resume") {
      return NextResponse.json({ promotion: await resumePromotion(admin, id, auth.email) });
    }
    if (body.action === "end") {
      return NextResponse.json({ promotion: await setPromotionStatus(admin, id, "ended", auth.email) });
    }
    if (body.action === "schedule" || body.action === "activate") {
      const status = body.status ?? (body.action === "schedule" ? "scheduled" : "active");
      return NextResponse.json({ promotion: await setPromotionStatus(admin, id, status, auth.email) });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Action failed." },
      { status: 500 },
    );
  }
}
