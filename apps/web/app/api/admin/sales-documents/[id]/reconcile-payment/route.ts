import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { reconcileSalesDocumentPayment } from "@/lib/salesDocument/reconcileSalesDocumentPayment";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { reference?: unknown };
  const paystackReference = typeof body.reference === "string" ? body.reference.trim() : undefined;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const result = await reconcileSalesDocumentPayment(admin, {
    documentId: id,
    paystackReference,
  });
  if (!result.ok) {
    const status =
      result.error === "document_not_found"
        ? 404
        : result.error === "paystack_not_paid"
          ? 409
          : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({
    ok: true,
    already_paid: result.alreadyPaid,
    document_id: result.documentId,
    reference: result.reference,
  });
}
