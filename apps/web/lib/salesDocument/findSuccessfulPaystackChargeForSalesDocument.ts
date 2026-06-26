import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchPaystackTransactionVerify } from "@/lib/payments/verifyPaystackTransaction";
import { canonicalSalesDocumentPaystackReference } from "@/lib/salesDocument/resolveSalesDocumentForPaystackCharge";
import {
  parseSalesDocumentIdFromPaystackReference,
  salesDocumentPaystackReference,
} from "@/lib/salesDocument/salesDocumentPaystackReference";

export type FoundSalesDocumentPaystackCharge = {
  reference: string;
  amountCents: number;
};

type PaystackListTx = {
  reference?: string;
  status?: string;
  amount?: number;
  metadata?: Record<string, unknown> | null;
};

function metadataDocumentId(meta: unknown): string | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const raw = (meta as Record<string, unknown>).shalean_sales_document_id;
  if (typeof raw !== "string") return null;
  const id = raw.trim();
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

function isSuccessfulVerify(
  verify: Awaited<ReturnType<typeof fetchPaystackTransactionVerify>>,
): FoundSalesDocumentPaystackCharge | null {
  const tx = verify.data;
  if (verify.status !== true || !tx) return null;
  if (String(tx.status ?? "").toLowerCase() !== "success") return null;
  if (typeof tx.amount !== "number" || !Number.isFinite(tx.amount)) return null;
  const reference = String(tx.reference ?? "").trim();
  if (!reference) return null;
  return { reference, amountCents: Math.round(tx.amount) };
}

async function verifyReference(
  secret: string,
  reference: string,
): Promise<FoundSalesDocumentPaystackCharge | null> {
  const ref = reference.trim();
  if (!ref) return null;
  const verify = await fetchPaystackTransactionVerify(ref, secret);
  return isSuccessfulVerify(verify);
}

async function listRecentSuccessfulPaystackTransactions(
  secret: string,
  opts: { fromIso: string; maxPages: number },
): Promise<PaystackListTx[]> {
  const out: PaystackListTx[] = [];
  for (let page = 1; page <= opts.maxPages; page++) {
    const url = new URL("https://api.paystack.co/transaction");
    url.searchParams.set("status", "success");
    url.searchParams.set("perPage", "50");
    url.searchParams.set("page", String(page));
    url.searchParams.set("from", opts.fromIso.slice(0, 10));

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${secret}` },
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as {
      status?: boolean;
      data?: PaystackListTx[];
    };
    if (!json.status || !Array.isArray(json.data) || json.data.length === 0) break;
    out.push(...json.data);
    if (json.data.length < 50) break;
  }
  return out;
}

/**
 * Locate a successful Paystack charge for a sales invoice when the stored reference
 * does not verify (reference drift, duplicate-init edge cases, test/live mismatch recovery).
 */
export async function findSuccessfulPaystackChargeForSalesDocument(
  admin: SupabaseClient,
  params: {
    documentId: string;
    customerEmail?: string | null;
    overrideReference?: string | null;
  },
): Promise<FoundSalesDocumentPaystackCharge | { ok: false; error: string }> {
  const documentId = params.documentId.trim();
  if (!/^[0-9a-f-]{36}$/i.test(documentId)) {
    return { ok: false, error: "invalid_document_id" };
  }

  const secret = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (!secret) return { ok: false, error: "paystack_not_configured" };

  const { data: doc, error: docErr } = await admin
    .from("sales_documents")
    .select("id, paystack_reference, customer_email, created_at")
    .eq("id", documentId)
    .maybeSingle();
  if (docErr) return { ok: false, error: docErr.message };
  if (!doc) return { ok: false, error: "document_not_found" };

  const row = doc as {
    id: string;
    paystack_reference: string | null;
    customer_email: string;
    created_at: string;
  };

  const candidates = new Set<string>();
  const override = params.overrideReference?.trim();
  if (override) candidates.add(override);
  const stored = String(row.paystack_reference ?? "").trim();
  if (stored) candidates.add(stored);
  candidates.add(salesDocumentPaystackReference(documentId));
  candidates.add(canonicalSalesDocumentPaystackReference(documentId));

  const { data: dedupRows } = await admin
    .from("sales_document_paystack_charge_dedup")
    .select("charge_reference")
    .eq("document_id", documentId);
  for (const d of dedupRows ?? []) {
    const cr = String((d as { charge_reference?: string }).charge_reference ?? "").trim();
    if (cr) candidates.add(cr);
  }

  for (const ref of candidates) {
    const hit = await verifyReference(secret, ref);
    if (hit) return hit;
  }

  const fromDate = new Date(row.created_at);
  fromDate.setDate(fromDate.getDate() - 7);
  const txs = await listRecentSuccessfulPaystackTransactions(secret, {
    fromIso: fromDate.toISOString(),
    maxPages: 8,
  });

  const emailNeedle = (params.customerEmail ?? row.customer_email).trim().toLowerCase();

  for (const tx of txs) {
    const ref = String(tx.reference ?? "").trim();
    if (!ref) continue;
    const metaId = metadataDocumentId(tx.metadata);
    const refDocId = parseSalesDocumentIdFromPaystackReference(ref);
    if (metaId === documentId || refDocId === documentId) {
      const hit = await verifyReference(secret, ref);
      if (hit) return hit;
    }
  }

  if (emailNeedle) {
    for (const tx of txs) {
      const ref = String(tx.reference ?? "").trim();
      if (!ref) continue;
      const hit = await verifyReference(secret, ref);
      if (!hit) continue;
      const verify = await fetchPaystackTransactionVerify(ref, secret);
      const email = String(verify.data?.metadata?.customer_email ?? "")
        .trim()
        .toLowerCase();
      if (email && email === emailNeedle && metadataDocumentId(verify.data?.metadata) === documentId) {
        return hit;
      }
    }
  }

  return {
    ok: false,
    error:
      "paystack_charge_not_found — paste the Paystack reference from your dashboard (Transactions). Check test vs live keys match the payment environment.",
  };
}
