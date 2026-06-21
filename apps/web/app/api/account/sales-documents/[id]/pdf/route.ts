import { NextResponse } from "next/server";

import { getCookieUser } from "@/lib/auth/getCookieUser";
import { salesDocumentPdfResponse } from "@/lib/salesDocument/salesDocumentPdfResponse";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const documentId = id?.trim();
  if (!documentId) return NextResponse.json({ error: "Missing document id." }, { status: 400 });

  const user = await getCookieUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const email = String(user.email ?? "").trim().toLowerCase();

  const { data, error } = await admin
    .from("sales_documents")
    .select("id, customer_id, customer_email, document_type, zoho_estimate_id, zoho_invoice_id")
    .eq("id", documentId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: "Lookup failed." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const row = data as {
    customer_id: string | null;
    customer_email: string;
    document_type: string;
    zoho_estimate_id?: string | null;
    zoho_invoice_id?: string | null;
    id: string;
  };

  const owns =
    row.customer_id === user.id ||
    (email && row.customer_email.trim().toLowerCase() === email);
  if (!owns) return NextResponse.json({ error: "Not found." }, { status: 404 });

  return salesDocumentPdfResponse(row, `shalean-${documentId.slice(0, 8)}`);
}
