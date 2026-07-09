import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import { reportOperationalIssue } from "@/lib/logging/systemLog";

export type CreditTransactionType = "earn" | "spend" | "reverse" | "admin_adjust" | "expire";

export type CreditSummary = {
  balance: number;
  totalEarned: number;
  totalUsed: number;
  /** Earliest expiry among non-spent referral rewards still in wallet (approximation). */
  nextExpiryAt: string | null;
};

type RpcResult = {
  ok: boolean;
  balance_after_zar: number;
  error_message: string | null;
};

async function applyCreditViaRpc(params: {
  admin: SupabaseClient;
  userId: string;
  amountZar: number;
  type: CreditTransactionType;
  referralId?: string | null;
  bookingId?: string | null;
  note?: string | null;
  createdBy?: string | null;
}): Promise<{ ok: true; balanceAfter: number } | { ok: false; error: string }> {
  const { data, error } = await params.admin.rpc("apply_cleaning_credit_transaction", {
    p_user_id: params.userId,
    p_amount_zar: params.amountZar,
    p_type: params.type,
    p_referral_id: params.referralId ?? null,
    p_booking_id: params.bookingId ?? null,
    p_note: params.note ?? null,
    p_created_by: params.createdBy ?? null,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const row = Array.isArray(data) ? (data[0] as RpcResult | undefined) : (data as RpcResult | null);
  if (!row?.ok) {
    return { ok: false, error: row?.error_message ?? "Credit transaction failed." };
  }
  return { ok: true, balanceAfter: Number(row.balance_after_zar ?? 0) };
}

/** Check whether user has expired referral credit that should block spend. */
async function hasExpiredReferralCredit(admin: SupabaseClient, userId: string): Promise<boolean> {
  const now = new Date().toISOString();
  const { data: profile } = await admin
    .from("user_profiles")
    .select("credit_balance_zar")
    .eq("id", userId)
    .maybeSingle();
  const balance = Number((profile as { credit_balance_zar?: number } | null)?.credit_balance_zar ?? 0);
  if (balance <= 0) return false;

  const { data: expiredRewards } = await admin
    .from("referrals")
    .select("id")
    .eq("referrer_type", "customer")
    .eq("referrer_id", userId)
    .eq("status", "rewarded")
    .not("credit_expires_at", "is", null)
    .lt("credit_expires_at", now)
    .limit(1);
  return Boolean(expiredRewards?.length);
}

export async function getCreditSummary(
  admin: SupabaseClient,
  userId: string,
): Promise<CreditSummary> {
  const [profileRes, txRes, expiryRes] = await Promise.all([
    admin.from("user_profiles").select("credit_balance_zar").eq("id", userId).maybeSingle(),
    admin
      .from("cleaning_credit_transactions")
      .select("amount_zar, type")
      .eq("user_id", userId),
    admin
      .from("referrals")
      .select("credit_expires_at")
      .eq("referrer_type", "customer")
      .eq("referrer_id", userId)
      .eq("status", "rewarded")
      .not("credit_expires_at", "is", null)
      .order("credit_expires_at", { ascending: true })
      .limit(1),
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

  const nextExpiryAt =
    (expiryRes.data?.[0] as { credit_expires_at?: string | null } | undefined)?.credit_expires_at ??
    null;

  return { balance: Math.max(0, balance), totalEarned, totalUsed, nextExpiryAt };
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
  return applyCreditViaRpc({
    admin: params.admin,
    userId: params.userId,
    amountZar: amount,
    type: "earn",
    referralId: params.referralId,
    note: params.note,
    createdBy: params.createdBy,
  });
}

/** Spend cleaning credit at checkout. Blocks spend if referral credit has expired. */
export async function spendCleaningCredit(params: {
  admin: SupabaseClient;
  userId: string;
  amountZar: number;
  bookingId: string;
  note?: string | null;
}): Promise<{ ok: true; balanceAfter: number; spent: number } | { ok: false; error: string }> {
  const requested = Math.max(0, Math.round(params.amountZar));
  if (requested <= 0) return { ok: false, error: "Amount must be positive." };

  if (await hasExpiredReferralCredit(params.admin, params.userId)) {
    return { ok: false, error: "Your cleaning credit has expired." };
  }

  const { data: profile } = await params.admin
    .from("user_profiles")
    .select("credit_balance_zar")
    .eq("id", params.userId)
    .maybeSingle();
  const available = Number((profile as { credit_balance_zar?: number } | null)?.credit_balance_zar ?? 0);
  const spent = Math.min(requested, Math.max(0, available));
  if (spent <= 0) return { ok: false, error: "Insufficient cleaning credit." };

  const result = await applyCreditViaRpc({
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

/** Reverse previously issued credit (admin action or clawback). */
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
  if (reverse <= 0) return { ok: false, error: "No credit to reverse." };

  return applyCreditViaRpc({
    admin: params.admin,
    userId: params.userId,
    amountZar: -reverse,
    type: "reverse",
    referralId: params.referralId,
    note: params.note,
    createdBy: params.createdBy,
  });
}

/** Expire cleaning credit for referrals past credit_expires_at. */
export async function expireCleaningCredit(params: {
  admin: SupabaseClient;
  userId: string;
  amountZar: number;
  referralId?: string | null;
  note?: string | null;
}): Promise<{ ok: true; balanceAfter: number } | { ok: false; error: string }> {
  const amount = Math.max(0, Math.round(params.amountZar));
  if (amount <= 0) return { ok: false, error: "Nothing to expire." };

  return applyCreditViaRpc({
    admin: params.admin,
    userId: params.userId,
    amountZar: -amount,
    type: "expire",
    referralId: params.referralId,
    note: params.note ?? "Referral credit expired",
    createdBy: "system_expiry",
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
  return applyCreditViaRpc({
    admin: params.admin,
    userId: params.userId,
    amountZar: params.amountZar,
    type: "admin_adjust",
    note: params.note,
    createdBy: params.createdBy,
  });
}

/** Process expired referral credits — run from cron. */
export async function processExpiredReferralCredits(
  admin: SupabaseClient,
): Promise<{ expired: number; errors: number }> {
  const now = new Date().toISOString();
  let expired = 0;
  let errors = 0;

  const { data: rows } = await admin
    .from("referrals")
    .select("id, referrer_id, reward_amount, credit_expires_at")
    .eq("referrer_type", "customer")
    .eq("status", "rewarded")
    .not("credit_expires_at", "is", null)
    .lt("credit_expires_at", now)
    .limit(200);

  for (const row of rows ?? []) {
    const referralId = String((row as { id: string }).id);
    const userId = String((row as { referrer_id: string }).referrer_id);
    const amount = Math.max(0, Math.round(Number((row as { reward_amount?: number }).reward_amount ?? 0)));

    const { data: alreadyExpired } = await admin
      .from("cleaning_credit_transactions")
      .select("id")
      .eq("referral_id", referralId)
      .eq("type", "expire")
      .maybeSingle();
    if (alreadyExpired?.id) continue;

    const result = await expireCleaningCredit({
      admin,
      userId,
      amountZar: amount,
      referralId,
      note: `Referral credit expired (${(row as { credit_expires_at?: string }).credit_expires_at})`,
    });
    if (result.ok) {
      expired += 1;
      await admin.from("referrals").update({ status: "expired" }).eq("id", referralId).eq("status", "rewarded");
    } else {
      errors += 1;
      await reportOperationalIssue("warn", "referrals/creditExpiry", result.error, { referralId, userId });
    }
  }

  return { expired, errors };
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
