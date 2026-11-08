import "server-only";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { recordCustomerMarketingDecision } from "@/lib/email/marketingConsentService";
import { requireCustomerSession } from "@/lib/auth/customerBearer";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createCustomerMarketingUnsubscribeUrl } from "@/lib/email/marketingUnsubscribeLink";
import { createMarketingUnsubscribeToken, validGeneration } from "@/lib/email/marketingUnsubscribeToken";
import { readBoundedRequest } from "@/lib/email/readBoundedRequest";
import { MARKETING_TEST_CUSTOMER, MARKETING_TEST_EMAIL, MARKETING_TEST_ORIGIN, marketingStagingEnabled } from "@/lib/email/marketingStagingFixture";

type Authority = "customer" | "office";
const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };
const json = (body: object, status = 200) => NextResponse.json(body, { status, headers });

async function fixture(request: Request, authority: Authority) {
  const expectedHost = new URL(MARKETING_TEST_ORIGIN).hostname;
  const host = request.headers.get("host")?.split(":")[0]?.toLowerCase() ?? new URL(request.url).hostname;
  const origin = request.headers.get("origin");
  if (!marketingStagingEnabled() || host !== expectedHost || (origin !== null && origin !== MARKETING_TEST_ORIGIN))
    return { response: json({ error: "Not found" }, 404) };
  let actorId: string;
  if (authority === "office") {
    // Existing permission gate verifies the bearer session AND Office email MFA.
    const auth = await requireAdminApi(request, ["system.settings"]);
    if (!auth.ok) return { response: json({ error: auth.error }, auth.status) };
    actorId = auth.userId;
  } else {
    const auth = await requireCustomerSession(request, { requireVerifiedEmail: true });
    if (!auth.ok) return { response: auth.response };
    if (auth.session.userId !== MARKETING_TEST_CUSTOMER || auth.session.email?.toLowerCase() !== MARKETING_TEST_EMAIL)
      return { response: json({ error: "This staging journey is restricted to the synthetic test account." }, 403) };
    actorId = auth.session.userId;
  }
  const admin = getSupabaseAdmin();
  if (!admin) return { response: json({ error: "Test account connection unavailable." }, 503) };
  const { data: profile, error } = await admin.from("user_profiles")
    .select("role,billing_email,marketing_consent_generation,marketing_emails_unsubscribed_at")
    .eq("id", MARKETING_TEST_CUSTOMER).maybeSingle();
  if (error || profile?.role !== "customer" || profile.billing_email !== MARKETING_TEST_EMAIL
    || !validGeneration(profile.marketing_consent_generation))
    return { response: json({ error: "Synthetic customer identity unavailable." }, 503) };
  return { admin, profile, actorId };
}
export async function getMarketingRehearsal(request: Request, authority: Authority) {
  const found = await fixture(request, authority);
  if (found.response) return found.response;
  const { admin, profile } = found;
  const [events, latest, reconciliation, enrollment] = await Promise.all([
    admin!.from("marketing_email_consent_events").select("id", { count: "exact", head: true }).eq("customer_id", MARKETING_TEST_CUSTOMER),
    admin!.from("marketing_email_consent_events").select("decision").eq("customer_id", MARKETING_TEST_CUSTOMER)
      .order("occurred_at", { ascending: false }).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle(),
    admin!.from("marketing_email_reconciliation_jobs").select("status,attempt_count,updated_at,lease_expires_at,claim_token")
      .eq("customer_id", MARKETING_TEST_CUSTOMER),
    admin!.from("marketing_email_enrollment_jobs").select("status,attempt_count,updated_at,lease_expires_at,claim_token")
      .eq("customer_id", MARKETING_TEST_CUSTOMER),
  ]);
  if ([events, latest, reconciliation, enrollment].some(item => item.error))
    return json({ error: "Synthetic journey state unavailable." }, 503);
  return json({ mode: "no-send", generation: profile!.marketing_consent_generation,
    evidenceCount: events.count, decision: latest.data?.decision ?? "none",
    unsubscribedAt: profile!.marketing_emails_unsubscribed_at,
    reconciliation: (reconciliation.data ?? []).map(({ claim_token, ...row }) => ({ ...row,
      claimFingerprint: claim_token ? createHash("sha256").update(claim_token).digest("hex").slice(0, 12) : null })),
    enrollment: (enrollment.data ?? []).map(({ claim_token, ...row }) => ({ ...row,
      claimFingerprint: claim_token ? createHash("sha256").update(claim_token).digest("hex").slice(0, 12) : null })),
    providerWritesDisabled: true, outboundDisabled: true });
}
export async function postMarketingRehearsal(request: Request, authority: Authority) {
  const found = await fixture(request, authority);
  if (found.response) return found.response;
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "JSON required." }, 415);
  const raw = await readBoundedRequest(request);
  if (raw === null) return json({ error: "Request too large." }, 413);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return json({ error: "Invalid request." }, 400); }
  if (!body || typeof body !== "object" || !("action" in body)) return json({ error: "Invalid request." }, 400);
  const { admin, profile } = found;
  if (body.action === "record_grant" || body.action === "record_withdrawal") {
    if (authority !== "office" || Object.keys(body).length !== 1)
      return json({ error: "Invalid fixture request." }, 400);
    const granted = body.action === "record_grant";
    const result = await recordCustomerMarketingDecision(admin!, {
      customerId: MARKETING_TEST_CUSTOMER, authenticatedEmail: MARKETING_TEST_EMAIL,
      decision: granted ? "granted" : "withdrawn", explicitOptIn: granted,
      source: "authenticated_preferences",
      evidenceReference: `staging-office:${found.actorId}:${randomUUID()}`,
    });
    return result.ok ? json({ ok: true }) : json({ error: "Synthetic preference update unavailable." }, 409);
  }
  if (body.action === "prepare_replay" || body.action === "prepare_partial") {
    if ((body.action === "prepare_partial" && Object.keys(body).length !== 1) ||
      (body.action === "prepare_replay" && Object.keys(body).length !== 2) ||
      Object.keys(body).some(key => !["action", "state"].includes(key)) ||
      (body.action === "prepare_replay" && (!("state" in body) || !["pending", "completed", "processing"].includes(String(body.state)))))
      return json({ error: "Invalid fixture request." }, 400);
    const { data: job, error: jobError } = await admin!.from("marketing_email_reconciliation_jobs")
      .select("id,status,last_error,claim_token").eq("customer_id", MARKETING_TEST_CUSTOMER)
      .eq("email", MARKETING_TEST_EMAIL).eq("action", "unsubscribe").maybeSingle();
    if (jobError || !job) return json({ error: "The synthetic withdrawal must be recorded first." }, 409);
    if (job.status === "processing" && job.last_error !== "staging_fixture_replay")
      return json({ error: "An existing processing claim must not be replaced." }, 409);
    if (body.action === "prepare_partial") {
      const { data: latest, error: latestError } = await admin!.from("marketing_email_consent_events")
        .select("decision").eq("customer_id", MARKETING_TEST_CUSTOMER).order("occurred_at", { ascending: false })
        .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle();
      if (latestError || latest?.decision !== "withdrawn" || job.status === "processing")
        return json({ error: "The fixture is not ready for projection recovery." }, 409);
      const { data: saved, error } = await admin!.from("user_profiles")
        .update({ marketing_emails_unsubscribed_at: null }).eq("id", MARKETING_TEST_CUSTOMER)
        .eq("marketing_consent_generation", profile!.marketing_consent_generation).select("id").maybeSingle();
      return error || !saved ? json({ error: "Fixture changed; retry from the start." }, 409) : json({ prepared: true });
    }
    const processing = "state" in body && body.state === "processing";
    let update = admin!.from("marketing_email_reconciliation_jobs").update({
      status: "state" in body ? body.state : "pending", last_error: processing ? "staging_fixture_replay" : null,
      claim_token: processing ? randomUUID() : null,
      lease_expires_at: processing ? new Date(Date.now() + 300000).toISOString() : null,
    }).eq("id", job.id).eq("status", job.status);
    update = job.claim_token ? update.eq("claim_token", job.claim_token) : update.is("claim_token", null);
    const { data: saved, error } = await update.select("id").maybeSingle();
    return error || !saved ? json({ error: "Fixture changed; retry from the start." }, 409) : json({ prepared: true });
  }
  if (body.action !== "issue_links" || Object.keys(body).length !== 1) return json({ error: "Invalid request." }, 400);
  const secret = process.env.MARKETING_UNSUBSCRIBE_SECRET;
  const url = await createCustomerMarketingUnsubscribeUrl(found.admin!, MARKETING_TEST_ORIGIN,
    MARKETING_TEST_CUSTOMER, MARKETING_TEST_EMAIL, secret);
  if (!url || !secret) return json({ error: "Signed test links are unavailable." }, 503);
  // A legacy fixture proves that already-issued v1 links cannot mutate consent.
  const encoded = Buffer.from(JSON.stringify({ uid: MARKETING_TEST_CUSTOMER, exp: Math.floor(Date.now()/1000)+3600, v: 1 })).toString("base64url");
  const legacy = new URL("/api/marketing/unsubscribe", MARKETING_TEST_ORIGIN);
  legacy.searchParams.set("token", encoded + "." + createHmac("sha256", secret).update(encoded).digest("base64url"));
  const unused = new URL("/api/marketing/unsubscribe", MARKETING_TEST_ORIGIN);
  const unusedToken = createMarketingUnsubscribeToken(MARKETING_TEST_CUSTOMER, secret,
    found.profile!.marketing_consent_generation, Math.floor(Date.now()/1000) - 60);
  if (!unusedToken) return json({ error: "Signed test links are unavailable." }, 503);
  unused.searchParams.set("token", unusedToken);
  return json({ url, unusedUrl: unused.toString(), legacyUrl: legacy.toString(), generation: found.profile!.marketing_consent_generation });
}
