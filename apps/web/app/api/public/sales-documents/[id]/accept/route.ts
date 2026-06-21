import { NextResponse } from "next/server";

import { acceptSalesQuoteAndCreateInvoice } from "@/lib/salesDocument/acceptSalesQuote";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { token?: unknown };
  const token = String(body.token ?? "").trim();
  if (!token) return NextResponse.json({ error: "missing_token" }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Service unavailable." }, { status: 503 });

  const { data, error } = await admin
    .from("sales_documents")
    .select("id, document_type, status, public_token")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const row = data as { document_type: string; status: string; public_token: string };
  if (String(row.public_token) !== token) {
    return NextResponse.json({ error: "invalid_token" }, { status: 403 });
  }
  if (row.document_type !== "quote") {
    return NextResponse.json({ error: "not_a_quote" }, { status: 400 });
  }
  if (row.status === "void") {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }

  const result = await acceptSalesQuoteAndCreateInvoice(admin, id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    invoiceId: result.invoiceId,
    viewUrl: result.viewUrl,
    alreadyExisted: result.alreadyExisted,
    emailSent: result.emailSent,
  });
}
