import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logSystemEvent } from "@/lib/logging/systemLog";
import {
  monthlyInvoiceIdFromPaystackMetadata,
  parseMonthlyInvoiceIdFromPaystackReference,
} from "@/lib/monthlyInvoice/monthlyInvoicePaystackReference";
import {
  monthlyInvoicePaystackReferenceForInitialize,
  stableMonthlyInvoicePaystackReference,
} from "@/lib/monthlyInvoice/monthlyInvoiceStablePaystackReference";
import { fetchPaystackTransactionVerify } from "@/lib/payments/verifyPaystackTransaction";
import {
  describePaystackKeyModes,
  getPaystackSecretKeyCandidates,
} from "@/lib/paystack/paystackSecretKeys";

export type FoundMonthlyInvoicePaystackCharge = {
  reference: string;
  amountCents: number;
};

type PaystackListTx = {
  reference?: string;
  status?: string;
  amount?: number;
  metadata?: Record<string, unknown> | null;
  customer?: { email?: string | null } | null;
};

function isSuccessfulVerify(
  verify: Awaited<ReturnType<typeof fetchPaystackTransactionVerify>>,
): FoundMonthlyInvoicePaystackCharge | null {
  const tx = verify.data;
  if (verify.status !== true || !tx) return null;
  if (String(tx.status ?? "").toLowerCase() !== "success") return null;
  if (typeof tx.amount !== "number" || !Number.isFinite(tx.amount)) return null;
  const reference = String(tx.reference ?? "").trim();
  if (!reference) return null;
  return { reference, amountCents: Math.round(tx.amount) };
}

async function verifyReferenceWithKeys(
  keys: ReturnType<typeof getPaystackSecretKeyCandidates>,
  reference: string,
): Promise<{ hit: FoundMonthlyInvoicePaystackCharge | null; lastMessage: string | null }> {
  const ref = reference.trim();
  if (!ref) return { hit: null, lastMessage: null };

  let lastMessage: string | null = null;
  for (const key of keys) {
    const verify = await fetchPaystackTransactionVerify(ref, key.secret);
    if (typeof verify.message === "string" && verify.message.trim()) {
      lastMessage = verify.message.trim();
    }
    const hit = isSuccessfulVerify(verify);
    if (hit) return { hit, lastMessage };
  }
  return { hit: null, lastMessage };
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

function trustedAdminOverrideCharge(params: {
  invoiceId: string;
  overrideReference: string;
  totalCents: number | null;
  balanceCents: number | null;
  amountPaidCents: number | null;
}): FoundMonthlyInvoicePaystackCharge | null {
  const refInvoiceId = parseMonthlyInvoiceIdFromPaystackReference(params.overrideReference);
  if (refInvoiceId !== params.invoiceId) return null;

  const total = Math.max(0, Math.round(Number(params.totalCents ?? 0)));
  const balance = Math.max(0, Math.round(Number(params.balanceCents ?? 0)));
  const paid = Math.max(0, Math.round(Number(params.amountPaidCents ?? 0)));
  const amountCents = balance > 0 ? balance : total > paid ? total - paid : total;
  if (amountCents <= 0) return null;

  return { reference: params.overrideReference.trim(), amountCents };
}

function txMatchesInvoice(tx: PaystackListTx, invoiceId: string): boolean {
  const ref = String(tx.reference ?? "").trim();
  if (!ref) return false;
  const metaId = monthlyInvoiceIdFromPaystackMetadata(
    tx.metadata != null && typeof tx.metadata === "object" && !Array.isArray(tx.metadata)
      ? (tx.metadata as Record<string, unknown>)
      : undefined,
  );
  if (metaId === invoiceId) return true;
  return parseMonthlyInvoiceIdFromPaystackReference(ref) === invoiceId;
}

/**
 * Locate a successful Paystack charge for a monthly invoice when the stored reference
 * does not verify (reference drift, test/live mismatch, webhook missed).
 */
export async function findSuccessfulPaystackChargeForMonthlyInvoice(
  admin: SupabaseClient,
  params: {
    invoiceId: string;
    customerEmail?: string | null;
    overrideReference?: string | null;
  },
): Promise<FoundMonthlyInvoicePaystackCharge | { ok: false; error: string }> {
  const invoiceId = params.invoiceId.trim();
  if (!/^[0-9a-f-]{36}$/i.test(invoiceId)) {
    return { ok: false, error: "invalid_invoice_id" };
  }

  const keys = getPaystackSecretKeyCandidates();
  if (keys.length === 0) return { ok: false, error: "paystack_not_configured" };

  const { data: inv, error: invErr } = await admin
    .from("monthly_invoices")
    .select(
      "id, month, status, paystack_reference, total_amount_cents, amount_paid_cents, balance_cents, created_at, sent_at, customer_id",
    )
    .eq("id", invoiceId)
    .maybeSingle();
  if (invErr) return { ok: false, error: invErr.message };
  if (!inv) return { ok: false, error: "invoice_not_found" };

  const row = inv as {
    id: string;
    month: string | null;
    status: string | null;
    paystack_reference: string | null;
    total_amount_cents: number | null;
    amount_paid_cents: number | null;
    balance_cents: number | null;
    created_at: string;
    sent_at: string | null;
    customer_id: string;
  };

  const candidates = new Set<string>();
  const override = params.overrideReference?.trim();
  if (override) candidates.add(override);
  const stored = String(row.paystack_reference ?? "").trim();
  if (stored) candidates.add(stored);
  candidates.add(stableMonthlyInvoicePaystackReference(row.id, row.month));
  candidates.add(
    monthlyInvoicePaystackReferenceForInitialize({
      id: row.id,
      month: row.month,
      status: row.status,
      balance_cents: row.balance_cents,
    }),
  );

  const { data: dedupRows } = await admin
    .from("monthly_invoice_paystack_charge_dedup")
    .select("charge_reference")
    .eq("invoice_id", invoiceId);
  for (const d of dedupRows ?? []) {
    const cr = String((d as { charge_reference?: string }).charge_reference ?? "").trim();
    if (cr) candidates.add(cr);
  }

  let lastPaystackMessage: string | null = null;

  for (const ref of candidates) {
    const { hit, lastMessage } = await verifyReferenceWithKeys(keys, ref);
    if (lastMessage) lastPaystackMessage = lastMessage;
    if (hit) return hit;
  }

  const anchorIso = row.sent_at ?? row.created_at;
  const fromDate = new Date(anchorIso);
  fromDate.setDate(fromDate.getDate() - 14);

  let emailNeedle = params.customerEmail?.trim().toLowerCase() ?? "";
  if (!emailNeedle && row.customer_id) {
    const { data: userData } = await admin.auth.admin.getUserById(row.customer_id);
    emailNeedle = String(userData?.user?.email ?? "")
      .trim()
      .toLowerCase();
  }

  const expectedAmount = Math.max(0, Math.round(Number(row.balance_cents ?? 0)));

  for (const key of keys) {
    const txs = await listRecentSuccessfulPaystackTransactions(key.secret, {
      fromIso: fromDate.toISOString(),
      maxPages: 5,
    });

    for (const tx of txs) {
      if (!txMatchesInvoice(tx, invoiceId)) continue;
      const ref = String(tx.reference ?? "").trim();
      if (!ref) continue;
      const { hit, lastMessage } = await verifyReferenceWithKeys(keys, ref);
      if (lastMessage) lastPaystackMessage = lastMessage;
      if (hit) return hit;
    }

    if (emailNeedle && expectedAmount > 0) {
      for (const tx of txs) {
        const ref = String(tx.reference ?? "").trim();
        if (!ref) continue;
        const txEmail = String(tx.customer?.email ?? "").trim().toLowerCase();
        if (txEmail !== emailNeedle) continue;
        if (Math.round(Number(tx.amount ?? 0)) !== expectedAmount) continue;
        const metaId = monthlyInvoiceIdFromPaystackMetadata(
          tx.metadata != null && typeof tx.metadata === "object" && !Array.isArray(tx.metadata)
            ? (tx.metadata as Record<string, unknown>)
            : undefined,
        );
        const refId = parseMonthlyInvoiceIdFromPaystackReference(ref);
        if (metaId !== invoiceId && refId !== invoiceId) continue;
        const { hit, lastMessage } = await verifyReferenceWithKeys(keys, ref);
        if (lastMessage) lastPaystackMessage = lastMessage;
        if (hit) return hit;
      }
    }
  }

  if (override) {
    const trusted = trustedAdminOverrideCharge({
      invoiceId,
      overrideReference: override,
      totalCents: row.total_amount_cents,
      balanceCents: row.balance_cents,
      amountPaidCents: row.amount_paid_cents,
    });
    if (trusted) {
      await logSystemEvent({
        level: "warn",
        source: "monthly_invoice/sync_payment",
        message: "trusted_admin_reference_without_paystack_verify",
        context: {
          invoiceId,
          reference: trusted.reference,
          amountCents: trusted.amountCents,
          keysTried: describePaystackKeyModes(keys),
          lastPaystackMessage,
        },
      });
      return trusted;
    }
  }

  const keysLabel = describePaystackKeyModes(keys);
  const paystackHint = lastPaystackMessage ? ` Paystack: ${lastPaystackMessage}.` : "";
  return {
    ok: false,
    error:
      `paystack_charge_not_found — could not verify with configured keys (${keysLabel}).` +
      paystackHint +
      " If the customer paid on live Paystack, set PAYSTACK_SECRET_KEY_LIVE (or switch PAYSTACK_SECRET_KEY to the live secret)." +
      " You can paste the Paystack transaction reference from the dashboard and sync again.",
  };
}
