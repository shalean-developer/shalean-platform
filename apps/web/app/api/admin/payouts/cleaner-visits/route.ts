import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { loadOfficeCleanerEditableVisits } from "@/lib/admin/payouts/officeCleanerEditableVisits";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const url = new URL(request.url);
  const cleanerId = url.searchParams.get("cleaner_id")?.trim() ?? "";
  if (!cleanerId) {
    return NextResponse.json({ error: "cleaner_id is required." }, { status: 400 });
  }

  try {
    const result = await loadOfficeCleanerEditableVisits(
      admin,
      cleanerId,
      url.searchParams.get("from"),
      url.searchParams.get("to"),
    );
    if ("error" in result) {
      const status = result.error === "Cleaner not found." ? 404 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load cleaner visits.";
    console.error("[cleaner-visits]", message, e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
