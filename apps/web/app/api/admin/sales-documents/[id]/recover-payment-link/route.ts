import { NextResponse } from "next/server";

import { requireAnyAdminPermissionFromRequest } from "@/lib/admin/requirePermission";
import { recoverSalesDocumentPaymentLink } from "@/lib/salesDocument/recoverSalesDocumentPaymentLink";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAnyAdminPermissionFromRequest(request, ["invoice.manage"]);
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { confirm?: string };
  if (body.confirm !== "RECOVER_PAYMENT_LINK") {
    return NextResponse.json(
      { error: "Confirmation RECOVER_PAYMENT_LINK is required." },
      { status: 400 },
    );
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const result = await recoverSalesDocumentPaymentLink(admin, id);
  if (!result.ok) {
    const status =
      result.error === "document_not_found"
        ? 404
        : result.error === "nothing_due" || result.error === "invoice_not_open_for_payment"
          ? 409
          : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json(result);
}
