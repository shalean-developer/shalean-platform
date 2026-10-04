import { NextResponse } from "next/server";

import {
  loadAdminInvoiceRegistry,
  type AdminInvoiceRegistryKindFilter,
  type AdminInvoiceRegistryStatusFilter,
} from "@/lib/admin/invoices/loadAdminInvoiceRegistry";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KIND_FILTERS = new Set<AdminInvoiceRegistryKindFilter>([
  "all",
  "invoices",
  "quote",
  "sales_invoice",
  "booking_invoice",
  "monthly_invoice",
]);

const STATUS_FILTERS = new Set<AdminInvoiceRegistryStatusFilter>([
  "all",
  "paid",
  "unpaid",
  "draft",
  "sent",
  "overdue",
  "missing_zoho",
]);

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const rawKind = (searchParams.get("kind") ?? "all").toLowerCase();
  const rawStatus = (searchParams.get("status") ?? "all").toLowerCase();
  const kind = KIND_FILTERS.has(rawKind as AdminInvoiceRegistryKindFilter)
    ? (rawKind as AdminInvoiceRegistryKindFilter)
    : "all";
  const status = STATUS_FILTERS.has(rawStatus as AdminInvoiceRegistryStatusFilter)
    ? (rawStatus as AdminInvoiceRegistryStatusFilter)
    : "all";
  const search = searchParams.get("q") ?? "";
  const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.max(
    10,
    Math.min(100, Number.parseInt(searchParams.get("page_size") ?? "50", 10) || 50),
  );

  try {
    const payload = await loadAdminInvoiceRegistry(admin, {
      kind,
      status,
      search,
      page,
      pageSize,
    });

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "private, max-age=20, stale-while-revalidate=40" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "invoice_registry_load_failed" },
      { status: 500 },
    );
  }
}
