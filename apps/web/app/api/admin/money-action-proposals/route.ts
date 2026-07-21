import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { listMoneyActionProposals } from "@/lib/payout/listMoneyActionProposals";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("page_size") ?? "25") || 25));
  const offset = (page - 1) * pageSize;

  const result = await listMoneyActionProposals(admin, {
    status: url.searchParams.get("status") ?? "pending",
    actionType: url.searchParams.get("action_type"),
    cleanerId: url.searchParams.get("cleaner_id"),
    proposedBy: url.searchParams.get("proposed_by"),
    bookingId: url.searchParams.get("booking_id"),
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
    limit: pageSize,
    offset,
    viewerUserId: auth.userId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    items: result.items,
    total: result.total,
    page,
    page_size: pageSize,
  });
}
