import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getMoneyActionProposalById } from "@/lib/payout/listMoneyActionProposals";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi(_request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Missing proposal id." }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const result = await getMoneyActionProposalById(admin, {
    proposalId: id,
    viewerUserId: auth.userId,
  });

  if (!result.ok) {
    const status = result.code === "proposal_not_found" ? 404 : 400;
    return NextResponse.json({ error: result.error, code: result.code }, { status });
  }

  return NextResponse.json({ item: result.item });
}
