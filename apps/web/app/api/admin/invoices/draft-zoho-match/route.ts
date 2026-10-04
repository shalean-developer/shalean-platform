import { NextResponse } from "next/server";

import { reconcileMonthlyDraftsWithZoho } from "@/lib/admin/invoices/reconcileMonthlyDraftsWithZoho";
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
    const result = await reconcileMonthlyDraftsWithZoho(admin, "dry_run");
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "draft_zoho_reconciliation_failed" },
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
  if (body.confirm !== "LINK_EXACT_DRAFTS") {
    return NextResponse.json(
      { error: "Confirmation LINK_EXACT_DRAFTS is required." },
      { status: 400 },
    );
  }

  try {
    const result = await reconcileMonthlyDraftsWithZoho(admin, "apply");
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "draft_zoho_reconciliation_failed" },
      { status: 500 },
    );
  }
}
