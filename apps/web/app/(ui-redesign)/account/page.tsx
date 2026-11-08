"use client";
import Link from "next/link";
import { ArrowRight, CalendarDays, Clock, MapPin } from "lucide-react";
import { useDashboardSummary } from "@/hooks/useDashboardSummary";
import { CustomerBookingStatusBadge } from "@/components/dashboard/customer-booking-status-badge";
import { customerPaymentRowDisplay } from "@/lib/dashboard/customerPaymentDisplay";
import { formatZarFromCents } from "@/lib/dashboard/formatZar";
import type { DashboardBooking } from "@/lib/dashboard/types";
import { Button } from "@/components/ui/button";

function formatTimeRange(time: string, durationHours: number | null, scheduleConfirmed = true): string {
  if (!scheduleConfirmed || !time?.trim() || !/^\d{1,2}:\d{2}$/.test(time.trim())) {
    return "Time to be confirmed";
  }
  if (durationHours == null || !Number.isFinite(durationHours) || durationHours <= 0) {
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

function formatBookingDate(date: string): string {
  try {
    const d = new Date(date + "T00:00:00");
    return d.toLocaleDateString("en-ZA", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return date;
  }
}


function BookingSummary({ booking, next = false }: { booking: DashboardBooking; next?: boolean }) {
  const address = [booking.addressLine, booking.suburb].filter(Boolean).join(", ");
  return <div className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
    <div className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-[#00164e]">{booking.serviceName}</h3>
        <CustomerBookingStatusBadge booking={booking} />
      </div>
      <p className="flex items-center gap-2 text-sm text-muted-foreground"><CalendarDays className="h-4 w-4 shrink-0" aria-hidden />{formatBookingDate(booking.date)}</p>
      {next ? <>
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Clock className="h-4 w-4 shrink-0" aria-hidden />{formatTimeRange(booking.time, booking.durationHours, booking.scheduleConfirmed)}</p>
        {address ? <p className="flex items-start gap-2 break-words text-sm text-muted-foreground"><MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{address}</p> : null}
        {booking.cleaner?.name ? <p className="text-sm text-muted-foreground">Cleaner: {booking.cleaner.name}</p> : null}
      </> : null}
    </div>
    <div className="flex shrink-0 items-center justify-between gap-5 sm:flex-col sm:items-end sm:gap-2">
      <div className="sm:text-right">
        <p className="font-semibold tabular-nums text-[#00164e]">{formatZarFromCents(Math.round(booking.priceZar * 100))}</p>
        <p className="text-xs text-muted-foreground">Payment: {customerPaymentRowDisplay(booking).badgeLabel}</p>
      </div>
      <Link href={`/account/bookings/${booking.id}`} aria-label={`View ${booking.serviceName} booking on ${formatBookingDate(booking.date)}`} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">View booking <ArrowRight className="h-4 w-4" aria-hidden /></Link>
    </div>
  </div>;
}

export default function AccountHomePage() {
  const { summary, loading, error, refetch } = useDashboardSummary();
  const nextBooking = summary?.nextBooking;
  const recent = (summary?.recentBookings ?? []).filter((booking) => booking.id !== nextBooking?.id).slice(0, 3);
  const invoice = summary?.invoiceThisMonth;
  const balance = invoice ? Math.max(0, invoice.balance_cents ?? invoice.total_amount_cents - invoice.amount_paid_cents) : 0;
  const payableInvoice = invoice && ["sent", "partially_paid", "overdue"].includes(invoice.status) && balance > 0;
  return <div className="mx-auto max-w-5xl space-y-6 pb-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-semibold tracking-tight text-[#00164e]">Home</h1>
      <Button asChild className="min-h-12 rounded-md px-5 font-semibold hover:bg-[#0033a1]"><Link href="/account/book">Book a clean <ArrowRight className="h-4 w-4" aria-hidden /></Link></Button>
    </div>
    {loading ? <div className="animate-pulse space-y-5" role="status" aria-label="Loading account"><div className="h-40 rounded-xl border border-border bg-card" /><div className="h-56 rounded-xl border border-border bg-card" /><span className="sr-only">Loading account</span></div> : error ? <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/10 p-5 text-sm"><p>{error}</p><Button variant="outline" className="mt-3" onClick={() => void refetch()}>Retry</Button></div> : <>
      {payableInvoice || summary?.hasOverdueInvoice ? <section aria-labelledby="payment-heading" className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 p-5">
        <div><h2 id="payment-heading" className="font-semibold text-[#00164e]">{summary?.hasOverdueInvoice ? "Overdue invoice" : "Payment due"}</h2>{payableInvoice ? <p className="mt-1 text-sm">{formatZarFromCents(balance)} outstanding</p> : null}</div>
        <Button asChild variant="outline"><Link href="/account/invoices">View invoices</Link></Button>
      </section> : null}
      <section aria-labelledby="next-clean-heading" className="rounded-xl border border-blue-100 bg-white px-5 shadow-sm sm:px-6">
        <h2 id="next-clean-heading" className="border-b border-blue-100 py-4 text-lg font-semibold text-[#00164e]">Next clean</h2>
        {nextBooking ? <BookingSummary booking={nextBooking} next /> : <div className="flex items-center gap-3 py-7"><CalendarDays className="h-6 w-6 shrink-0 text-primary" aria-hidden /><p className="text-sm text-muted-foreground">No upcoming bookings.</p></div>}
      </section>
      <section aria-labelledby="recent-bookings-heading" className="rounded-xl border border-blue-100 bg-white px-5 shadow-sm sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-100 py-4"><h2 id="recent-bookings-heading" className="text-lg font-semibold text-[#00164e]">Recent bookings</h2><Link href="/account/bookings" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">View all</Link></div>
        {recent.length ? <ul className="divide-y divide-blue-100">{recent.map((booking) => <li key={booking.id}><BookingSummary booking={booking} /></li>)}</ul> : <p className="py-7 text-sm text-muted-foreground">No recent bookings.</p>}
      </section>
    </>}
  </div>;
}
