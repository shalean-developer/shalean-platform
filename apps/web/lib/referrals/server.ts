import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";

function randDigits(len: number): string {
  let out = "";
  for (let i = 0; i < len; i++) out += Math.floor(Math.random() * 10);
  return out;
}

async function generateUniqueCode(
  admin: SupabaseClient,
  table: "user_profiles" | "cleaners",
): Promise<string> {
  for (let i = 0; i < 12; i++) {
    const code = `SHALEAN${randDigits(4)}`;
    const { data } = await admin.from(table).select("id").eq("referral_code", code).maybeSingle();
    if (!data) return code;
  }
  return `SHALEAN${Date.now().toString().slice(-6)}`;
}

export async function getOrCreateCustomerReferralCode(
  admin: SupabaseClient,
  userId: string,
): Promise<string> {
  const { data } = await admin.from("user_profiles").select("referral_code").eq("id", userId).maybeSingle();
  const existing = String((data as { referral_code?: string | null } | null)?.referral_code ?? "");
  if (existing) return existing;
  const code = await generateUniqueCode(admin, "user_profiles");
  await admin.from("user_profiles").upsert({ id: userId, referral_code: code }, { onConflict: "id" });
  return code;
}

export async function getOrCreateCleanerReferralCode(
  admin: SupabaseClient,
  cleanerId: string,
): Promise<string> {
  const { data } = await admin.from("cleaners").select("referral_code").eq("id", cleanerId).maybeSingle();
  const existing = String((data as { referral_code?: string | null } | null)?.referral_code ?? "");
  if (existing) return existing;
  const code = await generateUniqueCode(admin, "cleaners");
  await admin.from("cleaners").update({ referral_code: code }).eq("id", cleanerId);
  return code;
}

export async function resolveReferrerFromCode(
  admin: SupabaseClient,
  code: string,
): Promise<{ referrerId: string; referrerType: "customer" | "cleaner"; contact: string | null } | null> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;

  const [userCode, cleanerCode] = await Promise.all([
    admin.from("user_profiles").select("id").eq("referral_code", normalized).maybeSingle(),
    admin.from("cleaners").select("id, email, phone, phone_number").eq("referral_code", normalized).maybeSingle(),
  ]);

  if (userCode.data?.id) {
    return { referrerId: String(userCode.data.id), referrerType: "customer", contact: null };
  }
  if (cleanerCode.data?.id) {
    const c = cleanerCode.data as { id: string; email?: string | null; phone?: string | null; phone_number?: string | null };
    return { referrerId: String(c.id), referrerType: "cleaner", contact: c.phone_number ?? c.phone ?? c.email ?? null };
  }
  return null;
}

export async function createPendingCustomerReferral(params: {
  admin: SupabaseClient;
  refCode: string;
  referredUserId: string | null;
  referredEmail: string;
}): Promise<void> {
  const referrer = await resolveReferrerFromCode(params.admin, params.refCode);
  if (!referrer || referrer.referrerType !== "customer") return;
  if (params.referredUserId && params.referredUserId === referrer.referrerId) return;

  const email = normalizeEmail(params.referredEmail || "");
  if (!email) return;

  const { data: alreadyCompleted } = await params.admin
    .from("referrals")
    .select("id")
    .eq("referrer_type", "customer")
    .eq("referred_email_or_phone", email)
    .eq("status", "completed")
    .maybeSingle();
  if (alreadyCompleted?.id) return;

  const { data: existing } = await params.admin
    .from("referrals")
    .select("id")
    .eq("referrer_type", "customer")
    .eq("referrer_id", referrer.referrerId)
    .eq("referred_email_or_phone", email)
    .eq("status", "pending")
    .maybeSingle();

  if (existing?.id) {
    if (params.referredUserId) {
      await params.admin.from("referrals").update({ referred_user_id: params.referredUserId }).eq("id", existing.id);
    }
    return;
  }

  await params.admin.from("referrals").insert({
    referrer_id: referrer.referrerId,
    referrer_type: "customer",
    referred_email_or_phone: email,
    referred_user_id: params.referredUserId,
    reward_amount: 50,
    status: "pending",
  });
}

export async function completeCustomerReferralForBooking(params: {
  admin: SupabaseClient;
  bookingUserId: string | null;
  customerEmail: string;
}): Promise<void> {
  const email = normalizeEmail(params.customerEmail || "");
  const pendingQ = params.admin
    .from("referrals")
    .select("id, referrer_id, referred_user_id")
    .eq("referrer_type", "customer")
    .eq("status", "pending")
    .eq("referred_email_or_phone", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: pending } = await pendingQ;
  if (!pending?.id) return;
  if (params.bookingUserId && String(pending.referrer_id) === params.bookingUserId) return;

  const { data: dup } = await params.admin
    .from("referrals")
    .select("id")
    .eq("referrer_type", "customer")
    .eq("referred_email_or_phone", email)
    .eq("status", "completed")
    .maybeSingle();
  if (dup?.id) return;

  await params.admin.from("referrals").update({
    status: "completed",
    completed_at: new Date().toISOString(),
    referred_user_id: params.bookingUserId ?? pending.referred_user_id ?? null,
  }).eq("id", pending.id);

  await params.admin
    .from("user_profiles")
    .upsert({ id: String(pending.referrer_id), credit_balance_zar: 0 }, { onConflict: "id" });
  const { data: profile } = await params.admin
    .from("user_profiles")
    .select("credit_balance_zar")
    .eq("id", String(pending.referrer_id))
    .maybeSingle();
  const bal = Number((profile as { credit_balance_zar?: number } | null)?.credit_balance_zar ?? 0);
  await params.admin
    .from("user_profiles")
    .update({ credit_balance_zar: Math.max(0, bal) + 50 })
    .eq("id", String(pending.referrer_id));
}

export async function createPendingCleanerReferral(params: {
  admin: SupabaseClient;
  refCode: string;
  referredPhone: string;
}): Promise<void> {
  const referrer = await resolveReferrerFromCode(params.admin, params.refCode);
  if (!referrer || referrer.referrerType !== "cleaner") return;
  const phone = String(params.referredPhone ?? "").trim();
  if (!phone) return;
  if (referrer.contact && String(referrer.contact).trim() === phone) return;

  const { data: exists } = await params.admin
    .from("referrals")
    .select("id")
    .eq("referrer_type", "cleaner")
    .eq("referrer_id", referrer.referrerId)
    .eq("referred_email_or_phone", phone)
    .eq("status", "pending")
    .maybeSingle();
  if (exists?.id) return;

  await params.admin.from("referrals").insert({
    referrer_id: referrer.referrerId,
    referrer_type: "cleaner",
    referred_email_or_phone: phone,
    reward_amount: 100,
    status: "pending",
  });
}

export async function linkCleanerReferralOnApproval(params: {
  admin: SupabaseClient;
  cleanerId: string;
  cleanerPhone: string;
}): Promise<void> {
  const phone = String(params.cleanerPhone ?? "").trim();
  if (!phone) return;
  const { data: pending } = await params.admin
    .from("referrals")
    .select("id, referrer_id")
    .eq("referrer_type", "cleaner")
    .eq("status", "pending")
    .eq("referred_email_or_phone", phone)
    .is("referred_user_id", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!pending?.id) return;
  if (String(pending.referrer_id) === params.cleanerId) return;
  await params.admin.from("referrals").update({ referred_user_id: params.cleanerId }).eq("id", pending.id);
}

export async function completeCleanerReferralOnFirstJob(params: {
  admin: SupabaseClient;
  cleanerId: string | null;
}): Promise<void> {
  if (!params.cleanerId) return;
  const cleanerId = params.cleanerId;
  const { count } = await params.admin
    .from("bookings")
    .select("id", { head: true, count: "exact" })
    .eq("cleaner_id", cleanerId)
    .eq("status", "completed");
  if ((count ?? 0) < 1) return;

  const { data: pending } = await params.admin
    .from("referrals")
    .select("id, referrer_id")
    .eq("referrer_type", "cleaner")
    .eq("status", "pending")
    .eq("referred_user_id", cleanerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!pending?.id) return;
  if (String(pending.referrer_id) === cleanerId) return;

  const { data: done } = await params.admin
    .from("referrals")
    .select("id")
    .eq("referrer_type", "cleaner")
    .eq("referred_user_id", cleanerId)
    .eq("status", "completed")
    .maybeSingle();
  if (done?.id) return;

  await params.admin.from("referrals").update({
    status: "completed",
    completed_at: new Date().toISOString(),
  }).eq("id", pending.id);

  const { data: cleaner } = await params.admin
    .from("cleaners")
    .select("bonus_payout_zar")
    .eq("id", String(pending.referrer_id))
    .maybeSingle();
  const bonus = Number((cleaner as { bonus_payout_zar?: number } | null)?.bonus_payout_zar ?? 0);
  await params.admin
    .from("cleaners")
    .update({ bonus_payout_zar: Math.max(0, bonus) + 100 })
    .eq("id", String(pending.referrer_id));
}
