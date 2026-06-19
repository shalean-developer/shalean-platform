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

  const pageParam = searchParams.get("page");
  const monthsPerPageParam = searchParams.get("monthsPerPage") ?? searchParams.get("pageSize");
  const page =
    pageParam != null && pageParam !== ""
      ? Math.max(1, Number.parseInt(pageParam, 10) || 1)
      : undefined;
  const monthsPerPage =
    page != null
      ? Math.max(1, Math.min(12, Number.parseInt(monthsPerPageParam ?? "3", 10) || 3))
      : undefined;

  const list = await loadAdminInvoiceList(admin, {
    search,
    statusFilter,
    balanceGt0Only,
    hasDiscountLines: hasDiscountLines || undefined,
    hasMissedVisitLines: hasMissedVisitLines || undefined,
    page,
    monthsPerPage,
  });
  if (!list.ok) return NextResponse.json({ error: list.error }, { status: 500 });

  return NextResponse.json(
    {
      invoices: list.rows,
      ...(list.monthGroups ? { monthGroups: list.monthGroups } : {}),
      ...(list.pagination ? { pagination: list.pagination } : {}),
      ...(list.summary ? { summary: list.summary } : {}),
    },
    { headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" } },
  );
}
