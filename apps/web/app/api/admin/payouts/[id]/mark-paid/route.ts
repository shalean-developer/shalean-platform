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

  if (String(process.env.ALLOW_MANUAL_PAYOUT ?? "").trim().toLowerCase() !== "true") {
    return NextResponse.json({ error: "Manual mark-paid is disabled. Use Pay via Paystack, or set ALLOW_MANUAL_PAYOUT=true for emergencies." }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  const result = await markCleanerPayoutPaid(admin, id, { actorUserId: auth.user.id });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
