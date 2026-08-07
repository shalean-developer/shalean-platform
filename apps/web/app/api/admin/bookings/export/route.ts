import { NextResponse } from "next/server";
import { GET as getScopedBookings } from "@/app/api/admin/bookings/scoped/route";
import { adminBookingAssignmentDisplay } from "@/lib/admin/adminBookingAssignmentDisplay";
import { rowsToCsv } from "@/lib/admin/csvExport";
import { adminUserHasPermission, requireAdminPermissionFromRequest } from "@/lib/admin/requirePermission";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;
const BULK_EXPORT_THRESHOLD = 500;

type BookingRow = Record<string, unknown> & {
  id: string;
  customer_name?: string | null;
  customer_email?: string | null;
  service?: string | null;
  service_slug?: string | null;
  date?: string | null;
  time?: string | null;
  location?: string | null;
  total_paid_zar?: number | null;
  amount_paid_cents?: number | null;
  status?: string | null;
  team_id?: string | null;
  team?: { id: string; name: string | null } | null;
  booking_cleaners?: Array<{ cleaner_id: string; full_name: string | null; role: string }>;
};

type ScopedPayload = {
  bookings?: BookingRow[];
  pagination?: { totalPages?: number; total?: number };
  capabilities?: { customerRevenue?: boolean; cleanerEarnings?: boolean };
  error?: string;
};

function derivedRequest(request: Request, page: number): Request {
  const url = new URL(request.url);
  url.pathname = "/api/admin/bookings/scoped";
  url.searchParams.delete("download");
  url.searchParams.set("page", String(page));
  url.searchParams.set("pageSize", String(PAGE_SIZE));
  return new Request(url, { method: "GET", headers: request.headers, cache: "no-store" });
}

function amountZar(row: BookingRow): string {
  if (typeof row.total_paid_zar === "number") return String(Math.round(row.total_paid_zar));
  if (typeof row.amount_paid_cents === "number") return String(Math.round(row.amount_paid_cents / 100));
  return "";
}

export async function GET(request: Request) {
  const auth = await requireAdminPermissionFromRequest(request, "booking.export");
  if (!auth.ok) return auth.response;

  const rows: BookingRow[] = [];
  let page = 1;
  let totalPages = 1;
  let canViewRevenue = false;

  while (page <= totalPages) {
    const scopedResponse = await getScopedBookings(derivedRequest(request, page));
    if (!scopedResponse.ok) return scopedResponse;
    const payload = (await scopedResponse.json().catch(() => null)) as ScopedPayload | null;
    if (!payload) return NextResponse.json({ error: "Unable to build booking export." }, { status: 500 });
    rows.push(...(payload.bookings ?? []));
    canViewRevenue = canViewRevenue || payload.capabilities?.customerRevenue === true;
    totalPages = Math.max(1, Number(payload.pagination?.totalPages ?? 1));
    page += 1;
    if (page > 1000) return NextResponse.json({ error: "Export pagination exceeded safe limit." }, { status: 500 });
  }

  if (rows.length > BULK_EXPORT_THRESHOLD) {
    const allowed = await adminUserHasPermission(auth.user.id, "bulk_export.approve");
    if (!allowed) {
      return NextResponse.json(
        { error: `Bulk export approval is required for more than ${BULK_EXPORT_THRESHOLD} booking rows.` },
        { status: 403 },
      );
    }
  }

  const headers = [
    "booking_reference",
    "customer_name",
    "customer_email",
    "service",
    "date",
    "time",
    "location",
    "assignment",
    ...(canViewRevenue ? ["amount_zar"] : []),
    "status",
  ];

  const csvRows = rows.map((row) => ({
    booking_reference: row.id,
    customer_name: row.customer_name ?? "",
    customer_email: row.customer_email ?? "",
    service: (row.service_slug ?? row.service ?? "").replace(/-/g, " "),
    date: row.date ?? "",
    time: row.time ? row.time.slice(0, 5) : "",
    location: row.location ?? "",
    assignment: adminBookingAssignmentDisplay(row).label,
    ...(canViewRevenue ? { amount_zar: amountZar(row) } : {}),
    status: row.status ?? "",
  }));

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Audit service unavailable." }, { status: 503 });
  const { error: auditError } = await admin.from("admin_audit_events").insert({
    actor_user_id: auth.user.id,
    event_type: "admin_export_completed",
    target_type: "booking_export",
    target_id: "bookings",
    permission_code: "booking.export",
    reason: "Governed booking CSV export",
    old_value: null,
    new_value: null,
    metadata: {
      row_count: rows.length,
      fields: headers,
      bulk: rows.length > BULK_EXPORT_THRESHOLD,
      revenue_included: canViewRevenue,
    },
  });
  if (auditError) {
    console.error("Booking export completion audit failed", { userId: auth.user.id, code: auditError.code });
    return NextResponse.json({ error: "Export audit unavailable. Export was not released." }, { status: 503 });
  }

  const csv = rowsToCsv(headers, csvRows);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg" }).format(new Date());
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="shalean-bookings-${date}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
