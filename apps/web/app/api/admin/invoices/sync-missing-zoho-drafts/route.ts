import { NextResponse } from "next/server";

import { syncMissingMonthlyDraftsToZoho } from "@/lib/admin/invoices/syncMissingMonthlyDraftsToZoho";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  try {
    const result = await syncMissingMonthlyDraftsToZoho(admin, "dry_run");
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "missing_monthly_draft_zoho_sync_failed" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as { confirm?: string };
  if (body.confirm !== "SYNC_MISSING_ZOHO_DRAFTS") {
    return NextResponse.json(
      { error: "Confirmation SYNC_MISSING_ZOHO_DRAFTS is required." },
      { status: 400 },
    );
  }

  try {
    const result = await syncMissingMonthlyDraftsToZoho(admin, "apply");
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "missing_monthly_draft_zoho_sync_failed" },
      { status: 500 },
    );
  }
}
