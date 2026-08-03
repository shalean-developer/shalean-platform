import { NextResponse } from "next/server";
import { requireAdminPermissionFromRequest } from "@/lib/admin/requirePermission";
import { payCleanerPayoutWithPaystack } from "@/lib/payout/paystackPayout";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermissionFromRequest(request, "payout.release");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Missing payout id." }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const result = await payCleanerPayoutWithPaystack(admin, { payoutId: id, paidBy: auth.user.id });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
  }

  return NextResponse.json({
    ok: true,
    transferCode: result.transferCode,
    reference: result.reference,
    skippedExisting: result.skippedExisting === true,
  });
}
