"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  CalendarClock,
  CalendarDays,
  CalendarX2,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  Home,
  MapPin,
  Receipt,
  Repeat,
  Sparkles,
  Wallet,
} from "lucide-react";
import { TrustBar } from "@/components/account/TrustBar";
import { HelpCard } from "@/components/account/HelpCard";
import { useDashboardSummary } from "@/hooks/useDashboardSummary";
import { useAddresses } from "@/hooks/useAddresses";
import { perBookingInvoicesFromBookings } from "@/lib/dashboard/perBookingInvoice";
import { formatZarFromCents } from "@/lib/dashboard/formatZar";
import { customerMonthlyInvoiceStatusLabel } from "@/lib/dashboard/monthlyInvoiceUi";
import { invoiceOverdueEscalationText } from "@/lib/dashboard/invoiceOverdueEscalation";
import { BookingCard } from "@/components/dashboard/booking-card";
import { CustomerBookingStatusBadge } from "@/components/dashboard/customer-booking-status-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/* ─── Quick action cards ─── */
const QUICK_ACTIONS = [
  {
    href: "/account/book",
    icon: Sparkles,
    iconBg: "bg-blue-100",
    iconColor: "text-blue-600",
    title: "Book a clean",
    description: "Schedule a new cleaning",
  },
  {
    href: "/account/bookings",
    icon: CalendarDays,
    iconBg: "bg-indigo-100",
    iconColor: "text-indigo-600",
    title: "All bookings",
    description: "View your bookings",
  },
  {
    href: "/account/recurring",
    icon: Repeat,
    iconBg: "bg-violet-100",
    iconColor: "text-violet-600",
    title: "Recurring plans",
    description: "Manage recurring cleans",
  },
  {
    href: "/account/invoices",
    icon: FileText,
    iconBg: "bg-amber-100",
    iconColor: "text-amber-600",
    title: "Invoices",
    description: "View and download",
  },
];

/* ─── Booking time formatter ─── */
function formatTimeRange(time: string, durationHours: number, scheduleConfirmed = true): string {
  if (!scheduleConfirmed || !time?.trim() || !/^\d{1,2}:\d{2}$/.test(time.trim())) {
    return "Time to be confirmed";
  }
  if (!Number.isFinite(durationHours) || durationHours <= 0) {
    return "Time to be confirmed";
  }
  try {
    const [hStr, mStr] = time.split(":");
    const h = parseInt(hStr ?? "0", 10);
    const m = parseInt(mStr ?? "0", 10);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return "Time to be confirmed";
    const startDate = new Date(2000, 0, 1, h, m);
    const endDate = new Date(startDate.getTime() + durationHours * 60 * 60 * 1000);
    const fmt = (d: Date) =>
      d.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: true }).toUpperCase();
    return `${fmt(startDate)} – ${fmt(endDate)} (${durationHours} hrs)`;
  } catch {
    return "Time to be confirmed";
  }
}

/* ─── Date formatter ─── */
function formatBookingDate(date: string): string {
  try {
    const d = new Date(date + "T00:00:00");
    return d.toLocaleDateString("en-ZA", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return date;
  }
}

function getServiceGradient(serviceName: string): string {
  const n = (serviceName ?? "").toLowerCase();
  if (n.includes("office") || n.includes("commercial")) return "from-teal-500 to-cyan-600";
  if (n.includes("deep") || n.includes("spring")) return "from-purple-500 to-violet-600";
  if (n.includes("move") || n.includes("vacate")) return "from-amber-400 to-orange-500";
  if (n.includes("carpet") || n.includes("upholstery")) return "from-rose-400 to-pink-500";
  if (n.includes("window")) return "from-sky-400 to-blue-500";
  if (n.includes("airbnb")) return "from-pink-400 to-rose-500";
  return "from-blue-500 to-indigo-600";
}

function formatAddress(addressLine: string | null | undefined, suburb: string | null | undefined): string {
  const parts = [addressLine, suburb]
    .map((p) => (p ?? "").trim())
    .filter((p) => p.length > 0 && p !== "—");
  return parts.filter((p, i) => parts.indexOf(p) === i).join(", ");
}

export default function AccountHomePage() {
  const { summary, loading, error, refetch } = useDashboardSummary();
  const { addresses, loading: addrLoading } = useAddresses();

  const ym = summary?.ym ?? "";
  const nextBooking = summary?.nextBooking ?? null;
  const recent = useMemo(() => summary?.recentBookings ?? [], [summary]);
  const bookingsThisMonthCount = summary?.bookingsThisMonthCount ?? 0;
  const hoursBookedThisMonth = summary?.hoursBookedThisMonth ?? 0;
  const invoiceThisMonth = summary?.invoiceThisMonth ?? null;
  const hasAnyInvoices = summary?.hasAnyInvoices ?? false;
  const isOverdue = summary?.isOverdue ?? false;
  const daysOverdue = summary?.daysOverdue ?? 0;
  const hasOverdueInvoice = summary?.hasOverdueInvoice ?? false;

  const balanceCents =
    invoiceThisMonth &&
    typeof invoiceThisMonth.balance_cents === "number" &&
    Number.isFinite(invoiceThisMonth.balance_cents)
      ? invoiceThisMonth.balance_cents
      : invoiceThisMonth
        ? Math.max(0, invoiceThisMonth.total_amount_cents - invoiceThisMonth.amount_paid_cents)
        : 0;

  const totalSpentCents = invoiceThisMonth?.amount_paid_cents ?? 0;

  const completedCount = useMemo(
    () => recent.filter((b) => b.status?.toLowerCase().includes("complet")).length,
    [recent],
  );

  const defaultAddr = useMemo(() => addresses.find((a) => a.is_default) ?? addresses[0], [addresses]);

  const perVisitInvoices = useMemo(() => perBookingInvoicesFromBookings(recent).slice(0, 3), [recent]);

  /* ── Skeleton ── */
  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        {/* Quick actions skeleton */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 rounded-2xl bg-gray-100" />
          ))}
        </div>
        {/* Main grid skeleton */}
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <div className="h-48 rounded-2xl bg-gray-100" />
            <div className="grid grid-cols-4 gap-3">
              {[...Array(4)].map((_, i) => <div key={i} className="h-24 rounded-2xl bg-gray-100" />)}
            </div>
            <div className="h-32 rounded-2xl bg-gray-100" />
          </div>
          <div className="space-y-4">
            <div className="h-40 rounded-2xl bg-gray-100" />
            <div className="h-40 rounded-2xl bg-gray-100" />
            <div className="h-24 rounded-2xl bg-gray-100" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Error banner */}
      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}{" "}
          <button type="button" className="font-semibold underline" onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      ) : null}

      {/* ── Quick action cards ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {QUICK_ACTIONS.map(({ href, icon: Icon, iconBg, iconColor, title, description }) => (
          <Link
            key={href}
            href={href}
            className="group flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition hover:border-blue-200 hover:shadow-md"
          >
            <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", iconBg)}>
              <Icon className={cn("h-5 w-5", iconColor)} strokeWidth={1.75} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-gray-900">{title}</p>
              <p className="truncate text-xs text-gray-500">{description}</p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 transition group-hover:text-gray-400" />
          </Link>
        ))}
      </div>

      {/* ── Main 2-col grid ── */}
      <div className="grid gap-6 lg:grid-cols-3">

        {/* ── LEFT COLUMN ── */}
        <div className="space-y-6 lg:col-span-2">

          {/* Upcoming booking */}
          <section>
            <h2 className="mb-3 text-base font-semibold text-gray-900">Upcoming booking</h2>
            {nextBooking ? (
              <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                <div className="flex flex-col sm:flex-row">
                  {/* Service gradient — same style as BookingCard */}
                  <div
                    className={cn(
                      "relative h-40 w-full shrink-0 overflow-hidden sm:h-auto sm:w-40 md:w-48",
                      `bg-gradient-to-br ${getServiceGradient(nextBooking.serviceName)}`,
                    )}
                  >
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
                        <CalendarClock className="h-6 w-6 text-white" strokeWidth={1.5} />
                      </div>
                      <span className="text-center text-xs font-semibold leading-tight text-white/90">
                        {nextBooking.serviceName}
                      </span>
                    </div>
                  </div>

                  {/* Details */}
                  <div className="flex flex-1 flex-col justify-between p-5">
                    <div className="space-y-3">
                      <CustomerBookingStatusBadge booking={nextBooking} />
                      <p className="text-lg font-bold text-gray-900">{nextBooking.serviceName}</p>
                      <div className="space-y-1.5 text-sm text-gray-600">
                        <div className="flex items-center gap-2">
                          <CalendarDays className="h-4 w-4 shrink-0 text-blue-500" />
                          {formatBookingDate(nextBooking.date)}
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 shrink-0 text-blue-500" />
                          {formatTimeRange(nextBooking.time, nextBooking.durationHours, nextBooking.scheduleConfirmed)}
                        </div>
                        {formatAddress(nextBooking.addressLine, nextBooking.suburb) ? (
                          <div className="flex items-start gap-2">
                            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                            <span className="line-clamp-1">
                              {formatAddress(nextBooking.addressLine, nextBooking.suburb)}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-4">
                      <Button asChild size="sm" className="rounded-xl bg-blue-600 hover:bg-blue-700">
                        <Link href={`/account/bookings/${nextBooking.id}`}>View details</Link>
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50">
                  <CalendarDays className="h-7 w-7 text-blue-400" strokeWidth={1.5} />
                </div>
                <p className="mt-4 font-semibold text-gray-900">No upcoming cleans</p>
                <p className="mt-1 text-sm text-gray-500">Book your next visit in a few taps.</p>
                <Button asChild size="sm" className="mt-4 rounded-xl bg-blue-600 hover:bg-blue-700">
                  <Link href="/account/book">Book a clean</Link>
                </Button>
              </div>
            )}
          </section>

          {/* This month overview */}
          <section>
            <h2 className="mb-3 text-base font-semibold text-gray-900">This month overview</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {/* Bookings */}
              <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100">
                  <CalendarDays className="h-5 w-5 text-blue-600" strokeWidth={1.75} />
                </div>
                <p className="mt-3 text-2xl font-bold tabular-nums text-gray-900">{bookingsThisMonthCount}</p>
                <p className="mt-0.5 text-xs font-medium text-gray-700">Bookings</p>
                <p className="text-xs text-gray-400">in {ym || "this month"}</p>
              </div>
              {/* Completed */}
              <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-100">
                  <CheckCircle2 className="h-5 w-5 text-green-600" strokeWidth={1.75} />
                </div>
                <p className="mt-3 text-2xl font-bold tabular-nums text-gray-900">{completedCount}</p>
                <p className="mt-0.5 text-xs font-medium text-gray-700">Completed</p>
                <p className="text-xs text-gray-400">bookings</p>
              </div>
              {/* Hours booked */}
              <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100">
                  <Clock className="h-5 w-5 text-orange-500" strokeWidth={1.75} />
                </div>
                <p className="mt-3 text-2xl font-bold tabular-nums text-gray-900">{hoursBookedThisMonth}</p>
                <p className="mt-0.5 text-xs font-medium text-gray-700">Hours booked</p>
                <p className="text-xs text-gray-400">this month</p>
              </div>
              {/* Total spent */}
              <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100">
                  <Wallet className="h-5 w-5 text-purple-600" strokeWidth={1.75} />
                </div>
                <p className="mt-3 text-2xl font-bold tabular-nums text-gray-900">
                  {formatZarFromCents(totalSpentCents)}
                </p>
                <p className="mt-0.5 text-xs font-medium text-gray-700">Total spent</p>
                <p className="text-xs text-gray-400">this month</p>
              </div>
            </div>
          </section>

          {/* Recent bookings */}
          <section>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-gray-900">Recent bookings</h2>
              <Link
                href="/account/bookings"
                className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline"
              >
                View all bookings
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
            {recent.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-100 bg-white p-10 text-center shadow-sm">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100">
                  <CalendarX2 className="h-7 w-7 text-gray-400" strokeWidth={1.5} />
                </div>
                <p className="mt-4 font-semibold text-gray-900">No bookings yet</p>
                <p className="mt-1 text-sm text-gray-500">
                  Once you book a clean, your bookings will appear here.
                </p>
                <Button asChild size="sm" className="mt-4 rounded-xl bg-blue-600 hover:bg-blue-700">
                  <Link href="/account/book">Book your first clean</Link>
                </Button>
              </div>
            ) : (
              <ul className="space-y-3">
                {recent.slice(0, 1).map((b) => (
                  <li key={b.id}>
                    <BookingCard booking={b} showActions={false} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div className="space-y-4">

          {/* Invoice summary */}
          <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
              <h2 className="text-sm font-semibold text-gray-900">Invoice summary</h2>
              <Link href="/account/invoices" className="flex items-center gap-0.5 text-xs font-medium text-blue-600 hover:underline">
                View all invoices <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="p-5">
              {invoiceThisMonth ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                      {invoiceThisMonth.month} · {customerMonthlyInvoiceStatusLabel(invoiceThisMonth.status)}
                    </p>
                    {isOverdue ? (
                      <Badge variant="destructive" className="text-[10px] uppercase">Overdue</Badge>
                    ) : null}
                  </div>
                  {isOverdue ? (
                    <p className="mt-2 text-xs text-amber-700">{invoiceOverdueEscalationText(daysOverdue)}</p>
                  ) : null}
                  {hasOverdueInvoice && !isOverdue ? (
                    <p className="mt-2 text-xs text-gray-500">
                      You have an overdue invoice —{" "}
                      <Link href="/account/invoices" className="font-medium text-blue-600 underline">view invoices</Link>.
                    </p>
                  ) : null}
                  <dl className="mt-4 space-y-3 text-sm">
                    <div className="flex justify-between gap-2">
                      <dt className="text-gray-500">Total</dt>
                      <dd className="font-semibold tabular-nums text-gray-900">{formatZarFromCents(invoiceThisMonth.total_amount_cents)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-gray-500">Paid</dt>
                      <dd className="font-semibold tabular-nums text-gray-900">{formatZarFromCents(invoiceThisMonth.amount_paid_cents)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-gray-500">Balance</dt>
                      <dd className={cn("font-semibold tabular-nums", balanceCents > 0 ? "text-red-600" : "text-gray-900")}>
                        {formatZarFromCents(balanceCents)}
                      </dd>
                    </div>
                  </dl>
                  <Button asChild variant="outline" size="sm" className="mt-4 w-full rounded-xl">
                    <Link href={`/account/invoices/${invoiceThisMonth.id}`}>View invoice</Link>
                  </Button>
                </>
              ) : perVisitInvoices.length > 0 ? (
                <>
                  <ul className="space-y-2.5">
                    {perVisitInvoices.map((inv) => (
                      <li key={inv.bookingId}>
                        <Link
                          href={`/account/bookings/${inv.bookingId}`}
                          className="flex items-center justify-between gap-2 rounded-xl border border-gray-100 px-3 py-2.5 transition hover:border-blue-200 hover:bg-blue-50/40"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-gray-900">{inv.serviceName}</p>
                            <p className="text-xs text-gray-400">Per-visit · Paid</p>
                          </div>
                          <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-900">
                            R {inv.amountZar.toLocaleString("en-ZA")}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <Button asChild variant="outline" size="sm" className="mt-4 w-full rounded-xl">
                    <Link href="/account/invoices">View all invoices</Link>
                  </Button>
                </>
              ) : (
                <div className="flex flex-col items-center py-2 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100">
                    <Receipt className="h-6 w-6 text-gray-400" strokeWidth={1.5} />
                  </div>
                  <p className="mt-3 text-sm font-semibold text-gray-900">No invoice yet</p>
                  <p className="mt-1 text-xs leading-relaxed text-gray-500">
                    Your invoices will appear here once you complete a paid clean.
                  </p>
                  <Button asChild variant="outline" size="sm" className="mt-4 w-full rounded-xl">
                    <Link href="/account/invoices">
                      {hasAnyInvoices ? "View past invoices" : "View invoices"}
                    </Link>
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* My properties */}
          <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
              <h2 className="text-sm font-semibold text-gray-900">My properties</h2>
              <Link href="/account/addresses" className="flex items-center gap-0.5 text-xs font-medium text-blue-600 hover:underline">
                View all <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="p-5">
              {addrLoading ? (
                <div className="h-20 animate-pulse rounded-xl bg-gray-100" />
              ) : defaultAddr ? (
                <>
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100">
                      <Home className="h-5 w-5 text-blue-600" strokeWidth={1.75} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap gap-1.5">
                        <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
                          {defaultAddr.label || "Home"}
                        </span>
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
                          Primary
                        </span>
                      </div>
                      <p className="mt-2 text-sm font-medium text-gray-900">{defaultAddr.line1}</p>
                      <p className="text-sm text-gray-500">
                        {defaultAddr.suburb}, {defaultAddr.city} {defaultAddr.postal_code}
                      </p>
                    </div>
                  </div>
                  <Button asChild variant="outline" size="sm" className="mt-4 w-full rounded-xl">
                    <Link href="/account/addresses">Manage properties</Link>
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-500">Save properties to book faster.</p>
                  <Button asChild variant="outline" size="sm" className="mt-4 w-full rounded-xl">
                    <Link href="/account/addresses">Add a property</Link>
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* We're here to help */}
          <HelpCard />
        </div>
      </div>

      {/* ── Trust bar ── */}
      <div className="pt-2">
        <TrustBar />
      </div>
    </div>
  );
}
