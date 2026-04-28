"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Calendar, MapPin, Sparkles, Repeat, FileText } from "lucide-react";
import { useDashboardSummary } from "@/hooks/useDashboardSummary";
import { useAddresses } from "@/hooks/useAddresses";
import { formatBookingWhen } from "@/lib/dashboard/bookingUtils";
import { formatZarFromCents } from "@/lib/dashboard/formatZar";
import { customerMonthlyInvoiceStatusLabel } from "@/lib/dashboard/monthlyInvoiceUi";
import { invoiceOverdueEscalationText } from "@/lib/dashboard/invoiceOverdueEscalation";
import { PageHeader } from "@/components/dashboard/page-header";
import { BookingCard } from "@/components/dashboard/booking-card";
import { CustomerBookingStatusBadge } from "@/components/dashboard/customer-booking-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { DashboardPageSkeleton } from "@/components/dashboard/dashboard-skeletons";
import { Badge } from "@/components/ui/badge";

export default function DashboardHomePage() {
  const { summary, loading, error, refetch } = useDashboardSummary();
  const { addresses, loading: addrLoading } = useAddresses();

  const ym = summary?.ym ?? "";
  const nextBooking = summary?.nextBooking ?? null;
  const recent = summary?.recentBookings ?? [];
  const bookingsThisMonthCount = summary?.bookingsThisMonthCount ?? 0;
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

  const defaultAddr = useMemo(() => addresses.find((a) => a.is_default) ?? addresses[0], [addresses]);

  if (loading) {
    return <DashboardPageSkeleton />;
  }

  return (
    <div>
      <PageHeader title="Dashboard" description="Your home for bookings, monthly billing, and quick actions." />

      {error ? (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}{" "}
          <button type="button" className="font-semibold underline" onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="space-y-4 lg:col-span-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Next booking</h2>
          {nextBooking ? (
            <Card className="rounded-2xl border-zinc-200/80 bg-white shadow-md dark:border-zinc-800 dark:bg-zinc-900">
              <CardContent className="p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{nextBooking.serviceName}</p>
                    <p className="mt-2 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                      <Calendar className="h-4 w-4 text-blue-600" />
                      {formatBookingWhen(nextBooking.date, nextBooking.time)}
                    </p>
                    <p className="mt-1 flex items-start gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                      {nextBooking.addressLine}, {nextBooking.suburb}
                    </p>
                    {nextBooking.cleaner ? (
                      <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
                        Cleaner: <span className="font-medium">{nextBooking.cleaner.name}</span>
                      </p>
                    ) : (
                      <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">We&apos;ll assign a cleaner soon.</p>
                    )}
                  </div>
                  <CustomerBookingStatusBadge booking={nextBooking} />
                </div>
                <Separator className="my-5" />
                <Button asChild size="lg" className="w-full rounded-xl sm:w-auto">
                  <Link href={`/dashboard/bookings/${nextBooking.id}`}>View Details</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="rounded-2xl border-dashed border-zinc-300 bg-white p-8 text-center dark:border-zinc-600 dark:bg-zinc-900">
              <p className="font-medium text-zinc-900 dark:text-zinc-50">No upcoming cleans</p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Book your next visit in a few taps.</p>
              <Button asChild size="lg" className="mt-4 rounded-xl">
                <Link href="/dashboard/book">Book Cleaning</Link>
              </Button>
            </Card>
          )}

          <Card className="rounded-2xl border-zinc-200/80 bg-white shadow-md dark:border-zinc-800 dark:bg-zinc-900">
            <CardContent className="p-5 sm:p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">This month</h2>
              <p className="mt-3 text-3xl font-bold tabular-nums text-zinc-900 dark:text-zinc-50">{bookingsThisMonthCount}</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">Bookings scheduled in {ym}</p>
            </CardContent>
          </Card>

          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Quick actions</h2>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="xl" className="w-full rounded-2xl sm:flex-1">
                <Link href="/dashboard/book">
                  <Sparkles className="h-5 w-5" />
                  Book Cleaning
                </Link>
              </Button>
              <Button asChild variant="outline" size="xl" className="w-full rounded-2xl sm:flex-1">
                <Link href="/dashboard/bookings">
                  <Repeat className="h-5 w-5" />
                  All bookings
                </Link>
              </Button>
              <Button asChild variant="outline" size="xl" className="w-full rounded-2xl sm:flex-1">
                <Link href="/dashboard/invoices">
                  <FileText className="h-5 w-5" />
                  Invoices
                </Link>
              </Button>
            </div>
          </div>
        </section>

        <div className="space-y-6">
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Invoice summary</h2>
            <Card className="rounded-2xl border-zinc-200/80 bg-white shadow-md dark:border-zinc-800 dark:bg-zinc-900">
              <CardContent className="p-5">
                {invoiceThisMonth ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                        {invoiceThisMonth.month} · {customerMonthlyInvoiceStatusLabel(invoiceThisMonth.status)}
                      </p>
                      {isOverdue ? (
                        <Badge variant="destructive" className="text-[10px] uppercase">
                          Overdue
                        </Badge>
                      ) : null}
                    </div>
                    {isOverdue ? (
                      <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">
                        {invoiceOverdueEscalationText(daysOverdue)}
                      </p>
                    ) : null}
                    {hasOverdueInvoice && !isOverdue ? (
                      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                        You have an overdue invoice in another month — see{" "}
                        <Link href="/dashboard/invoices" className="font-medium text-blue-600 underline">
                          Invoices
                        </Link>
                        .
                      </p>
                    ) : null}
                    <dl className="mt-4 space-y-3 text-sm">
                      <div className="flex justify-between gap-2">
                        <dt className="text-zinc-500">Total</dt>
                        <dd className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                          {formatZarFromCents(invoiceThisMonth.total_amount_cents)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-zinc-500">Paid</dt>
                        <dd className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                          {formatZarFromCents(invoiceThisMonth.amount_paid_cents)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-zinc-500">Balance</dt>
                        <dd className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                          {formatZarFromCents(balanceCents)}
                        </dd>
                      </div>
                    </dl>
                    <Button asChild variant="outline" size="sm" className="mt-4 w-full rounded-xl">
                      <Link href={`/dashboard/invoices/${invoiceThisMonth.id}`}>View invoice</Link>
                    </Button>
                    <Button asChild variant="ghost" size="sm" className="mt-2 w-full rounded-xl text-blue-600">
                      <Link href="/dashboard/invoices">All invoices</Link>
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      No invoice yet—your bookings will appear here once this month&apos;s bill is opened.
                    </p>
                    {hasAnyInvoices ? (
                      <Button asChild variant="outline" size="sm" className="mt-4 w-full rounded-xl">
                        <Link href="/dashboard/invoices">View past invoices</Link>
                      </Button>
                    ) : null}
                  </>
                )}
              </CardContent>
            </Card>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">My properties</h2>
            <Card className="rounded-2xl border-zinc-200/80 bg-white shadow-md dark:border-zinc-800 dark:bg-zinc-900">
              <CardContent className="p-5">
                {addrLoading ? (
                  <div className="h-20 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
                ) : defaultAddr ? (
                  <>
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">{defaultAddr.label}</p>
                    <p className="mt-2 text-sm font-medium text-zinc-900 dark:text-zinc-50">{defaultAddr.line1}</p>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      {defaultAddr.suburb}, {defaultAddr.city} {defaultAddr.postal_code}
                    </p>
                    <Button asChild variant="outline" size="sm" className="mt-4 w-full rounded-xl">
                      <Link href="/dashboard/addresses">Manage properties</Link>
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">Save properties to book faster.</p>
                    <Button asChild variant="outline" size="sm" className="mt-4 w-full rounded-xl">
                      <Link href="/dashboard/addresses">Add a property</Link>
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </section>
        </div>
      </div>

      <section className="mt-10">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Recent bookings</h2>
          <Link href="/dashboard/bookings" className="text-sm font-medium text-blue-600 hover:underline">
            View all
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="text-sm text-zinc-500">No bookings yet.</p>
        ) : (
          <ul className="space-y-4">
            {recent.map((b) => (
              <li key={b.id}>
                <BookingCard booking={b} showActions={false} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
