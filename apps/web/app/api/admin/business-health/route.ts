import { NextResponse } from "next/server";
import {
  computeBusinessHealthScore,
  persistBusinessHealthScore,
} from "@/lib/admin/expenses/businessHealthScore";
import {
  requireAdminPermissionFromRequest,
  requireAnyAdminPermissionFromRequest,
} from "@/lib/admin/requirePermission";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAnyAdminPermissionFromRequest(request, [
    "finance.summary.view",
    "finance.full.view",
  ]);
  if (!auth.ok) return auth.response;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const url = new URL(request.url);
  const scoreDate = url.searchParams.get("date") ?? undefined;

  try {
    const payload = await computeBusinessHealthScore(admin, scoreDate);
    return NextResponse.json(payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to compute health score.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminPermissionFromRequest(request, "finance.full.view");
  if (!auth.ok) return auth.response;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  try {
    const payload = await persistBusinessHealthScore(admin);
    return NextResponse.json({ ok: true, ...payload });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to persist health score.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
