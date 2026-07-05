import { NextResponse } from "next/server";
import { requireAdminFromRequest } from "@/lib/admin/requireAdmin";
import { restoreRecurringPreferredCleanerAssignments } from "@/lib/recurring/restoreRecurringPreferredCleanerAssignments";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await requireAdminFromRequest(req);
  if (!auth.ok) return auth.response;

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  let fromDate: string | null = null;
  let toDate: string | null = null;
  try {
    const body = (await req.json()) as { fromDate?: string; toDate?: string };
    fromDate = typeof body.fromDate === "string" ? body.fromDate.trim() : null;
    toDate = typeof body.toDate === "string" ? body.toDate.trim() : null;
  } catch {
    // optional body
  }

  try {
    const result = await restoreRecurringPreferredCleanerAssignments(admin, { fromDate, toDate });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Restore failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
