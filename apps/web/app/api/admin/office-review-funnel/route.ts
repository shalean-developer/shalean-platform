import { NextResponse } from "next/server";
import { loadOfficeReviewFunnelSummary } from "@/lib/admin/officeReviewFunnel";
import { requireAdminFromRequest } from "@/lib/admin/requireAdmin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminFromRequest(request);
  if (!auth.ok) return auth.response;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const rawDays = Number(new URL(request.url).searchParams.get("days") ?? "30");
  const days = Number.isFinite(rawDays) ? rawDays : 30;

  try {
    const summary = await loadOfficeReviewFunnelSummary(admin, days);
    return NextResponse.json(summary);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load review funnel.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
