import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { markSalesDocumentPaidManual } from "@/lib/salesDocument/markSalesDocumentPaidManual";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { note?: unknown };
  const note = typeof body.note === "string" ? body.note : undefined;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const result = await markSalesDocumentPaidManual(admin, { documentId: id, note });
  if (!result.ok) {
    const status = result.error === "already_paid" ? 409 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ ok: true });
}
