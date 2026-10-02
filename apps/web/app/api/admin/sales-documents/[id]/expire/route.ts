import { NextResponse } from "next/server";

import { requireAnyAdminPermissionFromRequest } from "@/lib/admin/requirePermission";
import { expireSalesQuote } from "@/lib/salesDocument/expireSalesQuote";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAnyAdminPermissionFromRequest(request, ["invoice.manage", "customer.contact"]);
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { confirm?: string; reason?: string };

  if (body.confirm !== "EXPIRE_QUOTE") {
    return NextResponse.json({ error: "Confirmation EXPIRE_QUOTE is required." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const reason = typeof body.reason === "string" && body.reason.trim()
    ? body.reason.trim().slice(0, 500)
    : "Quote expired after manual review";

  const result = await expireSalesQuote(admin, id, reason);
  if (!result.ok) {
    const status = result.error === "quote_not_found" ? 404 : 409;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ ok: true });
}
