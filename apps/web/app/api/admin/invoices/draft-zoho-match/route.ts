import { NextResponse } from "next/server";

import {
  linkReviewedMonthlyDraftWithZoho,
  reconcileMonthlyDraftsWithZoho,
} from "@/lib/admin/invoices/reconcileMonthlyDraftsWithZoho";
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

  const body = (await request.json().catch(() => ({}))) as {
    confirm?: string;
    invoice_id?: string;
    zoho_invoice_id?: string;
  };

  try {
    if (body.confirm === "LINK_REVIEWED_DRAFT") {
      const invoiceId = String(body.invoice_id ?? "").trim();
      const zohoInvoiceId = String(body.zoho_invoice_id ?? "").trim();
      if (!invoiceId || !zohoInvoiceId) {
        return NextResponse.json({ error: "invoice_id and zoho_invoice_id are required." }, { status: 400 });
      }
      const result = await linkReviewedMonthlyDraftWithZoho(admin, {
        invoiceId,
        zohoInvoiceId,
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 422 });
      }
      return NextResponse.json(result, {
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    if (body.confirm !== "LINK_EXACT_DRAFTS") {
      return NextResponse.json(
        { error: "Confirmation LINK_EXACT_DRAFTS or LINK_REVIEWED_DRAFT is required." },
        { status: 400 },
      );
    }

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
