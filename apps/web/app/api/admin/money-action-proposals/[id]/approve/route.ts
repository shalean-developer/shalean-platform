import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { approveMoneyActionProposal } from "@/lib/payout/approveMoneyActionProposal";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Approve a money-action proposal.
 * Body must not contain financial mutation fields — only optional confirm flag.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Missing proposal id." }, { status: 400 });

  let body: Record<string, unknown> = {};
  try {
    const text = await request.text();
    if (text.trim()) body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const forbiddenKeys = [
    "payout_cents",
    "bonus_cents",
    "cleaner_id",
    "booking_id",
    "payout_id",
    "adjustment_note",
    "original_total_cents",
    "proposed_total_cents",
    "payload",
  ];
  const tampered = forbiddenKeys.filter((k) => k in body && body[k] !== undefined);
  if (tampered.length > 0) {
    return NextResponse.json(
      {
        error: "Approval request must not include financial mutation fields.",
        code: "approval_body_forbidden_fields",
        fields: tampered,
      },
      { status: 400 },
    );
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const result = await approveMoneyActionProposal(admin, {
    proposalId: id,
    actorUserId: auth.userId,
    actorEmail: auth.email,
  });

  if (!result.ok) {
    const status =
      result.code === "maker_checker_self_approve" ||
      result.code === "proposal_not_pending" ||
      result.code === "proposal_expired" ||
      result.code === "proposal_already_rejected" ||
      result.code === "proposal_failed" ||
      result.code === "proposal_already_approved"
        ? 409
        : result.code === "proposal_not_found"
          ? 404
          : result.code === "malformed_payload" ||
              result.code === "read_after_write_mismatch" ||
              result.code === "audit_persist_failed" ||
              result.code === "proposal_terminal_update_failed"
            ? 409
            : 400;
    return NextResponse.json({ error: result.error, code: result.code }, { status });
  }

  return NextResponse.json({
    ok: true,
    status: result.status,
    proposal_id: result.proposalId,
    applied: true,
    already_processed: result.alreadyProcessed === true,
    payoutId: result.payoutId,
    batchTotalCents: result.batchTotalCents,
    edit_mode: result.edit_mode,
  });
}
