import { NextResponse } from "next/server";
import { requireAdminPermissionFromRequest } from "@/lib/admin/requirePermission";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { syncZohoBankBalance } from "@/lib/zoho/syncZohoBankBalance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // Bank-balance sync persists a finance balance, so view-only finance access is not sufficient.
  const auth = await requireAdminPermissionFromRequest(request, "expense.manage");
  if (!auth.ok) return auth.response;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const result = await syncZohoBankBalance(admin, auth.user.id);
  if (!result.ok) {
    return NextResponse.json(result, { status: result.configured ? 409 : 503 });
  }
  return NextResponse.json(result);
}
