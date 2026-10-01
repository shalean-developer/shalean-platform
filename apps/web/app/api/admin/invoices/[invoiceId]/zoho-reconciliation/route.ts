import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { assessMonthlyInvoiceZohoReconciliation } from "@/lib/monthlyInvoice/assessMonthlyInvoiceZohoReconciliation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ invoiceId: string }> }) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { invoiceId } = await ctx.params;
  if (!invoiceId) return NextResponse.json({ error: "Missing invoice id." }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const result = await assessMonthlyInvoiceZohoReconciliation(admin, invoiceId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });

  return NextResponse.json(result);
}
