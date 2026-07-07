import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { updateCleanerPayoutAmount } from "@/lib/payout/updatePayoutAmount";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Missing payout id." }, { status: 400 });

  let body: { total_amount_cents?: unknown; adjustment_note?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const totalAmountCents = Number(body.total_amount_cents);
  if (!Number.isFinite(totalAmountCents) || totalAmountCents < 0) {
    return NextResponse.json({ error: "total_amount_cents must be a non-negative number." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const result = await updateCleanerPayoutAmount(admin, {
    payoutId: id,
    totalAmountCents,
    adjustmentNote: typeof body.adjustment_note === "string" ? body.adjustment_note : null,
    adjustedBy: auth.userId,
  });

  if (!result.ok) {
    const status = result.error === "Payout not found." ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ ok: true });
}
