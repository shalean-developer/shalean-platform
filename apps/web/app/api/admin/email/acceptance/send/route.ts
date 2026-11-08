import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { marketingAcceptanceHost, marketingAcceptanceRecipients } from "@/lib/email/marketingAcceptanceConfig";
import { readBoundedRequest } from "@/lib/email/readBoundedRequest";
import { sendMarketingAcceptance } from "@/lib/email/sendMarketingAcceptance";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (body: object, status: number) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });

export async function POST(request: Request) {
  if (!marketingAcceptanceHost(request) || marketingAcceptanceRecipients().length !== 2) return json({ error: "Not found" }, 404);
  const auth = await requireAdminApi(request, ["system.settings"]);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (request.headers.get("origin") !== "https://pricing-test.shalean.co.za" || request.headers.get("sec-fetch-site") === "cross-site")
    return json({ error: "Same-origin request required." }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ error: "JSON required." }, 415);
  const raw = await readBoundedRequest(request, 1024);
  if (raw === null) return json({ error: "Request too large." }, 413);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return json({ error: "Invalid request." }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Invalid request." }, 400);
  const data = body as Record<string, unknown>;
  if (Object.keys(data).some(key => !["email", "explicitTestSend"].includes(key)) || data.explicitTestSend !== true || typeof data.email !== "string" || !marketingAcceptanceRecipients().includes(data.email))
    return json({ error: "Choose a configured inbox and explicitly authorize this test." }, 400);
  const admin = getSupabaseAdmin();
  if (!admin) return json({ error: "Delivery service unavailable." }, 503);
  const result = await sendMarketingAcceptance(admin, data.email);
  return json({ outcome: result.outcome, ...(result.error ? { error: result.error } : {}) }, result.status);
}
