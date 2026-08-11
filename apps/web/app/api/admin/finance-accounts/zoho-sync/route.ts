import { NextResponse } from "next/server";
import { requireFinanceApi } from "@/lib/auth/requireFinanceApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { syncZohoBankBalance } from "@/lib/zoho/syncZohoBankBalance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireFinanceApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const result = await syncZohoBankBalance(admin, auth.userId);
  if (!result.ok) {
    return NextResponse.json(result, { status: result.configured ? 409 : 503 });
  }
  return NextResponse.json(result);
}
