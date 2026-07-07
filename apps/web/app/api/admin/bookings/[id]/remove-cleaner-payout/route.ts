import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { removeCleanerFromVisitPayout } from "@/lib/payout/removeCleanerFromVisitPayout";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id: bookingId } = await ctx.params;
  if (!bookingId) return NextResponse.json({ error: "Missing booking id." }, { status: 400 });

  let body: { cleaner_id?: unknown; reason?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const cleanerId = typeof body.cleaner_id === "string" ? body.cleaner_id.trim() : "";
  if (!cleanerId) {
    return NextResponse.json({ error: "cleaner_id is required." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const result = await removeCleanerFromVisitPayout(admin, {
    bookingId,
    cleanerId,
    reason: typeof body.reason === "string" ? body.reason : null,
    adminUserId: auth.userId,
  });

  if (!result.ok) {
    const status =
      result.code === "booking_not_found"
        ? 404
        : result.code === "booking_payout_paid" ||
            result.code === "payout_batch_locked" ||
            result.code === "cleaner_not_on_visit"
          ? 409
          : 400;
    return NextResponse.json({ error: result.error, code: result.code }, { status });
  }

  return NextResponse.json({
    ok: true,
    mode: result.mode,
    payoutId: result.payoutId,
    batchTotalCents: result.batchTotalCents,
  });
}
