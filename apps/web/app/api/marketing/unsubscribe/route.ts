import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { recordCustomerMarketingDecision } from "@/lib/email/marketingConsentService";
import { verifyMarketingUnsubscribeToken } from "@/lib/email/marketingUnsubscribeToken";
import { readBoundedRequest } from "@/lib/email/readBoundedRequest";
import { unsubscribePage } from "@/lib/email/unsubscribeView";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
function result(request: Request, status: number, body: { error?: string; ok?: boolean; unsubscribed?: boolean; preferencesUrl?: string }) {
  if (request.headers.get("accept")?.includes("text/html")) {
    return new Response(unsubscribePage(body.ok ? "You are unsubscribed" : "Update your email preferences",
      body.ok ? "You will no longer receive Shalean promotional emails." : body.error!),
    { status, headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
  }
  return NextResponse.json(body, { status, headers });
}
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const verified = verifyMarketingUnsubscribeToken(token, process.env.MARKETING_UNSUBSCRIBE_SECRET);
  if (!verified) return result(request, 400, { error: "Invalid or expired unsubscribe link. Sign in to manage your email preferences." });
  const title = verified.version === 1 ? "Update your email preferences" : "Unsubscribe from marketing emails";
  const description = verified.version === 1
    ? "This older link needs account confirmation. Sign in to manage marketing emails."
    : "Confirm that you no longer want Shalean promotional emails. Opening this page does not change your preferences.";
  return new Response(unsubscribePage(title, description, verified.version === 2 ? token : undefined), {
    status: 200, headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
  });
}
export async function POST(request: Request) {
  const raw = await readBoundedRequest(request);
  if (raw === null) return result(request, 413, { error: "Request too large." });
  let token = new URL(request.url).searchParams.get("token") ?? "";
  if (!token) {
    const type = request.headers.get("content-type") ?? "";
    if (type.startsWith("application/x-www-form-urlencoded")) token = new URLSearchParams(raw).get("token") ?? "";
    else if (type.startsWith("application/json")) {
      try { const body: unknown = JSON.parse(raw); if (body && typeof body === "object" && "token" in body && typeof body.token === "string") token = body.token; }
      catch { /* Invalid JSON cannot produce a valid signed token. */ }
    }
  }
  const verified = verifyMarketingUnsubscribeToken(token, process.env.MARKETING_UNSUBSCRIBE_SECRET);
  if (!verified) return result(request, 400, { error: "Invalid or expired unsubscribe link." });
  if (verified.version === 1) return result(request, 409, { error: "Sign in to manage email preferences.", preferencesUrl: "/account/profile" });
  const admin = getSupabaseAdmin();
  if (!admin) return result(request, 503, { error: "Temporarily unavailable." });
  const { data: profile, error } = await admin.from("user_profiles")
    .select("billing_email, role").eq("id", verified.customerId).maybeSingle();
  if (error || profile?.role !== "customer" || !profile.billing_email)
    return result(request, 503, { error: "Account verification unavailable." });
  const decision = await recordCustomerMarketingDecision(admin, {
    customerId: verified.customerId, authenticatedEmail: profile.billing_email,
    decision: "withdrawn", explicitOptIn: false,
    evidenceReference: createHash("sha256").update(token).digest("hex"),
    source: "signed_one_click", tokenGeneration: verified.generation!,
  });
  if (!decision.ok && ["unsubscribe_token_superseded", "unsubscribe_legacy_confirmation_required"].includes(decision.reason))
    return result(request, 409, { error: "This link predates a preference change. Sign in to manage email preferences.", preferencesUrl: "/account/profile" });
  if (!decision.ok) return result(request, 503, { error: "Preference update unavailable." });
  return result(request, 200, { ok: true, unsubscribed: true });
}
