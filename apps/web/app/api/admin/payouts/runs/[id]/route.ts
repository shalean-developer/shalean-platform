import { NextResponse } from "next/server";
import { getPayoutDisbursementRunDetail } from "@/lib/admin/payoutDisbursementRuns";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Missing run id." }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  try {
    const detail = await getPayoutDisbursementRunDetail(admin, id);
    return NextResponse.json(detail);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg === "Run not found." ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
