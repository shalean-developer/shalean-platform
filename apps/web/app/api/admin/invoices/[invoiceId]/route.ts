import { NextResponse } from "next/server";

import { loadAdminInvoiceBundle } from "@/lib/admin/invoices/loadAdminInvoiceBundle";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: { params: Promise<{ invoiceId: string }> }) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { invoiceId } = await ctx.params;
  if (!invoiceId) return NextResponse.json({ error: "Missing invoice id." }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const bundle = await loadAdminInvoiceBundle(admin, invoiceId);
  if (!bundle.ok) {
    if (bundle.error === "not_found") return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    return NextResponse.json({ error: bundle.message ?? "Load failed." }, { status: 500 });
  }

  return NextResponse.json(bundle.data);
}
