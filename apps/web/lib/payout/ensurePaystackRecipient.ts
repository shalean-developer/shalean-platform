import type { SupabaseClient } from "@supabase/supabase-js";
import { getPaystackBaseUrl } from "@/lib/payout/paystackOrigin";

type PaystackRecipientJson = {
  status?: boolean;
  message?: string;
  data?: { recipient_code?: string };
};

type PaymentRow = {
  cleaner_id: string;
  account_number: string | null;
  bank_code: string | null;
  account_name: string | null;
  recipient_code: string | null;
};

/**
 * Returns Paystack `recipient_code` for this cleaner, creating the transfer recipient when missing.
 * Uses ZAR `basa` type (same as cleaner payment-details onboarding).
 */
export async function ensurePaystackRecipient(
  admin: SupabaseClient,
  cleanerId: string,
): Promise<{ ok: true; recipientCode: string } | { ok: false; error: string }> {
  const { data: row, error } = await admin
    .from("cleaner_payment_details")
    .select("cleaner_id, account_number, bank_code, account_name, recipient_code")
    .eq("cleaner_id", cleanerId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  const p = row as PaymentRow | null;
  if (!p) return { ok: false, error: "No bank details on file for this cleaner." };

  const existing = p.recipient_code?.trim();
  if (existing) return { ok: true, recipientCode: existing };

  const accountNumber = String(p.account_number ?? "").replace(/\s+/g, "").trim();
  const bankCode = String(p.bank_code ?? "").trim();
  const accountName = String(p.account_name ?? "").replace(/\s+/g, " ").trim();
  if (!/^\d{6,20}$/.test(accountNumber)) return { ok: false, error: "Invalid account number on file." };
  if (!/^[A-Za-z0-9_-]{2,20}$/.test(bankCode)) return { ok: false, error: "Invalid bank code on file." };
  if (accountName.length < 2) return { ok: false, error: "Account name missing on file." };

  const { data: cleaner, error: cErr } = await admin.from("cleaners").select("id, full_name").eq("id", cleanerId).maybeSingle();
  if (cErr) return { ok: false, error: cErr.message };
  const displayName = String((cleaner as { full_name?: string | null } | null)?.full_name ?? "").trim() || accountName;

  const secret = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (!secret) return { ok: false, error: "PAYSTACK_SECRET_KEY is not configured." };

  const base = getPaystackBaseUrl();
  let res: Response;
  try {
    res = await fetch(`${base}/transferrecipient`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "basa",
        name: displayName.slice(0, 120),
        account_number: accountNumber,
        bank_code: bankCode,
        currency: "ZAR",
      }),
    });
  } catch {
    return { ok: false, error: "Network error while creating Paystack recipient." };
  }

  const json = (await res.json().catch(() => ({}))) as PaystackRecipientJson;
  if (!res.ok || json.status === false) {
    return { ok: false, error: json.message ?? "Paystack transferrecipient failed." };
  }

  const recipientCode = json.data?.recipient_code?.trim();
  if (!recipientCode) return { ok: false, error: "Paystack did not return recipient_code." };

  const now = new Date().toISOString();
  const { error: upErr } = await admin
    .from("cleaner_payment_details")
    .update({ recipient_code: recipientCode, updated_at: now })
    .eq("cleaner_id", cleanerId);

  if (upErr) return { ok: false, error: `Recipient created but DB update failed: ${upErr.message}` };

  return { ok: true, recipientCode };
}
