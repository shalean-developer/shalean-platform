import { NextResponse } from "next/server";

import { salesDocumentPdfResponse } from "@/lib/salesDocument/salesDocumentPdfResponse";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const token = new URL(request.url).searchParams.get("token")?.trim() ?? "";
  if (!token) return NextResponse.json({ error: "Missing token." }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Service unavailable." }, { status: 503 });

  const { data, error } = await admin
    .from("sales_documents")
    .select("id, document_type, public_token, zoho_estimate_id, zoho_invoice_id, status")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const row = data as {
    public_token: string;
    document_type: string;
    status: string;
    zoho_estimate_id?: string | null;
    zoho_invoice_id?: string | null;
    id: string;
  };

  if (String(row.public_token) !== token) {
    return NextResponse.json({ error: "invalid_token" }, { status: 403 });
  }
  if (row.status === "void") {
    return NextResponse.json({ error: "unavailable" }, { status: 410 });
  }

  return salesDocumentPdfResponse(row, `shalean-${row.id.slice(0, 8)}`);
}
