import { NextResponse } from "next/server";
import { requireAdminPermissionFromRequest } from "@/lib/admin/requirePermission";
import { runZohoCleanerSettlementEvidence03a02b2 } from "@/scripts/auditZohoCleanerSettlements03a02b2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONFIRM = "READ_ONLY_JUNE_JULY_2026_11_BOOKINGS";

export async function POST(request: Request) {
  // Feature switch stays absent/disabled in both Plesk environments by default.
  if (process.env.AUDIT_03A02B2_HTTP_ENABLED !== "YES") {
    return NextResponse.json({ error: "Audit operation disabled." }, { status: 404 });
  }

  const auth = await requireAdminPermissionFromRequest(request, "finance.full.view");
  if (!auth.ok) return auth.response;

  const requestUrl = new URL(request.url);
  if (requestUrl.hostname !== "shalean.co.za" || process.env.SHALEAN_APP_ENV !== "production") {
    return NextResponse.json({ error: "Production-only audit operation." }, { status: 409 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.startsWith("application/json")) {
    return NextResponse.json({ error: "JSON body required." }, { status: 415 });
  }
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      (body as Record<string, unknown>).confirmation !== CONFIRM ||
      Object.keys(body).length !== 1) {
    return NextResponse.json({ error: "Explicit bounded audit confirmation required." }, { status: 400 });
  }

  try {
    // The implementation itself validates exact production Supabase, Zoho org and hosts.
    const evidence = await runZohoCleanerSettlementEvidence03a02b2();
    return NextResponse.json(evidence, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Read-only audit failed closed." }, { status: 503 });
  }
}
