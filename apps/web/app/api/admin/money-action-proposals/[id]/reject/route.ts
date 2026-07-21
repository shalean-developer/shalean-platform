import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { rejectMoneyActionProposal } from "@/lib/payout/rejectMoneyActionProposal";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Missing proposal id." }, { status: 400 });

  let body: { review_note?: unknown; rejection_reason?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const reviewNote =
    typeof body.review_note === "string"
      ? body.review_note
      : typeof body.rejection_reason === "string"
        ? body.rejection_reason
        : "";

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const result = await rejectMoneyActionProposal(admin, {
    proposalId: id,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    reviewNote,
  });

  if (!result.ok) {
    const status =
      result.code === "maker_checker_self_approve" ||
      result.code === "proposal_not_pending" ||
      result.code === "proposal_expired" ||
      result.code === "proposal_already_approved"
        ? 409
        : result.code === "proposal_not_found"
          ? 404
          : result.code === "review_note_required"
            ? 400
            : 400;
    return NextResponse.json({ error: result.error, code: result.code }, { status });
  }

  return NextResponse.json({
    ok: true,
    status: result.status,
    proposal_id: result.proposalId,
    applied: false,
    already_processed: result.alreadyProcessed === true,
  });
}
