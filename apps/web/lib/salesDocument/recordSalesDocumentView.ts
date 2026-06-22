import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

/** Increment view stats when a customer opens the public document page. */
export async function recordSalesDocumentView(documentId: string): Promise<void> {
  const id = documentId.trim();
  if (!id) return;

  const admin = getSupabaseAdmin();
  if (!admin) return;

  const { error } = await admin.rpc("record_sales_document_view", { doc_id: id });
  if (error) {
    console.error("[recordSalesDocumentView]", error.message);
  }
}
