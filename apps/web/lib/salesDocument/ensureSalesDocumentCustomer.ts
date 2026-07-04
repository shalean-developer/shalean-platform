import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { ensureCustomerAccount } from "@/lib/customer/ensureCustomerAccount";
import { logSystemEvent } from "@/lib/logging/systemLog";

export type EnsureSalesDocumentCustomerResult =
  | { ok: true; customerId: string; created: boolean }
  | { ok: false; error: string };

/**
 * Ensures the sales document contact exists as a customer account and links `customer_id`.
 */
export async function ensureSalesDocumentCustomer(
  admin: SupabaseClient,
  documentId: string,
): Promise<EnsureSalesDocumentCustomerResult> {
  const { data, error } = await admin
    .from("sales_documents")
    .select("id, customer_id, customer_name, customer_email, customer_phone")
    .eq("id", documentId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "document_not_found" };

  const row = data as {
    customer_id?: string | null;
    customer_name?: string;
    customer_email?: string;
    customer_phone?: string | null;
  };

  if (row.customer_id) {
    return { ok: true, customerId: String(row.customer_id), created: false };
  }

  const name = String(row.customer_name ?? "").trim();
  const email = String(row.customer_email ?? "").trim();
  const phone = String(row.customer_phone ?? "").trim();

  if (name.length < 2 || !email || phone.length < 5) {
    return { ok: false, error: "customer_contact_incomplete" };
  }

  const ensured = await ensureCustomerAccount(admin, {
    fullName: name,
    phone,
    email,
    source: "sales_document_quote",
  });

  if (!ensured.ok) return ensured;

  const { error: updErr } = await admin
    .from("sales_documents")
    .update({ customer_id: ensured.userId })
    .eq("id", documentId);

  if (updErr) return { ok: false, error: updErr.message };

  await admin
    .from("sales_documents")
    .update({ customer_id: ensured.userId })
    .eq("converted_from_id", documentId)
    .is("customer_id", null);

  await logSystemEvent({
    level: "info",
    source: "sales_document/customer",
    message: ensured.reused ? "sales_document.customer_linked" : "sales_document.customer_created",
    context: { documentId, customerId: ensured.userId, reused: ensured.reused },
  });

  return { ok: true, customerId: ensured.userId, created: !ensured.reused };
}
