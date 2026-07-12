import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { rollbackPricingCatalogAudit } from "@/lib/admin/rollbackPricingCatalogAudit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Phase 4: one-click catalog rollback from a pricing_catalog_audit row.
 * POST body: { force?: boolean }
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id: auditId } = await ctx.params;
  if (!auditId?.trim()) {
    return NextResponse.json({ error: "Missing audit id." }, { status: 400 });
  }

  let force = false;
  try {
    const body = (await request.json()) as { force?: unknown };
    force = body?.force === true;
  } catch {
    // empty body is fine
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const result = await rollbackPricingCatalogAudit(admin, {
    auditId,
    actorUserId: auth.userId,
    actorEmail: auth.email ?? null,
    force,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, code: result.code },
      { status: result.status },
    );
  }

  return NextResponse.json({
    ok: true,
    table_name: result.tableName,
    row_id: result.rowId,
  });
}
