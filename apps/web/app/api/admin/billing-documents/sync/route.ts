import { NextResponse } from "next/server";

import type { AdminBillingDocumentKind } from "@/lib/admin/billing/loadAdminBillingDocuments";
import { syncBillingDocumentToZoho } from "@/lib/admin/billing/syncBillingDocumentToZoho";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { monthlyInvoiceZohoSyncErrorMessage } from "@/lib/monthlyInvoice/resolveMonthlyInvoiceZohoTotalCents";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS = new Set<AdminBillingDocumentKind>([
  "quote",
  "sales_invoice",
  "booking_invoice",
  "monthly_invoice",
]);

export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as { kind?: string; id?: string };
  const kind = String(body.kind ?? "").trim() as AdminBillingDocumentKind;
  const id = String(body.id ?? "").trim();

  if (!KINDS.has(kind)) {
    return NextResponse.json({ error: "invalid_kind" }, { status: 400 });
  }
  if (!id) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }

  const result = await syncBillingDocumentToZoho(admin, { kind, id });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: monthlyInvoiceZohoSyncErrorMessage(result.error) },
      { status: 422 },
    );
  }

  return NextResponse.json({ ok: true, zoho_id: result.zoho_id });
}
