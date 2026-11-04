import { NextResponse } from "next/server";
import { requireFinanceApi } from "@/lib/auth/requireFinanceApi";
import { zohoBooksClient } from "@/lib/zoho/zohoBooksClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * CF-02: authenticated, staging-only provider read test.
 * Never return provider payloads, credentials, invoice details or error messages.
 */
export async function GET(request: Request) {
  const auth = await requireFinanceApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  if (process.env.SHALEAN_APP_ENV?.trim().toLowerCase() !== "staging") {
    return NextResponse.json({ error: "not_available" }, { status: 404 });
  }

  if (!process.env.ZOHO_ORGANIZATION_ID?.trim()) {
    return NextResponse.json({ ok: false, error: "organization_not_configured" }, { status: 503 });
  }

  try {
    const result = await zohoBooksClient.getWithTokenRecovery<{
      code?: number;
      invoices?: unknown[];
    }>("/invoices?per_page=1");

    if (!Array.isArray(result.invoices)) {
      return NextResponse.json({ ok: false, error: "unexpected_provider_response" }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      organization_suffix: process.env.ZOHO_ORGANIZATION_ID.slice(-4),
      invoices_readable: true,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // Deliberately redact OAuth/provider error bodies, invoice metadata and access tokens.
    return NextResponse.json({ ok: false, error: "zoho_invoice_read_failed" }, { status: 502 });
  }
}
