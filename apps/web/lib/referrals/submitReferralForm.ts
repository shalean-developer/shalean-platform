import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import { normalizeSouthAfricaPhone } from "@/lib/utils/phone";
import { getReferralProgramSettings } from "@/lib/referrals/settings";
import { findUserIdByEmail } from "@/lib/referrals/credits";
import { createPendingCustomerReferral } from "@/lib/referrals/server";

export const referralFormSchema = z.object({
  referrerName: z.string().min(2, "Please enter your name.").max(120),
  referrerPhone: z.string().min(9, "Please enter a valid phone number.").max(20),
  referrerEmail: z.string().email("Please enter a valid email address."),
  friendName: z.string().min(2, "Please enter your friend's name.").max(120),
  friendPhone: z.string().min(9, "Please enter a valid phone number.").max(20),
  friendEmail: z.string().email("Please enter a valid email.").optional().or(z.literal("")),
  message: z.string().max(500).optional(),
});

export type ReferralFormInput = z.infer<typeof referralFormSchema>;

export async function submitReferralForm(
  admin: SupabaseClient,
  input: ReferralFormInput,
): Promise<
  | { ok: true; submissionId: string }
  | { ok: false; error: string; field?: string }
> {
  const settings = await getReferralProgramSettings(admin);
  if (!settings.enabled) {
    return { ok: false, error: "The referral program is currently unavailable." };
  }

  const referrerEmail = normalizeEmail(input.referrerEmail);
  const friendEmail = input.friendEmail ? normalizeEmail(input.friendEmail) : null;
  const referrerPhone = normalizeSouthAfricaPhone(input.referrerPhone) ?? input.referrerPhone.trim();
  const friendPhone = normalizeSouthAfricaPhone(input.friendPhone) ?? input.friendPhone.trim();

  if (referrerEmail === friendEmail && friendEmail) {
    return { ok: false, error: "You cannot refer yourself.", field: "friendEmail" };
  }

  const referrerUserId = await findUserIdByEmail(admin, referrerEmail);

  const { data: submission, error: subErr } = await admin
    .from("referral_submissions")
    .insert({
      referrer_name: input.referrerName.trim(),
      referrer_phone: referrerPhone,
      referrer_email: referrerEmail,
      friend_name: input.friendName.trim(),
      friend_phone: friendPhone,
      friend_email: friendEmail,
      message: input.message?.trim() || null,
      status: "pending",
      referrer_user_id: referrerUserId,
    })
    .select("id")
    .single();

  if (subErr || !submission?.id) {
    return { ok: false, error: subErr?.message ?? "Could not save your referral." };
  }

  // If referrer is a known customer, create a pending referral row for tracking
  if (referrerUserId) {
    const { data: profile } = await admin
      .from("user_profiles")
      .select("referral_code")
      .eq("id", referrerUserId)
      .maybeSingle();
    const refCode = String((profile as { referral_code?: string } | null)?.referral_code ?? "");
    if (refCode && friendEmail) {
      await createPendingCustomerReferral({
        admin,
        refCode,
        referredUserId: null,
        referredEmail: friendEmail,
      });

      const { data: referral } = await admin
        .from("referrals")
        .select("id")
        .eq("referrer_type", "customer")
        .eq("referrer_id", referrerUserId)
        .eq("referred_email_or_phone", friendEmail)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (referral?.id) {
        await admin
          .from("referral_submissions")
          .update({ referral_id: referral.id })
          .eq("id", submission.id);
        await admin
          .from("referrals")
          .update({
            submission_id: submission.id,
            reward_amount: settings.rewardAmountZar,
          })
          .eq("id", referral.id);
      }
    }
  }

  return { ok: true, submissionId: submission.id };
}
