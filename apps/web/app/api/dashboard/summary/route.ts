import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { CUSTOMER_BOOKING_SELECT } from "@/lib/dashboard/customerBookingSelect";
import { mapBookingRow, isUpcomingBookingRow } from "@/lib/dashboard/bookingUtils";
import type { BookingRow, DashboardBooking } from "@/lib/dashboard/types";
import { johannesburgMonthKey } from "@/lib/dashboard/johannesburgMonth";
import { daysPastDueJhb } from "@/lib/dashboard/invoiceOverdueEscalation";
import { johannesburgTodayYmd } from "@/lib/dashboard/bookingSlotTimes";
import { normalizeCustomerBookingRow } from "@/lib/dashboard/normalizeCustomerBookingRow";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { CustomerMonthlyInvoiceRow } from "@/lib/dashboard/monthlyInvoiceTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INVOICE_SELECT = [
  "id",
  "customer_id",
  "month",
  "total_bookings",
  "total_amount_cents",
  "amount_paid_cents",
  "balance_cents",
  "status",
  "due_date",
  "payment_link",
  "sent_at",
  "finalized_at",
  "is_overdue",
  "is_closed",
  "currency_code",
  "created_at",
  "updated_at",
].join(",");

async function fetchBookings(admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>, userId: string): Promise<BookingRow[]> {
  let res = await admin
    .from("bookings")
    .select(CUSTOMER_BOOKING_SELECT)
    .eq("user_id", userId)
    .neq("status", "pending_payment")
    .neq("status", "payment_expired")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  if (res.error && /cleaners|relationship|schema|monthly_invoices/i.test(res.error.message)) {
    const noMi = CUSTOMER_BOOKING_SELECT.replace(",monthly_invoices(status,is_closed)", "");
    res = await admin
      .from("bookings")
      .select(noMi)
      .eq("user_id", userId)
      .neq("status", "pending_payment")
      .neq("status", "payment_expired")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100);
  }

  if (res.error && /cleaners|relationship|schema/i.test(res.error.message)) {
    const noMi = CUSTOMER_BOOKING_SELECT.replace(",monthly_invoices(status,is_closed)", "");
    const minimal = noMi.replace(",cleaners(full_name,phone)", "");
    res = await admin
      .from("bookings")
      .select(minimal)
      .eq("user_id", userId)
      .neq("status", "pending_payment")
      .neq("status", "payment_expired")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100);
  }

  if (res.error || !res.data) return [];
  return (res.data as unknown as BookingRow[]).map((r) => normalizeCustomerBookingRow(r));
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) {
    return NextResponse.json({ error: "Missing authorization." }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const pub = createClient(url, anon);
  const { data: userData, error: userErr } = await pub.auth.getUser(token);
  if (userErr || !userData.user?.id) {
    return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
  }

  const userId = userData.user.id;
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const nowSnapshot = new Date();
  const ym = johannesburgMonthKey(nowSnapshot);
  const todayYmd = johannesburgTodayYmd(nowSnapshot);

  const [bookingsRes, invRes] = await Promise.all([
    fetchBookings(admin, userId),
    admin
      .from("monthly_invoices")
      .select(INVOICE_SELECT)
      .eq("customer_id", userId)
      .order("month", { ascending: false })
      .limit(120),
  ]);

  const mapped = bookingsRes.map((r) => mapBookingRow(r));
  const upcoming = [...mapped]
    .filter(isUpcomingBookingRow)
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  const nextBooking: DashboardBooking | null = upcoming[0] ?? null;

  const bookingsThisMonthCount = mapped.filter((b) => typeof b.date === "string" && b.date.startsWith(ym)).length;

  const recentBookings = [...mapped].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 3);

  const invoices = (invRes.data ?? []) as unknown as CustomerMonthlyInvoiceRow[];
  const hasAnyInvoices = invoices.length > 0;
  const invoiceThisMonth = invoices.find((i) => i.month === ym) ?? null;

  const hasOverdueInvoice = invoices.some((i) => i.is_overdue && i.status !== "paid");

  let isOverdue = false;
  let daysOverdue = 0;
  if (invoiceThisMonth && invoiceThisMonth.status !== "paid") {
    const bal =
      typeof invoiceThisMonth.balance_cents === "number" && Number.isFinite(invoiceThisMonth.balance_cents)
        ? invoiceThisMonth.balance_cents
        : Math.max(0, invoiceThisMonth.total_amount_cents - invoiceThisMonth.amount_paid_cents);
    const pastDue = invoiceThisMonth.due_date < todayYmd;
    isOverdue = Boolean(invoiceThisMonth.is_overdue || (bal > 0 && pastDue));
    if (isOverdue) {
      daysOverdue = daysPastDueJhb(invoiceThisMonth.due_date, nowSnapshot);
    }
  }

  return NextResponse.json({
    ym,
    bookingsThisMonthCount,
    nextBooking,
    recentBookings,
    invoiceThisMonth,
    hasAnyInvoices,
    isOverdue,
    daysOverdue,
    hasOverdueInvoice,
  });
}
