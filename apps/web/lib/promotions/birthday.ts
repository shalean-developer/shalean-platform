import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { creditCleaningCredit } from "@/lib/referrals/credits";
import { mapPromotionRow } from "./evaluate";
import type { PromotionRow } from "./types";

type Admin = SupabaseClient;

const BIRTHDAY_PROMO_SLUG = "birthday-credit";

function monthDay(d: Date): { month: number; day: number } {
  return { month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** Find customers whose birthday is today (UTC date match on month/day). */
export async function findBirthdayCustomersToday(
  admin: Admin,
  now = new Date(),
): Promise<{ userId: string; email: string | null; fullName: string | null; dateOfBirth: string }[]> {
  const { month, day } = monthDay(now);
  // Fetch profiles with DOB; filter in JS for month/day (portable across PG versions)
  const { data, error } = await admin
    .from("user_profiles")
    .select("id, full_name, date_of_birth")
    .not("date_of_birth", "is", null);
  if (error) throw new Error(error.message);

  const matches = (data ?? []).filter((row) => {
    const dob = String(row.date_of_birth ?? "");
    if (!dob) return false;
    const d = new Date(dob + (dob.includes("T") ? "" : "T00:00:00Z"));
    if (Number.isNaN(d.getTime())) return false;
    return d.getUTCMonth() + 1 === month && d.getUTCDate() === day;
  });

  const results: { userId: string; email: string | null; fullName: string | null; dateOfBirth: string }[] = [];
  for (const row of matches) {
    const { data: user } = await admin.auth.admin.getUserById(String(row.id));
    results.push({
      userId: String(row.id),
      email: user?.user?.email ?? null,
      fullName: (row.full_name as string | null) ?? null,
      dateOfBirth: String(row.date_of_birth),
    });
  }
  return results;
}

export async function getBirthdayPromotion(admin: Admin): Promise<PromotionRow | null> {
  const { data } = await admin
    .from("promotions")
    .select("*")
    .eq("slug", BIRTHDAY_PROMO_SLUG)
    .eq("status", "active")
    .maybeSingle();
  return data ? mapPromotionRow(data as Record<string, unknown>) : null;
}

export async function issueBirthdayReward(
  admin: Admin,
  args: { userId: string; email?: string | null; fullName?: string | null },
): Promise<{ issued: boolean; reason?: string; rewardId?: string; creditZar?: number }> {
  const promo = await getBirthdayPromotion(admin);
  if (!promo) return { issued: false, reason: "Birthday promotion is not active." };

  const year = new Date().getUTCFullYear();
  const { data: existing } = await admin
    .from("birthday_rewards")
    .select("id, status")
    .eq("user_id", args.userId)
    .eq("reward_year", year)
    .maybeSingle();
  if (existing) return { issued: false, reason: "Birthday reward already issued this year." };

  const validityDays = Number(promo.display_config?.validity_days ?? 30);
  const creditZar = Math.round(Number(promo.discount_value) || 200);
  const expiresAt = new Date();
  expiresAt.setUTCDate(expiresAt.getUTCDate() + validityDays);

  const creditResult = await creditCleaningCredit({
    admin,
    userId: args.userId,
    amountZar: creditZar,
    note: `Birthday Cleaning Credit ${year}`,
    createdBy: "system:birthday",
  });
  if (!creditResult.ok) {
    return { issued: false, reason: creditResult.error };
  }

  const { data: reward, error } = await admin
    .from("birthday_rewards")
    .insert({
      user_id: args.userId,
      promotion_id: promo.id,
      reward_year: year,
      credit_zar: creditZar,
      expires_at: expiresAt.toISOString(),
      status: "issued",
    })
    .select("id")
    .single();

  if (error) {
    return { issued: false, reason: error.message };
  }

  await admin.from("promotion_events").insert({
    promotion_id: promo.id,
    event_type: "credit_issued",
    user_id: args.userId,
    metadata: { creditZar, rewardYear: year, rewardId: reward.id },
  });

  return { issued: true, rewardId: reward.id, creditZar };
}

export async function runBirthdayRewardsCron(admin: Admin): Promise<{
  scanned: number;
  issued: number;
  skipped: number;
  errors: string[];
}> {
  const customers = await findBirthdayCustomersToday(admin);
  let issued = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const c of customers) {
    try {
      const result = await issueBirthdayReward(admin, c);
      if (result.issued) issued += 1;
      else skipped += 1;
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  // Expire past-due birthday rewards
  const now = new Date().toISOString();
  await admin
    .from("birthday_rewards")
    .update({ status: "expired" })
    .eq("status", "issued")
    .lt("expires_at", now);

  return { scanned: customers.length, issued, skipped, errors };
}

export async function getActiveBirthdayRewardForUser(
  admin: Admin,
  userId: string,
): Promise<{
  creditZar: number;
  expiresAt: string;
  daysLeft: number;
} | null> {
  const now = new Date();
  const { data } = await admin
    .from("birthday_rewards")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "issued")
    .gt("expires_at", now.toISOString())
    .order("expires_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const expiresAt = String(data.expires_at);
  const daysLeft = Math.max(
    0,
    Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
  );
  return { creditZar: Number(data.credit_zar), expiresAt, daysLeft };
}
