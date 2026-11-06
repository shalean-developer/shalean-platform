import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { recordCustomerMarketingDecision } from "@/lib/email/marketingConsentService";
import { verifyMarketingUnsubscribeToken } from "@/lib/email/marketingUnsubscribeToken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
const maxRequestBytes = 4096;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const verified = verifyMarketingUnsubscribeToken(token, process.env.MARKETING_UNSUBSCRIBE_SECRET);
  if (!verified) {
    return NextResponse.json({ error: "Invalid or expired unsubscribe link." }, { status: 400, headers });
  }
  if (verified.version === 1) return new Response(
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Email preferences</title></head><body><main><h1>Update your email preferences</h1><p>This older link needs account confirmation.</p><a href="/account/profile">Sign in to manage marketing emails</a></main></body></html>',
    { status: 200, headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } },
  );
  // GET never changes preferences; email security crawlers commonly prefetch links.
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Unsubscribe from Shalean emails</title></head><body><main><h1>Unsubscribe from marketing emails</h1><p>Confirm that you no longer want Shalean promotional emails. Your booking and account notices will continue.</p><form method="post"><input type="hidden" name="token" value="${token}"><button type="submit">Unsubscribe</button></form></main></body></html>`, {
    status: 200, headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > maxRequestBytes)
    return NextResponse.json({ error: "Request too large." }, { status: 413, headers });
  const url = new URL(request.url);
  let token = url.searchParams.get("token") ?? "";
  if (!token) {
    const type = request.headers.get("content-type") ?? "";
    if (type.startsWith("application/x-www-form-urlencoded")) {
      const form = await request.formData().catch(() => null);
      token = String(form?.get("token") ?? "");
    } else if (type.startsWith("application/json")) {
      const body = await request.json().catch(() => null) as { token?: unknown } | null;
      token = typeof body?.token === "string" ? body.token : "";
    }
  }
  const verified = verifyMarketingUnsubscribeToken(token, process.env.MARKETING_UNSUBSCRIBE_SECRET);
  if (!verified) return NextResponse.json({ error: "Invalid or expired unsubscribe link." }, { status: 400, headers });
  if (verified.version === 1) return NextResponse.json({ error: "Sign in to manage email preferences.", preferencesUrl: "/account/profile" }, { status: 409, headers });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Temporarily unavailable." }, { status: 503, headers });
  // The recipient is resolved from verified token identity, never caller-supplied email.
  const { data: profile, error } = await admin.from("user_profiles")
    .select("billing_email, role").eq("id", verified.customerId).maybeSingle();
  if (error || profile?.role !== "customer" || !profile.billing_email)
    return NextResponse.json({ error: "Account verification unavailable." }, { status: 503, headers });
  const result = await recordCustomerMarketingDecision(admin, {
    customerId: verified.customerId,
    authenticatedEmail: profile.billing_email,
    decision: "withdrawn",
    explicitOptIn: false,
    evidenceReference: createHash("sha256").update(token).digest("hex"),
    source: "signed_one_click",
    tokenGeneration: verified.generation!,
  });
  if (!result.ok && ["unsubscribe_token_superseded", "unsubscribe_legacy_confirmation_required"].includes(result.reason))
    return NextResponse.json({ error: "This link predates a preference change. Sign in to manage email preferences.", preferencesUrl: "/account/profile" }, { status: 409, headers });
  if (!result.ok) return NextResponse.json({ error: "Preference update unavailable." }, { status: 503, headers });
  return NextResponse.json({ ok: true, unsubscribed: true }, { status: 200, headers });
}
