import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getPublicAppUrlBase } from "@/lib/email/appUrl";
import { reportOperationalIssue } from "@/lib/logging/systemLog";
import { salesDocumentPaystackReference } from "@/lib/salesDocument/salesDocumentPaystackReference";

export type InitializeSalesDocumentPaystackResult =
  | { ok: true; authorizationUrl: string; reference: string; reused?: boolean }
  | { ok: false; error: string };

const PAYABLE_STATUSES = new Set(["draft", "sent", "accepted"]);

type DocRow = {
  id: string;
  document_type: string;
  status: string | null;
  total_cents: number | null;
  balance_cents: number | null;
  paystack_reference: string | null;
  payment_link: string | null;
  payment_link_expires_at?: string | null;
};

function isDuplicatePaystackReferenceMessage(msg: string): boolean {
  const m = msg.toLowerCase();
  return m.includes("duplicate") || m.includes("already exist");
}

export async function initializePaystackForSalesDocument(
  admin: SupabaseClient,
  params: { documentId: string; customerEmail: string },
): Promise<InitializeSalesDocumentPaystackResult> {
  const secret = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (!secret) return { ok: false, error: "PAYSTACK_SECRET_KEY missing" };

  const email = params.customerEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "invalid_customer_email" };
  }

  const { data: inv, error } = await admin
    .from("sales_documents")
    .select(
      "id, document_type, status, total_cents, balance_cents, paystack_reference, payment_link, payment_link_expires_at",
    )
    .eq("id", params.documentId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!inv) return { ok: false, error: "document_not_found" };

  const row = inv as DocRow;
  if (row.document_type !== "invoice") {
    return { ok: false, error: "not_an_invoice" };
  }

  const statusNorm = String(row.status ?? "").toLowerCase();
  if (!PAYABLE_STATUSES.has(statusNorm)) {
    return { ok: false, error: "document_not_payable" };
  }

  const balance = Math.max(0, Math.round(Number(row.balance_cents ?? 0)));
  if (balance <= 0) return { ok: false, error: "nothing_due" };

  const reference = salesDocumentPaystackReference(row.id);
  const existingRef = String(row.paystack_reference ?? "").trim();
  const existingLink = String(row.payment_link ?? "").trim();
  const expiresAt = typeof row.payment_link_expires_at === "string" ? row.payment_link_expires_at : null;
  const linkExpired = Boolean(expiresAt && new Date(expiresAt).getTime() < Date.now());

  if (!existingRef || existingRef !== reference) {
    const { error: refErr } = await admin
      .from("sales_documents")
      .update({ paystack_reference: reference })
      .eq("id", row.id);
    if (refErr) return { ok: false, error: refErr.message };
  }

  if (existingLink && !linkExpired) {
    return {
      ok: true,
      authorizationUrl: existingLink,
      reference: existingRef === reference ? existingRef : reference,
      reused: true,
    };
  }

  const appUrl = getPublicAppUrlBase();
  const callbackUrl = appUrl ? `${appUrl}/pay/doc/${encodeURIComponent(row.id)}/success` : undefined;

  const res = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      amount: balance,
      currency: "ZAR",
      reference,
      ...(callbackUrl ? { callback_url: callbackUrl } : {}),
      metadata: {
        shalean_sales_document_id: row.id,
        customer_email: email,
        amount_due_cents: String(balance),
      },
    }),
  });

  const json = (await res.json()) as {
    status?: boolean;
    message?: string;
    data?: { authorization_url?: string; reference?: string };
  };

  if (!json.status || !json.data?.authorization_url) {
    const msg = String(json.message ?? "");
    if (isDuplicatePaystackReferenceMessage(msg)) {
      const { data: again } = await admin
        .from("sales_documents")
        .select("paystack_reference, payment_link")
        .eq("id", row.id)
        .maybeSingle();
      const link2 = String((again as DocRow | null)?.payment_link ?? "").trim();
      const pref2 = String((again as DocRow | null)?.paystack_reference ?? reference).trim();
      if (link2 && pref2) {
        return { ok: true, authorizationUrl: link2, reference: pref2, reused: true };
      }
    }
    await reportOperationalIssue("error", "sales_document/paystack_init", msg || "initialize failed", {
      documentId: row.id,
    });
    return { ok: false, error: msg || "paystack_initialize_failed" };
  }

  const authUrl = json.data.authorization_url;
  const ref = json.data.reference ?? reference;
  const paymentLinkExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { error: patchErr } = await admin
    .from("sales_documents")
    .update({
      paystack_reference: ref,
      payment_link: authUrl,
      payment_link_expires_at: paymentLinkExpiresAt,
      balance_cents: balance,
      ...(statusNorm === "draft" ? { status: "sent", sent_at: new Date().toISOString() } : {}),
    })
    .eq("id", row.id);

  if (patchErr) return { ok: false, error: patchErr.message };

  return { ok: true, authorizationUrl: authUrl, reference: ref };
}
