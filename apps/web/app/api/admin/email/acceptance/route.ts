import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { marketingAcceptanceHost, marketingAcceptanceRecipients, marketingAcceptanceSendEnabled } from "@/lib/email/marketingAcceptanceConfig";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
/** Owner-only setup read; never creates users, grants consent, syncs contacts or sends mail. */
export async function GET(request: Request) {
  const emails = marketingAcceptanceRecipients();
  if (!marketingAcceptanceHost(request) || emails.length !== 2) return json({ error: "Not found" }, 404);
  const auth = await requireAdminApi(request, ["system.settings"]);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const admin = getSupabaseAdmin();
  if (!admin) return json({ error: "Setup status unavailable" }, 503);
  const recipients = [];
  for (const email of emails) {
    const { data: profile, error } = await admin.from("user_profiles").select("id,role,billing_email,marketing_emails_unsubscribed_at")
      .eq("billing_email", email).maybeSingle();
    if (error) return json({ error: "Setup status unavailable" }, 503);
    if (!profile) { recipients.push({ email, status: "account_required" }); continue; }
    if (profile.role !== "customer") { recipients.push({ email, status: "customer_account_required" }); continue; }
    const { data: identity, error: identityError } = await admin.auth.admin.getUserById(profile.id);
    if (identityError) return json({ error: "Setup status unavailable" }, 503);
    if (identity.user?.email?.toLowerCase() !== email || !identity.user?.email_confirmed_at) { recipients.push({ email, status: "verification_required" }); continue; }
    const { data: event, error: eventError } = await admin.from("marketing_email_consent_events").select("decision")
      .eq("customer_id", profile.id).eq("email", email).eq("purpose", "promotional_email")
      .order("occurred_at", { ascending: false }).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle();
    if (eventError) return json({ error: "Setup status unavailable" }, 503);
    recipients.push({ email, status: event?.decision !== "granted" ? "consent_required" : profile.marketing_emails_unsubscribed_at ? "delivery_paused" : "consent_recorded" });
  }
  return json({ recipients, sendingEnabled: false, testSendEnabled: marketingAcceptanceSendEnabled(), webhookConfigured: Boolean(process.env.RESEND_STAGING_WEBHOOK_SECRET), providerWritesEnabled: false });
}
