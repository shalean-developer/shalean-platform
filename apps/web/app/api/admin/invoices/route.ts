import { NextResponse } from "next/server";

import { loadAdminInvoiceList } from "@/lib/admin/invoices/loadAdminInvoiceList";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_FILTERS = new Set(["all", "paid", "unpaid", "overdue"]);

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("q") ?? "";
  const rawStatus = (searchParams.get("status") ?? "all").toLowerCase();
  const statusFilter = STATUS_FILTERS.has(rawStatus) ? (rawStatus as "all" | "paid" | "unpaid" | "overdue") : "all";
  const balanceGt0Only = ["1", "true", "yes"].includes((searchParams.get("balance_gt0") ?? "").toLowerCase());
  const hasDiscountLines = ["1", "true", "yes"].includes((searchParams.get("has_discounts") ?? "").toLowerCase());
  const hasMissedVisitLines = ["1", "true", "yes"].includes((searchParams.get("has_service_issues") ?? "").toLowerCase());

  const list = await loadAdminInvoiceList(admin, {
    search,
    statusFilter,
    balanceGt0Only,
    hasDiscountLines: hasDiscountLines || undefined,
    hasMissedVisitLines: hasMissedVisitLines || undefined,
  });
  if (!list.ok) return NextResponse.json({ error: list.error }, { status: 500 });

  return NextResponse.json(
    { invoices: list.rows },
    { headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" } },
  );
}
