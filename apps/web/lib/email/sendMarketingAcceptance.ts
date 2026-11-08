import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { marketingAcceptanceRecipients, marketingAcceptanceSendEnabled } from "./marketingAcceptanceConfig";
import { checkMarketingSendGate } from "./marketingSendGate";
import { createMarketingUnsubscribeUrl, validGeneration } from "./marketingUnsubscribeToken";
import { getDefaultFromAddress, getResend } from "./resendFrom";
import { assertNotSeedEmail, isSeedEmail } from "@/lib/seed/devSeedGuard";

import { ACCEPTANCE_SUBJECT } from "./marketingAcceptanceCopy";
export { ACCEPTANCE_SUBJECT } from "./marketingAcceptanceCopy";
const ORIGIN = "https://pricing-test.shalean.co.za";
type Result = { status: number; outcome: string; error?: string };

/** Stable PK wins before the network call; concurrent requests can never both send. */
export function acceptanceMessageId(customerId: string, generation: number): string {
  const bytes = createHash("sha256").update(`shalean-staging-email-acceptance-v1:${customerId}:${generation}`).digest();
  bytes[6] = (bytes[6]! & 15) | 64;
  bytes[8] = (bytes[8]! & 63) | 128;
  const h = bytes.subarray(0, 16).toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Exactly one test per configured customer/consent generation. No provider contact writes,
 * automatic retries, arbitrary payloads, or change to ordinary staging sending policy. */
export async function sendMarketingAcceptance(admin: SupabaseClient, email: string): Promise<Result> {
  if (!marketingAcceptanceSendEnabled() || !marketingAcceptanceRecipients().includes(email))
    return { status: 403, outcome: "blocked", error: "Restricted test delivery is not enabled." };
  try { assertNotSeedEmail(email, "Owner inbox acceptance"); }
  catch { return { status: 403, outcome: "blocked", error: "Seed addresses cannot receive delivery tests." }; }
  // Staging bundles run with NODE_ENV=production, where the common guard is a no-op.
  if (isSeedEmail(email)) return { status: 403, outcome: "blocked", error: "Seed addresses cannot receive delivery tests." };
  const { data: profile, error } = await admin.from("user_profiles")
    .select("id,role,billing_email,marketing_consent_generation")
    .eq("billing_email", email).maybeSingle();
  if (error) return { status: 503, outcome: "blocked", error: "Customer status unavailable." };
  if (profile?.role !== "customer" || !validGeneration(profile.marketing_consent_generation))
    return { status: 409, outcome: "blocked", error: "A verified customer account is required." };
  const identity = await admin.auth.admin.getUserById(profile.id);
  if (identity.error || identity.data.user?.email?.toLowerCase() !== email || !identity.data.user.email_confirmed_at)
    return { status: 409, outcome: "blocked", error: "Confirm this customer email before testing." };
  const eligibility = await checkMarketingSendGate(admin, profile.id, email);
  if (!eligibility.allowed) return { status: 409, outcome: "blocked", error: `Delivery blocked: ${eligibility.reason}. Provider enrollment, if missing, must be reviewed separately.` };
  const url = createMarketingUnsubscribeUrl(ORIGIN, profile.id, process.env.MARKETING_UNSUBSCRIBE_SECRET, profile.marketing_consent_generation);
  const resend = getResend();
  const from = getDefaultFromAddress();
  if (!url || !resend || !/(@shalean\.co\.za>|@shalean\.co\.za)$/i.test(from))
    return { status: 503, outcome: "blocked", error: "Verified sender or signed unsubscribe configuration unavailable." };
  const id = acceptanceMessageId(profile.id, profile.marketing_consent_generation);
  const headers = { "List-Unsubscribe": `<${url}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
  const tags = [{ name: "shalean_environment", value: "staging" }, { name: "message_type", value: "marketing_acceptance_test" }];
  const text = `Shalean Cleaning Services\n\nThis is the staging email test you requested. No booking or payment has been created.\n\nCheck the sender and this message on your phone. Use the link below to test unsubscribing, then explicitly subscribe again in your customer preferences.\n\nUnsubscribe: ${url}\nManage email preferences: ${ORIGIN}/account/profile\n\nBooking, payment and security notices continue separately.`;
  const safeUrl = url.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Shalean email delivery test</title></head><body style="font-family:Arial,sans-serif;color:#00164e;margin:0;padding:24px;background:#f5f7fb"><main style="max-width:560px;margin:auto;padding:24px;background:#fff;border:1px solid #dfe7f4;border-radius:12px"><p style="color:#fff;background:#00164e;padding:20px;border-radius:8px;font-weight:bold">Shalean Cleaning Services</p><h1 style="font-size:28px;letter-spacing:-.03em">Your email delivery test</h1><p>This is the staging test you requested. No booking or payment has been created.</p><p>Check the sender and this message on your phone. Test unsubscribing below, then explicitly subscribe again in your customer preferences.</p><p><a style="color:#0051ff" href="${safeUrl}">Unsubscribe from promotional emails</a></p><p><a style="display:inline-block;background:#0051ff;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none" href="${ORIGIN}/account/profile">Manage email preferences</a></p><p style="font-size:13px">Booking, payment and security notices continue separately.</p></main></body></html>`;
  const reservation = await admin.from("email_outbound_messages").insert({
    id, recipient_email: email, customer_id: profile.id, sender_email: from,
    subject: ACCEPTANCE_SUBJECT, html_body: html, text_body: text, headers, tags,
    message_type: "marketing_acceptance_test", delivery_status: "sending", retry_status: "blocked",
  });
  if (reservation.error?.code === "23505")
    return { status: 200, outcome: "already_requested" };
  if (reservation.error) return { status: 503, outcome: "blocked", error: "Could not reserve the delivery record. Nothing sent." };
  // Re-check after winning the reservation, before crossing the provider boundary.
  const current = await checkMarketingSendGate(admin, profile.id, email);
  const fresh = await admin.from("user_profiles").select("marketing_consent_generation").eq("id", profile.id).maybeSingle();
  if (!marketingAcceptanceSendEnabled() || fresh.error || fresh.data?.marketing_consent_generation !== profile.marketing_consent_generation || !current.allowed) {
    await admin.from("email_outbound_messages").update({ delivery_status: "cancelled", failure_reason: "Consent or test configuration changed before submission." }).eq("id", id);
    return { status: 409, outcome: "blocked", error: "Consent or test configuration changed. Nothing sent." };
  }
  try {
    const sent = await resend.emails.send({ from, to: email, subject: ACCEPTANCE_SUBJECT, html, text, headers, tags }, { idempotencyKey: `staging-acceptance/${id}` });
    if (sent.error || !sent.data?.id) {
      await admin.from("email_outbound_messages").update({ delivery_status: "send_failed", failure_reason: "Provider submission failed; manual review required." }).eq("id", id);
      return { status: 502, outcome: "review_required", error: "Provider submission failed. Review delivery records before another attempt." };
    }
    const tracked = await admin.from("email_outbound_messages").update({ resend_email_id: sent.data.id, delivery_status: "sent" }).eq("id", id);
    // A provider-accepted send must never become a retryable failure.
    return tracked.error ? { status: 202, outcome: "accepted_tracking_review" } : { status: 202, outcome: "accepted" };
  } catch {
    await admin.from("email_outbound_messages").update({ delivery_status: "submission_unknown", failure_reason: "Provider outcome unknown; no automatic retry." }).eq("id", id);
    return { status: 202, outcome: "submission_unknown" };
  }
}
