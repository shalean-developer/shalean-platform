import { NextResponse } from "next/server";
import { loadOfficeOperationsSummary } from "@/lib/admin/officeOperations";
import { requireAdminFromRequest } from "@/lib/admin/requireAdmin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminFromRequest(request);
  if (!auth.ok) return auth.response;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  try {
    const summary = await loadOfficeOperationsSummary(admin);
    return NextResponse.json(summary);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load operations summary.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
