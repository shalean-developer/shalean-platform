import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import { reportOperationalIssue } from "@/lib/logging/systemLog";

export type CreditTransactionType = "earn" | "spend" | "reverse" | "admin_adjust" | "expire";

export type CreditSummary = {
  balance: number;
  totalEarned: number;
  totalUsed: number;
};

export async function getCreditSummary(
  admin: SupabaseClient,
  userId: string,
): Promise<CreditSummary> {
  const [profileRes, txRes] = await Promise.all([
    admin.from("user_profiles").select("credit_balance_zar").eq("id", userId).maybeSingle(),
    admin
      .from("cleaning_credit_transactions")
      .select("amount_zar, type")
      .eq("user_id", userId),
  ]);

  const balance = Number(
    (profileRes.data as { credit_balance_zar?: number } | null)?.credit_balance_zar ?? 0,
  );

  const txs = txRes.data ?? [];
  let totalEarned = 0;
  let totalUsed = 0;
  for (const tx of txs) {
    const amt = Number((tx as { amount_zar?: number }).amount_zar ?? 0);
    const type = String((tx as { type?: string }).type ?? "");
    if (type === "earn" || (type === "admin_adjust" && amt > 0) || (type === "reverse" && amt > 0)) {
      totalEarned += Math.abs(amt);
    } else if (type === "spend" || type === "expire" || (type === "admin_adjust" && amt < 0)) {
      totalUsed += Math.abs(amt);
    }
  }

  return { balance: Math.max(0, balance), totalEarned, totalUsed };
}

async function recordTransaction(params: {
  admin: SupabaseClient;
  userId: string;
  amountZar: number;
  type: CreditTransactionType;
  referralId?: string | null;
  bookingId?: string | null;
  note?: string | null;
  createdBy?: string | null;
}): Promise<{ ok: true; balanceAfter: number } | { ok: false; error: string }> {
  const { admin, userId, amountZar, type } = params;

  const { data: profile } = await admin
    .from("user_profiles")
    .select("credit_balance_zar")
    .eq("id", userId)
    .maybeSingle();
  const current = Number((profile as { credit_balance_zar?: number } | null)?.credit_balance_zar ?? 0);
  const balanceAfter = Math.max(0, Math.round((current + amountZar) * 100) / 100);

  const { error: balErr } = await admin
    .from("user_profiles")
    .upsert({ id: userId, credit_balance_zar: balanceAfter }, { onConflict: "id" });
  if (balErr) return { ok: false, error: balErr.message };

  const { error: txErr } = await admin.from("cleaning_credit_transactions").insert({
    user_id: userId,
    amount_zar: amountZar,
    balance_after_zar: balanceAfter,
    type,
    referral_id: params.referralId ?? null,
    booking_id: params.bookingId ?? null,
    note: params.note ?? null,
    created_by: params.createdBy ?? null,
  });
  if (txErr) return { ok: false, error: txErr.message };

  return { ok: true, balanceAfter };
}

/** Credit referrer wallet with ledger entry (called after referral reward). */
export async function creditCleaningCredit(params: {
  admin: SupabaseClient;
  userId: string;
  amountZar: number;
  referralId?: string | null;
  note?: string | null;
  createdBy?: string | null;
}): Promise<{ ok: true; balanceAfter: number } | { ok: false; error: string }> {
  const amount = Math.max(0, Math.round(params.amountZar));
  if (amount <= 0) return { ok: false, error: "Amount must be positive." };
  return recordTransaction({
    admin: params.admin,
    userId: params.userId,
    amountZar: amount,
    type: "earn",
    referralId: params.referralId,
    note: params.note,
    createdBy: params.createdBy,
  });
}

/** Spend cleaning credit at checkout. */
export async function spendCleaningCredit(params: {
  admin: SupabaseClient;
  userId: string;
  amountZar: number;
  bookingId: string;
  note?: string | null;
}): Promise<{ ok: true; balanceAfter: number; spent: number } | { ok: false; error: string }> {
  const requested = Math.max(0, Math.round(params.amountZar));
  if (requested <= 0) return { ok: false, error: "Amount must be positive." };

  const { data: profile } = await params.admin
    .from("user_profiles")
    .select("credit_balance_zar")
    .eq("id", params.userId)
    .maybeSingle();
  const available = Number((profile as { credit_balance_zar?: number } | null)?.credit_balance_zar ?? 0);
  const spent = Math.min(requested, Math.max(0, available));
  if (spent <= 0) return { ok: false, error: "Insufficient cleaning credit." };

  const result = await recordTransaction({
    admin: params.admin,
    userId: params.userId,
    amountZar: -spent,
    type: "spend",
    bookingId: params.bookingId,
    note: params.note ?? `Applied to booking ${params.bookingId}`,
  });
  if (!result.ok) return result;
  return { ok: true, balanceAfter: result.balanceAfter, spent };
}

/** Reverse previously issued credit (admin action). */
export async function reverseCleaningCredit(params: {
  admin: SupabaseClient;
  userId: string;
  amountZar: number;
  referralId?: string | null;
  note?: string | null;
  createdBy?: string | null;
}): Promise<{ ok: true; balanceAfter: number } | { ok: false; error: string }> {
  const amount = Math.max(0, Math.round(params.amountZar));
  if (amount <= 0) return { ok: false, error: "Amount must be positive." };

  const { data: profile } = await params.admin
    .from("user_profiles")
    .select("credit_balance_zar")
    .eq("id", params.userId)
    .maybeSingle();
  const available = Number((profile as { credit_balance_zar?: number } | null)?.credit_balance_zar ?? 0);
  const reverse = Math.min(amount, available);

  return recordTransaction({
    admin: params.admin,
    userId: params.userId,
    amountZar: -reverse,
    type: "reverse",
    referralId: params.referralId,
    note: params.note,
    createdBy: params.createdBy,
  });
}

/** Admin manual credit adjustment. */
export async function adjustCleaningCredit(params: {
  admin: SupabaseClient;
  userId: string;
  amountZar: number;
  note: string;
  createdBy: string;
}): Promise<{ ok: true; balanceAfter: number } | { ok: false; error: string }> {
  return recordTransaction({
    admin: params.admin,
    userId: params.userId,
    amountZar: params.amountZar,
    type: "admin_adjust",
    note: params.note,
    createdBy: params.createdBy,
  });
}

export async function findUserIdByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<string | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const { data: profile } = await admin
    .from("user_profiles")
    .select("id")
    .eq("billing_email", normalized)
    .maybeSingle();
  if (profile?.id) return String(profile.id);

  const { data: booking } = await admin
    .from("bookings")
    .select("user_id")
    .eq("customer_email", normalized)
    .not("user_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (booking?.user_id) return String((booking as { user_id: string }).user_id);

  return null;
}

export async function logCreditIssueFailure(
  source: string,
  message: string,
  context: Record<string, unknown>,
): Promise<void> {
  await reportOperationalIssue("warn", source, message, context);
}
