import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  createPromotion,
  listPromotions,
  syncPromotionStatuses,
} from "@/lib/promotions/server";
import type { CreatePromotionInput, PromotionStatus } from "@/lib/promotions/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  await syncPromotionStatuses(admin);
  const url = new URL(request.url);
  const status = url.searchParams.get("status") as PromotionStatus | null;
  const type = url.searchParams.get("type");
  const search = url.searchParams.get("search");

  try {
    const promotions = await listPromotions(admin, {
      status: status || undefined,
      type: type || undefined,
      search: search || undefined,
    });
    return NextResponse.json({ promotions });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to list promotions." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  let body: CreatePromotionInput;
  try {
    body = (await request.json()) as CreatePromotionInput;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!body.name?.trim() || !body.promotion_type) {
    return NextResponse.json({ error: "name and promotion_type are required." }, { status: 400 });
  }

  try {
    const promotion = await createPromotion(admin, body, auth.email);
    return NextResponse.json({ promotion }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to create promotion." },
      { status: 500 },
    );
  }
}
