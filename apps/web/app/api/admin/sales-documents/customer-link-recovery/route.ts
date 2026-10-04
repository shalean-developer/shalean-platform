import { NextResponse } from "next/server";

import {
  auditQuoteCustomerLinkRecovery,
  repairQuoteCustomerLinks,
} from "@/lib/salesDocument/quoteCustomerLinkRecovery";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  try {
    const rows = await auditQuoteCustomerLinkRecovery(admin);
    return NextResponse.json({ rows }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "quote_customer_link_audit_failed" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = (await request.json().catch(() => ({}))) as { confirm?: string };
  if (body.confirm !== "REPAIR_QUOTE_CUSTOMER_LINKS") {
    return NextResponse.json(
      { error: "Confirmation REPAIR_QUOTE_CUSTOMER_LINKS is required." },
      { status: 400 },
    );
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  try {
    const result = await repairQuoteCustomerLinks(admin);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "quote_customer_link_repair_failed" },
      { status: 500 },
    );
  }
}
