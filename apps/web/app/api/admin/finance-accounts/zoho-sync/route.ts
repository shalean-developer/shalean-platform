import { NextResponse } from "next/server";
import { requireAdminPermissionFromRequest } from "@/lib/admin/requirePermission";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { syncZohoBankBalance } from "@/lib/zoho/syncZohoBankBalance";
import { isZohoBooksWriteBlocked } from "@/lib/zoho/zohoWriteIsolation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminPermissionFromRequest(request, "expense.manage");
  if (!auth.ok) return auth.response;
  return NextResponse.json({
    can_manage: true,
    can_sync: !isZohoBooksWriteBlocked(process.env.SHALEAN_APP_ENV),
  });
}

export async function POST(request: Request) {
  // Bank-balance sync persists a finance balance, so view-only finance access is not sufficient.
  const auth = await requireAdminPermissionFromRequest(request, "expense.manage");
  if (!auth.ok) return auth.response;

  if (isZohoBooksWriteBlocked(process.env.SHALEAN_APP_ENV)) {
    return NextResponse.json({ error: "zoho_bank_sync_blocked_nonproduction" }, { status: 409 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const result = await syncZohoBankBalance(admin, auth.user.id);
  if (!result.ok) {
    return NextResponse.json(result, { status: result.configured ? 409 : 503 });
  }
  return NextResponse.json(result);
}
