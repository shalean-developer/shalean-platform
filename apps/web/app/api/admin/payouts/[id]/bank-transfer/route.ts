import { NextResponse } from "next/server";
import { requireAdminPermissionFromRequest } from "@/lib/admin/requirePermission";
import { markCleanerPayoutPaid } from "@/lib/payout/markPayoutPaid";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermissionFromRequest(request, "payout.release");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Missing payout id." }, { status: 400 });

  const body = (await request.json().catch(() => ({}))) as {
    reference?: string;
    paid_at?: string | null;
  };
  const reference = String(body.reference ?? "").trim();
  if (reference.length < 3) {
    return NextResponse.json({ error: "Bank transfer reference is required." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const result = await markCleanerPayoutPaid(admin, id, {
    actorUserId: auth.user.id,
    paymentMethod: "bank_transfer",
    paymentReference: reference,
    paidAt: body.paid_at ?? null,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json({
    ok: true,
    payment_method: "bank_transfer",
    payment_reference: reference,
  });
}
