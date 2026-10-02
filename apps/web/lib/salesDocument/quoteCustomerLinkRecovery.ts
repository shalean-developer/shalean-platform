import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureSalesDocumentCustomer } from "@/lib/salesDocument/ensureSalesDocumentCustomer";

export type QuoteCustomerLinkRecoveryRow = {
  document_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  status: string;
  source: string | null;
  created_at: string;
  classification: "exact_existing_email" | "recoverable_by_email" | "blocked";
  existing_customer_id: string | null;
  reason: string;
};

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim().toLowerCase());
}

export async function auditQuoteCustomerLinkRecovery(
  admin: SupabaseClient,
): Promise<QuoteCustomerLinkRecoveryRow[]> {
  const { data: docs, error } = await admin
    .from("sales_documents")
    .select("id, customer_name, customer_email, customer_phone, status, source, created_at")
    .eq("document_type", "quote")
    .is("customer_id", null)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const rows: QuoteCustomerLinkRecoveryRow[] = [];
  for (const doc of docs ?? []) {
    const email = String(doc.customer_email ?? "").trim().toLowerCase();
    let existingCustomerId: string | null = null;

    if (email) {
      const { data: profiles, error: profileErr } = await admin
        .from("user_profiles")
        .select("id")
        .eq("billing_email", email)
        .limit(2);
      if (profileErr) throw new Error(profileErr.message);
      if ((profiles ?? []).length === 1) {
        existingCustomerId = String(profiles![0]!.id);
      }
    }

    const classification: QuoteCustomerLinkRecoveryRow["classification"] =
      existingCustomerId
        ? "exact_existing_email"
        : validEmail(email)
          ? "recoverable_by_email"
          : "blocked";

    rows.push({
      document_id: String(doc.id),
      customer_name: String(doc.customer_name ?? ""),
      customer_email: email,
      customer_phone: doc.customer_phone ? String(doc.customer_phone) : null,
      status: String(doc.status ?? ""),
      source: doc.source ? String(doc.source) : null,
      created_at: String(doc.created_at),
      classification,
      existing_customer_id: existingCustomerId,
      reason:
        classification === "exact_existing_email"
          ? "Exact existing customer profile match by billing email."
          : classification === "recoverable_by_email"
            ? "Valid customer email; canonical account recovery can reuse or create the customer."
            : "Customer identity is incomplete or invalid for safe recovery.",
    });
  }

  return rows;
}

export async function repairQuoteCustomerLinks(
  admin: SupabaseClient,
): Promise<{
  ok: true;
  attempted: number;
  linked: number;
  failed: number;
  results: Array<{ document_id: string; ok: boolean; customer_id?: string; error?: string }>;
}> {
  const rows = await auditQuoteCustomerLinkRecovery(admin);
  const eligible = rows.filter((row) => row.classification !== "blocked");

  let linked = 0;
  let failed = 0;
  const results: Array<{ document_id: string; ok: boolean; customer_id?: string; error?: string }> = [];

  for (const row of eligible) {
    const result = await ensureSalesDocumentCustomer(admin, row.document_id);
    if (result.ok) {
      linked += 1;
      results.push({
        document_id: row.document_id,
        ok: true,
        customer_id: result.customerId,
      });
    } else {
      failed += 1;
      results.push({
        document_id: row.document_id,
        ok: false,
        error: result.error,
      });
    }
  }

  return {
    ok: true,
    attempted: eligible.length,
    linked,
    failed,
    results,
  };
}
