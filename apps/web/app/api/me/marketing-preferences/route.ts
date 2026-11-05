import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireCustomerSession } from "@/lib/auth/customerBearer";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { recordCustomerMarketingDecision } from "@/lib/email/marketingConsentService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const POLICY_VERSION = "marketing-email-2026-11-v1";

/**
 * Authenticated account preferences only. No browser cookie authentication is
 * accepted by requireCustomerSession, avoiding ambient-cookie CSRF here.
 * A separate signed one-click unsubscribe path is still required before launch.
 */
export async function POST(request: Request) {
  const auth = await requireCustomerSession(request);
  if (!auth.ok) return auth.response;
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json"))
    return NextResponse.json({ error: "JSON request required." }, { status: 415 });
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const obj = body as Record<string, unknown>;
  if ((obj.decision !== "granted" && obj.decision !== "withdrawn") ||
      (obj.decision === "granted" && (obj.explicitOptIn !== true || obj.policyVersion !== POLICY_VERSION)))
    return NextResponse.json({ error: "Explicit consent confirmation required." }, { status: 400 });
  const email = auth.session.email;
  if (!email) return NextResponse.json({ error: "Verified account email required." }, { status: 403 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Temporarily unavailable." }, { status: 503 });
  const result = await recordCustomerMarketingDecision(admin, {
    customerId: auth.session.userId,
    authenticatedEmail: email,
    decision: obj.decision,
    explicitOptIn: obj.explicitOptIn === true,
    evidenceReference: randomUUID(),
    source: "authenticated_preferences",
    apiKey: process.env.RESEND_API_KEY,
  });
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 409 });
  return NextResponse.json({
    ok: true,
    decision: obj.decision,
    providerSync: result.providerSync ?? "not_requested",
  }, { headers: { "Cache-Control": "no-store" } });
}

/** Authenticated, no-cache current marketing preference status. */
export async function GET(request: Request) {
  const auth = await requireCustomerSession(request);
  if (!auth.ok) return auth.response;
  if (!auth.session.email) return NextResponse.json({ error: "Verified email required." }, { status: 403 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Temporarily unavailable." }, { status: 503 });
  const email = auth.session.email.toLowerCase().trim();
  const [{ data: profile, error: profileError }, { data: consent, error: consentError }] = await Promise.all([
    admin.from("user_profiles").select("billing_email, role, marketing_emails_unsubscribed_at").eq("id", auth.session.userId).maybeSingle(),
    admin.from("marketing_email_consent_events").select("decision").eq("customer_id", auth.session.userId)
      .eq("email", email).eq("purpose", "promotional_email")
      .order("occurred_at", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (profileError || consentError) return NextResponse.json({ error: "Preferences unavailable." }, { status: 503 });
  if (profile?.role !== "customer" || profile.billing_email?.toLowerCase().trim() !== email)
    return NextResponse.json({ error: "Customer identity unverified." }, { status: 403 });
  const withdrawn = Boolean(profile.marketing_emails_unsubscribed_at) || consent?.decision === "withdrawn";
  return NextResponse.json({
    status: withdrawn ? "unsubscribed" : consent?.decision === "granted" ? "consent_recorded" : "no_consent",
    policyVersion: POLICY_VERSION,
  }, { headers: { "Cache-Control": "no-store" } });
}
