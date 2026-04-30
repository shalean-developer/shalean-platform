import type { SupabaseClient } from "@supabase/supabase-js";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { ensurePaystackRecipient } from "@/lib/payout/ensurePaystackRecipient";
import { getPaystackBaseUrl } from "@/lib/payout/paystackOrigin";

type PayoutRow = {
  id: string;
  cleaner_id: string;
  total_amount_cents: number;
  status: string;
  payment_status?: string | null;
  payment_reference?: string | null;
};

type BookingPayoutRow = {
  cleaner_id: string | null;
  cleaner_payout_cents: number | null;
  cleaner_bonus_cents: number | null;
  is_test: boolean | null;
};

type ExistingTransfer = {
  id: string;
  transfer_code: string | null;
};

type PaystackJson = {
  status?: boolean;
  message?: string;
  data?: {
    transfer_code?: string;
    status?: string;
    reference?: string;
  };
};

type PaystackTransferResult = {
  ok: true;
  transferCode: string | null;
  reference: string;
  skippedExisting?: boolean;
} | {
  ok: false;
  error: string;
  status?: number;
};

function cents(value: unknown): number {
  if (value == null || !Number.isFinite(Number(value))) return 0;
  return Math.max(0, Math.round(Number(value)));
}

function paystackTransferClientReference(payoutId: string, paymentStatus: string | null | undefined): string {
  const base = `shalean-cleaner-payout-${payoutId}`;
  const s = String(paymentStatus ?? "")
    .trim()
    .toLowerCase();
  if (s === "failed" || s === "partial_failed") return `${base}-retry-${Date.now()}`;
  return base;
}

async function paystackRequest(path: string, body: Record<string, unknown>): Promise<{ ok: true; json: PaystackJson } | { ok: false; error: string }> {
  const secret = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (!secret) return { ok: false, error: "PAYSTACK_SECRET_KEY is not configured." };

  const origin = getPaystackBaseUrl();
  const res = await fetch(`${origin}${path.startsWith("/") ? path : `/${path}`}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json().catch(() => ({}))) as PaystackJson;
  if (!res.ok || json.status === false) {
    return { ok: false, error: json.message ?? `Paystack request failed with ${res.status}.` };
  }
  return { ok: true, json };
}

async function logFailedTransfer(
  admin: SupabaseClient,
  params: {
    payoutId: string;
    cleanerId: string;
    amountCents: number;
    recipientCode?: string | null;
    error: string;
  },
) {
  await admin.from("payout_transfers").insert({
    payout_id: params.payoutId,
    cleaner_id: params.cleanerId,
    amount_cents: params.amountCents,
    recipient_code: params.recipientCode ?? null,
    status: "failed",
    error: params.error.slice(0, 2000),
  });
}

async function failPayoutExecution(admin: SupabaseClient, payoutId: string, status: "failed" | "partial_failed" = "failed") {
  await admin.from("cleaner_payouts").update({ payment_status: status }).eq("id", payoutId).eq("status", "approved");
}

export async function payCleanerPayoutWithPaystack(
  admin: SupabaseClient,
  params: { payoutId: string; paidBy: string },
): Promise<PaystackTransferResult> {
  const { data: payoutData, error: payoutErr } = await admin
    .from("cleaner_payouts")
    .select("id, cleaner_id, total_amount_cents, status, payment_status, payment_reference")
    .eq("id", params.payoutId)
    .maybeSingle();
  if (payoutErr) return { ok: false, error: payoutErr.message };
  if (!payoutData) return { ok: false, error: "Payout not found.", status: 404 };

  const payout = payoutData as PayoutRow;
  if (payout.status !== "approved") {
    return { ok: false, error: "Only approved payout batches can be paid.", status: 400 };
  }

  const { data: existingSuccess, error: existingErr } = await admin
    .from("payout_transfers")
    .select("id, transfer_code")
    .eq("payout_id", payout.id)
    .eq("status", "success")
    .maybeSingle();
  if (existingErr) return { ok: false, error: existingErr.message };
  if (existingSuccess) {
    const existing = existingSuccess as ExistingTransfer;
    const now = new Date().toISOString();
    await admin
      .from("cleaner_payouts")
      .update({
        status: "paid",
        paid_at: now,
        payment_status: "success",
        payment_reference: existing.transfer_code ?? payout.payment_reference ?? null,
      })
      .eq("id", payout.id)
      .eq("status", "approved");
    return { ok: true, transferCode: existing.transfer_code, reference: existing.transfer_code ?? payout.id, skippedExisting: true };
  }

  const { data: claimed, error: claimErr } = await admin
    .from("cleaner_payouts")
    .update({ payment_status: "processing" })
    .eq("id", payout.id)
    .eq("status", "approved")
    .in("payment_status", ["pending", "failed", "partial_failed"])
    .select("id");
  if (claimErr) return { ok: false, error: claimErr.message };
  if (!claimed?.length) return { ok: false, error: "Payout payment is already in progress.", status: 409 };

  const { data: bookings, error: bookingsErr } = await admin
    .from("bookings")
    .select("cleaner_id, cleaner_payout_cents, cleaner_bonus_cents, is_test")
    .eq("payout_id", payout.id);
  if (bookingsErr) {
    await failPayoutExecution(admin, payout.id);
    return { ok: false, error: bookingsErr.message };
  }

  const bookingRows = (bookings ?? []) as BookingPayoutRow[];
  if (bookingRows.length === 0) {
    await failPayoutExecution(admin, payout.id);
    return { ok: false, error: "Payout has no linked bookings.", status: 400 };
  }
  if (bookingRows.some((row) => row.is_test)) {
    await failPayoutExecution(admin, payout.id);
    return { ok: false, error: "Cannot pay a payout batch containing test bookings.", status: 400 };
  }
  if (bookingRows.some((row) => row.cleaner_id !== payout.cleaner_id)) {
    await failPayoutExecution(admin, payout.id);
    return { ok: false, error: "Payout contains bookings for a different cleaner.", status: 400 };
  }

  const bookingTotal = bookingRows.reduce(
    (sum, row) => sum + cents(row.cleaner_payout_cents) + cents(row.cleaner_bonus_cents),
    0,
  );
  const payoutAmount = cents(payout.total_amount_cents);
  if (payoutAmount <= 0 || bookingTotal !== payoutAmount) {
    await failPayoutExecution(admin, payout.id);
    return { ok: false, error: "Payout total does not match linked booking totals.", status: 400 };
  }

  const ensured = await ensurePaystackRecipient(admin, payout.cleaner_id);
  if (!ensured.ok) {
    const error = ensured.error;
    await logFailedTransfer(admin, { payoutId: payout.id, cleanerId: payout.cleaner_id, amountCents: payoutAmount, error });
    await failPayoutExecution(admin, payout.id);
    return { ok: false, error, status: 400 };
  }

  const recipientCode = ensured.recipientCode;

  const reference = paystackTransferClientReference(payout.id, payout.payment_status);
  const transfer = await paystackRequest("/transfer", {
    source: "balance",
    amount: payoutAmount,
    recipient: recipientCode,
    reason: "Cleaner payout",
    reference,
  });

  if (!transfer.ok) {
    await logFailedTransfer(admin, {
      payoutId: payout.id,
      cleanerId: payout.cleaner_id,
      amountCents: payoutAmount,
      recipientCode,
      error: transfer.error,
    });
    await failPayoutExecution(admin, payout.id);
    return { ok: false, error: transfer.error };
  }

  const transferCode = transfer.json.data?.transfer_code ?? null;
  const transferReference = transfer.json.data?.reference ?? reference;
  const { error: logErr } = await admin.from("payout_transfers").insert({
    payout_id: payout.id,
    cleaner_id: payout.cleaner_id,
    amount_cents: payoutAmount,
    recipient_code: recipientCode,
    transfer_code: transferCode,
    status: "processing",
  });
  if (logErr) {
    await failPayoutExecution(admin, payout.id);
    return { ok: false, error: `Transfer sent but audit log failed: ${logErr.message}` };
  }

  const { error: updateErr } = await admin
    .from("cleaner_payouts")
    .update({
      status: "approved",
      payment_status: "processing",
      payment_reference: transferCode ?? transferReference,
    })
    .eq("id", payout.id)
    .eq("status", "approved");
  if (updateErr) return { ok: false, error: updateErr.message };

  void logSystemEvent({
    level: "info",
    source: "PAYOUT_PAYSTACK_PROCESSING",
    message: "Cleaner payout transfer sent to Paystack; awaiting webhook confirmation",
    context: { payoutId: payout.id, cleanerId: payout.cleaner_id, paidBy: params.paidBy, transferCode, transferReference },
  });

  return { ok: true, transferCode, reference: transferReference };
}
