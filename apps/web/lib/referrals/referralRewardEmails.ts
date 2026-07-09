import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { sendCustomerEmailWithDbTemplateFallback } from "@/lib/email/customerEmailFromTemplate";
import { getPublicAppUrlBase } from "@/lib/email/appUrl";
import { readCustomerProfileContact, resolveCustomerOutboundEmail } from "@/lib/customer/readCustomerProfileContact";
import { isCustomerOutboundPaused } from "@/lib/notifications/customerOutboundPause";
import { tryClaimNotificationIdempotency } from "@/lib/notifications/notificationIdempotencyClaim";
import { reportOperationalIssue } from "@/lib/logging/systemLog";
import { getCreditSummary } from "@/lib/referrals/credits";
import { getOrCreateCustomerReferralCode } from "@/lib/referrals/server";
import { getReferralProgramSettings } from "@/lib/referrals/settings";
import { applyEmailPlaceholders, type EmailCampaignPlaceholderContext } from "@/lib/referrals/referralCampaignEmail";

const REMINDER_DAYS = 7;

function brandShell(inner: string): string {
  return `
<div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 20px; color: #1f2937;">
  <h2 style="margin-bottom: 8px;">Shalean<span style="color:#2563eb;">.</span></h2>
  ${inner}
  <p style="margin-top: 20px; font-size: 12px; color: #9ca3af;">Shalean Cleaning Services. Rewards are Cleaning Credit only, not cash.</p>
</div>`;
}

function formatZar(amount: number): string {
  return `R ${Math.max(0, Math.round(amount)).toLocaleString("en-ZA")}`;
}

function formatExpiryDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" });
}

async function buildReferralEmailContext(
  admin: SupabaseClient,
  userId: string,
): Promise<EmailCampaignPlaceholderContext & { referralLink: string }> {
  const [contact, settings, code, credit] = await Promise.all([
    readCustomerProfileContact(admin, userId),
    getReferralProgramSettings(admin),
    getOrCreateCustomerReferralCode(admin, userId),
    getCreditSummary(admin, userId),
  ]);
  const firstName = contact.fullName?.split(/\s+/)[0] ?? "there";
  const base = getPublicAppUrlBase();
  const referralLink = `${base}/refer?ref=${encodeURIComponent(code)}`;
  return {
    firstName,
    referralLink,
    rewardAmount: String(Math.round(settings.rewardAmountZar)),
    availableCredit: String(Math.round(credit.balance)),
    companyName: "Shalean Cleaning Services",
  };
}

/** Sends reward-earned email to referrer after cleaning credit is issued. */
export async function sendReferralRewardEarnedEmail(params: {
  admin: SupabaseClient;
  referrerId: string;
  referralId: string;
  rewardZar: number;
  referredContact?: string | null;
}): Promise<{ sent: boolean; error?: string }> {
  const { paused } = await isCustomerOutboundPaused();
  if (paused) return { sent: false, error: "customer_outbound_paused" };

  const claimed = await tryClaimNotificationIdempotency(params.admin, {
    reference: `reward_earned:v1:${params.referralId}`,
    eventType: "referral_reward_earned",
    channel: "email",
  });
  if (!claimed) return { sent: false, error: "already_sent" };

  const email = await resolveCustomerOutboundEmail(params.admin, params.referrerId);
  if (!email) {
    await reportOperationalIssue("warn", "referrals/rewardEarnedEmail", "No outbound email for referrer", {
      referrerId: params.referrerId,
      referralId: params.referralId,
    });
    return { sent: false, error: "no_email" };
  }

  const ctx = await buildReferralEmailContext(params.admin, params.referrerId);
  const friendLabel = params.referredContact?.trim() || "your friend";
  const rewardLabel = formatZar(params.rewardZar);

  return sendCustomerEmailWithDbTemplateFallback({
    to: email,
    templateKey: "referral_reward_earned",
    data: {
      ...ctx,
      reward_zar: params.rewardZar,
      reward_amount_formatted: rewardLabel,
      referred_contact: friendLabel,
    },
    logEventType: "referral_reward_earned",
    buildLegacy: () => ({
      subject: `You earned ${rewardLabel} Cleaning Credit!`,
      html: brandShell(`
        <p>Hi ${ctx.firstName},</p>
        <p>Great news — ${friendLabel} completed their first Shalean booking through your referral.</p>
        <p style="font-size: 18px; font-weight: 600; color: #059669;">${rewardLabel} Cleaning Credit</p>
        <p>has been added to your account. Your available balance is now ${formatZar(Number(ctx.availableCredit))}.</p>
        <p><a href="${ctx.referralLink}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Refer another friend</a></p>
        <p style="margin-top:16px;font-size:14px;color:#6b7280;">Use Cleaning Credit at checkout on your next booking.</p>
      `),
    }),
    legacyPayload: { referralId: params.referralId, rewardZar: params.rewardZar },
  });
}

/** Sends expiry reminder before referral cleaning credit expires. */
export async function sendReferralCreditExpiringEmail(params: {
  admin: SupabaseClient;
  referrerId: string;
  referralId: string;
  expiresAt: string;
  amountZar: number;
}): Promise<{ sent: boolean; error?: string }> {
  const { paused } = await isCustomerOutboundPaused();
  if (paused) return { sent: false, error: "customer_outbound_paused" };

  const claimed = await tryClaimNotificationIdempotency(params.admin, {
    reference: `reward_expiring:v1:${params.referralId}`,
    eventType: "referral_credit_expiring",
    channel: "email",
  });
  if (!claimed) return { sent: false, error: "already_sent" };

  const email = await resolveCustomerOutboundEmail(params.admin, params.referrerId);
  if (!email) return { sent: false, error: "no_email" };

  const ctx = await buildReferralEmailContext(params.admin, params.referrerId);
  const expiryLabel = formatExpiryDate(params.expiresAt);
  const amountLabel = formatZar(params.amountZar);
  const accountUrl = `${getPublicAppUrlBase()}/account/referrals`;

  return sendCustomerEmailWithDbTemplateFallback({
    to: email,
    templateKey: "referral_credit_expiring",
    data: {
      ...ctx,
      credit_expires_at: params.expiresAt,
      expiry_date_formatted: expiryLabel,
      expiring_amount_zar: params.amountZar,
      expiring_amount_formatted: amountLabel,
      account_url: accountUrl,
    },
    logEventType: "referral_credit_expiring",
    buildLegacy: () => ({
      subject: `Your Cleaning Credit expires on ${expiryLabel}`,
      html: brandShell(`
        <p>Hi ${ctx.firstName},</p>
        <p>Some of your referral Cleaning Credit is expiring soon.</p>
        <p style="font-size: 18px; font-weight: 600; color: #d97706;">${amountLabel}</p>
        <p>expires on <strong>${expiryLabel}</strong>. Your current balance is ${formatZar(Number(ctx.availableCredit))}.</p>
        <p><a href="${accountUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Book a clean & use credit</a></p>
        <p style="margin-top:16px;font-size:14px;color:#6b7280;">Apply Cleaning Credit at checkout before it expires.</p>
      `),
    }),
    legacyPayload: { referralId: params.referralId, expiresAt: params.expiresAt },
  });
}

/** Cron helper — email referrers whose rewarded credit expires within REMINDER_DAYS. */
export async function processReferralCreditExpiryReminders(
  admin: SupabaseClient,
): Promise<{ sent: number; skipped: number; errors: number }> {
  const now = new Date();
  const horizon = new Date(now.getTime() + REMINDER_DAYS * 24 * 60 * 60 * 1000);

  const { data: rows, error } = await admin
    .from("referrals")
    .select("id, referrer_id, reward_amount, credit_expires_at")
    .eq("referrer_type", "customer")
    .eq("status", "rewarded")
    .not("credit_expires_at", "is", null)
    .gt("credit_expires_at", now.toISOString())
    .lte("credit_expires_at", horizon.toISOString())
    .limit(200);

  if (error) {
    await reportOperationalIssue("error", "referrals/expiryReminders", error.message, {});
    return { sent: 0, skipped: 0, errors: 1 };
  }

  let sent = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of rows ?? []) {
    const referralId = String((row as { id: string }).id);
    const referrerId = String((row as { referrer_id: string }).referrer_id);
    const expiresAt = String((row as { credit_expires_at: string }).credit_expires_at);
    const amountZar = Math.max(0, Math.round(Number((row as { reward_amount?: number }).reward_amount ?? 0)));
    if (amountZar <= 0) {
      skipped += 1;
      continue;
    }

    const credit = await getCreditSummary(admin, referrerId);
    if (credit.balance <= 0) {
      skipped += 1;
      continue;
    }

    const result = await sendReferralCreditExpiringEmail({
      admin,
      referrerId,
      referralId,
      expiresAt,
      amountZar,
    });
    if (result.sent) sent += 1;
    else if (result.error === "already_sent") skipped += 1;
    else errors += 1;
  }

  return { sent, skipped, errors };
}

// Re-export for template placeholder reuse in admin campaign editor
export { applyEmailPlaceholders };
