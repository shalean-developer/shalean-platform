import { NextResponse } from "next/server";
import { GET as getScopedCustomers } from "@/app/api/admin/customers/scoped/route";
import { adminUserHasPermission, requireAdminPermissionFromRequest } from "@/lib/admin/requirePermission";
import { rowsToCsv } from "@/lib/admin/csvExport";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BULK_EXPORT_THRESHOLD = 500;

type CustomerRow = {
  user_id?: string | null;
  id?: string | null;
  email?: string | null;
  full_name?: string | null;
  phone?: string | null;
  location?: string | null;
  suburb?: string | null;
  total_bookings?: number | null;
  totalBookings?: number | null;
  total_spend_zar?: number | null;
  totalSpendZar?: number | null;
  last_booking_at?: string | null;
  lastBookingAt?: string | null;
  status?: string | null;
  has_active_recurring_plan?: boolean | null;
};

type CustomerPayload = { customers?: CustomerRow[]; error?: string };

function derivedRequest(request: Request): Request {
  const url = new URL(request.url);
  url.pathname = "/api/admin/customers/scoped";
  url.search = "";
  return new Request(url, { method: "GET", headers: request.headers, cache: "no-store" });
}

export async function GET(request: Request) {
  const auth = await requireAdminPermissionFromRequest(request, "customer.export");
  if (!auth.ok) return auth.response;

  const scopedResponse = await getScopedCustomers(derivedRequest(request));
  if (!scopedResponse.ok) return scopedResponse;
  const payload = (await scopedResponse.json().catch(() => null)) as CustomerPayload | null;
  if (!payload) return NextResponse.json({ error: "Unable to build customer export." }, { status: 500 });

  const rows = payload.customers ?? [];
  if (rows.length > BULK_EXPORT_THRESHOLD) {
    const allowed = await adminUserHasPermission(auth.user.id, "bulk_export.approve");
    if (!allowed) {
      return NextResponse.json(
        { error: `Bulk export approval is required for more than ${BULK_EXPORT_THRESHOLD} customer rows.` },
        { status: 403 },
      );
    }
  }

  const canSeeFinance =
    (await adminUserHasPermission(auth.user.id, "finance.summary.view")) ||
    (await adminUserHasPermission(auth.user.id, "finance.full.view"));

  const headers = [
    "name",
    "email",
    "phone",
    "location",
    "suburb",
    "total_bookings",
    ...(canSeeFinance ? ["total_spend_zar"] : []),
    "last_booking_at",
    "status",
    "recurring",
  ];

  const csvRows = rows.map((row) => ({
    name: row.full_name ?? "",
    email: row.email ?? "",
    phone: row.phone ?? "",
    location: row.location ?? "",
    suburb: row.suburb ?? "",
    total_bookings: row.total_bookings ?? row.totalBookings ?? 0,
    ...(canSeeFinance ? { total_spend_zar: row.total_spend_zar ?? row.totalSpendZar ?? 0 } : {}),
    last_booking_at: row.last_booking_at ?? row.lastBookingAt ?? "",
    status: row.status ?? "",
    recurring: row.has_active_recurring_plan ? "yes" : "no",
  }));

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Audit service unavailable." }, { status: 503 });
  const { error: auditError } = await admin.from("admin_audit_events").insert({
    actor_user_id: auth.user.id,
    event_type: "admin_export_completed",
    target_type: "customer_export",
    target_id: "customers",
    permission_code: "customer.export",
    reason: "Governed customer CSV export",
    old_value: null,
    new_value: null,
    metadata: { row_count: rows.length, fields: headers, bulk: rows.length > BULK_EXPORT_THRESHOLD },
  });
  if (auditError) {
    console.error("Customer export completion audit failed", { userId: auth.user.id, code: auditError.code });
    return NextResponse.json({ error: "Export audit unavailable. Export was not released." }, { status: 503 });
  }

  const csv = rowsToCsv(headers, csvRows);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg" }).format(new Date());
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="shalean-customers-${date}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
