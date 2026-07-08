import type { SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { getDefaultFromAddress } from "@/lib/email/sendBookingEmail";
import { getPublicAppUrlBase } from "@/lib/email/appUrl";
import { isCustomerOutboundPaused } from "@/lib/notifications/customerOutboundPause";
import { reportOperationalIssue } from "@/lib/logging/systemLog";
import { getReferralProgramSettings } from "@/lib/referrals/settings";
import { getCreditSummary } from "@/lib/referrals/credits";
import { getOrCreateCustomerReferralCode } from "@/lib/referrals/server";

const REFERRAL_CAMPAIGN_ID = "a0000000-0000-4000-8000-000000000001";

export type EmailCampaignPlaceholderContext = {
  firstName: string;
  referralLink: string;
  rewardAmount: string;
  availableCredit: string;
  companyName: string;
};

export function applyEmailPlaceholders(
  template: string,
  ctx: EmailCampaignPlaceholderContext,
): string {
  return template
    .replace(/\{\{first_name\}\}/gi, ctx.firstName)
    .replace(/\{\{referral_link\}\}/gi, ctx.referralLink)
    .replace(/\{\{reward_amount\}\}/gi, ctx.rewardAmount)
    .replace(/\{\{available_credit\}\}/gi, ctx.availableCredit)
    .replace(/\{\{company_name\}\}/gi, ctx.companyName);
}

function brandShell(inner: string): string {
  return `
<div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 20px; color: #1f2937;">
  <h2 style="margin-bottom: 8px;">Shalean<span style="color:#2563eb;">.</span></h2>
  ${inner}
  <p style="margin-top: 20px; font-size: 12px; color: #9ca3af;">Shalean Cleaning Services. Rewards are Cleaning Credit only, not cash.</p>
</div>`;
}

export async function loadReferralEmailCampaign(admin: SupabaseClient) {
  const { data } = await admin
    .from("email_campaigns")
    .select("*")
    .eq("id", REFERRAL_CAMPAIGN_ID)
    .maybeSingle();
  return data;
}

export async function sendReferralCampaignEmail(params: {
  admin: SupabaseClient;
  userId: string;
  email: string;
  firstName?: string | null;
  campaignId?: string;
  isTest?: boolean;
}): Promise<{ sent: boolean; error?: string; sendId?: string }> {
  const { paused } = await isCustomerOutboundPaused();
  if (paused && !params.isTest) return { sent: false, error: "customer_outbound_paused" };

  const campaignId = params.campaignId ?? REFERRAL_CAMPAIGN_ID;
  const campaign = await loadReferralEmailCampaign(params.admin);
  if (!campaign && !params.isTest) return { sent: false, error: "Campaign not found." };
  if (campaign && !(campaign as { enabled?: boolean }).enabled && !params.isTest) {
    return { sent: false, error: "Campaign disabled." };
  }

  const settings = await getReferralProgramSettings(params.admin);
  if (!settings.enabled && !params.isTest) return { sent: false, error: "Referral program disabled." };

  const code = await getOrCreateCustomerReferralCode(params.admin, params.userId);
  const base = getPublicAppUrlBase();
  const referralLink = `${base}/refer?ref=${encodeURIComponent(code)}`;
  const credit = await getCreditSummary(params.admin, params.userId);

  const ctx: EmailCampaignPlaceholderContext = {
    firstName: params.firstName?.trim() || "there",
    referralLink,
    rewardAmount: String(Math.round(settings.rewardAmountZar)),
    availableCredit: String(Math.round(credit.balance)),
    companyName: "Shalean Cleaning Services",
  };

  const subject = applyEmailPlaceholders(
    String((campaign as { subject_template?: string } | null)?.subject_template ?? "Refer a friend & earn Cleaning Credit!"),
    ctx,
  );
  const bodyInner = applyEmailPlaceholders(
    String(
      (campaign as { body_html_template?: string } | null)?.body_html_template ??
        "<p>Hi {{first_name}}, refer a friend and earn R{{reward_amount}} Cleaning Credit!</p>",
    ),
    ctx,
  );
  const html = brandShell(bodyInner);

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return { sent: false, error: "Email not configured." };
  const resend = new Resend(resendKey);

  if (!params.isTest) {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const { data: existingSend } = await params.admin
      .from("email_campaign_sends")
      .select("id")
      .eq("campaign_id", campaignId)
      .eq("recipient_email", params.email)
      .gte("created_at", monthStart.toISOString())
      .in("status", ["pending", "sent"])
      .limit(1)
      .maybeSingle();
    if (existingSend) return { sent: false, error: "Already sent this month." };
  }

  const { data: sendRow, error: insertErr } = await params.admin
    .from("email_campaign_sends")
    .insert({
      campaign_id: campaignId,
      user_id: params.userId,
      recipient_email: params.email,
      status: "pending",
      metadata: { is_test: params.isTest ?? false },
    })
    .select("id")
    .single();

  if (insertErr) {
    if (insertErr.code === "23505" && !params.isTest) {
      return { sent: false, error: "Already sent this month." };
    }
    return { sent: false, error: insertErr.message };
  }

  try {
    const { error } = await resend.emails.send({
      from: getDefaultFromAddress(),
      to: params.email,
      subject,
      html,
    });
    if (error) {
      await params.admin
        .from("email_campaign_sends")
        .update({ status: "failed", error_message: error.message })
        .eq("id", sendRow!.id);
      return { sent: false, error: error.message };
    }
    await params.admin
      .from("email_campaign_sends")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", sendRow!.id);
    return { sent: true, sendId: sendRow!.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await params.admin
      .from("email_campaign_sends")
      .update({ status: "failed", error_message: msg })
      .eq("id", sendRow!.id);
    await reportOperationalIssue("error", "referralCampaignEmail", msg, { userId: params.userId });
    return { sent: false, error: msg };
  }
}

export async function processMonthlyReferralCampaign(
  admin: SupabaseClient,
): Promise<{ sent: number; skipped: number; failed: number }> {
  const campaign = await loadReferralEmailCampaign(admin);
  if (!campaign || !(campaign as { enabled?: boolean }).enabled) {
    return { sent: 0, skipped: 0, failed: 0 };
  }

  const settings = await getReferralProgramSettings(admin);
  if (!settings.enabled) return { sent: 0, skipped: 0, failed: 0 };

  const { data: customers } = await admin
    .from("user_profiles")
    .select("id, full_name, billing_email, marketing_emails_unsubscribed_at, credit_balance_zar")
    .not("id", "is", null);

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of customers ?? []) {
    const r = row as {
      id: string;
      billing_email?: string | null;
      full_name?: string | null;
      marketing_emails_unsubscribed_at?: string | null;
    };

    let email = String(r.billing_email ?? "").trim();
    if (!email) {
      const { data: authUser } = await admin.auth.admin.getUserById(r.id);
      email = String(authUser?.user?.email ?? "").trim();
    }
    if (!email) { skipped++; continue; }
    if (r.marketing_emails_unsubscribed_at) { skipped++; continue; }

    const result = await sendReferralCampaignEmail({
      admin,
      userId: r.id,
      email,
      firstName: r.full_name?.split(/\s+/)[0] ?? null,
    });
    if (result.sent) sent++;
    else if (result.error === "Already sent this month.") skipped++;
    else failed++;
  }

  return { sent, skipped, failed };
}

export { REFERRAL_CAMPAIGN_ID };
