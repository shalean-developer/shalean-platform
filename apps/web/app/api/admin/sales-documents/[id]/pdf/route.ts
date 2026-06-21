import { NextResponse } from "next/server";

import { isAdmin } from "@/lib/auth/admin";
import { getCookieUser } from "@/lib/auth/getCookieUser";
import { salesDocumentPdfResponse } from "@/lib/salesDocument/salesDocumentPdfResponse";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin: streams quote/invoice PDF for a sales document.
 * Cookie auth so plain `<a href>` from /office works (same as monthly invoice PDF).
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCookieUser();
  if (!user || !isAdmin(user.email)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { id } = await ctx.params;
  const documentId = id?.trim();
  if (!documentId) return NextResponse.json({ error: "Missing document id." }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data, error } = await admin
    .from("sales_documents")
    .select("id, document_type, zoho_estimate_id, zoho_invoice_id")
    .eq("id", documentId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: "Lookup failed." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found." }, { status: 404 });

  return salesDocumentPdfResponse(
    data as { document_type: string; zoho_estimate_id?: string | null; zoho_invoice_id?: string | null },
    `shalean-${documentId.slice(0, 8)}`,
  );
}
