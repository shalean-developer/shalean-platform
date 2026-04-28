import { NextResponse } from "next/server";

import {
  rememberIdempotentAdminInvoicePost,
  replayIdempotentAdminInvoicePost,
} from "@/lib/admin/adminInvoiceIdempotency";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
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

  const replay = await replayIdempotentAdminInvoicePost(admin, request, invoiceId, "hard_close");
  if (replay) return replay;

  const { error } = await admin.rpc("monthly_invoice_hard_close", { p_invoice_id: invoiceId });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const payload = { ok: true as const };
  await rememberIdempotentAdminInvoicePost(admin, request, invoiceId, "hard_close", 200, payload);
  return NextResponse.json(payload);
}
