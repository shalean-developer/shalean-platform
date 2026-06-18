"use client";

import Link from "next/link";
import { useMemo } from "react";
import { FileText, CheckCircle2, Clock, AlertCircle, Receipt } from "lucide-react";
import { useMonthlyInvoices } from "@/hooks/useMonthlyInvoices";
import { useBookings } from "@/hooks/useBookings";
import { formatZarFromCents } from "@/lib/dashboard/formatZar";
import { daysPastDueJhb, invoiceOverdueEscalationText } from "@/lib/dashboard/invoiceOverdueEscalation";
import { perBookingInvoicesFromBookings } from "@/lib/dashboard/perBookingInvoice";
import { InvoiceCard } from "@/components/account/InvoiceCard";
import { PerBookingInvoiceCard } from "@/components/account/PerBookingInvoiceCard";
import { HelpCard } from "@/components/account/HelpCard";
import { StatCard } from "@/components/account/StatCard";
import { Button } from "@/components/ui/button";

export default function AccountInvoicesPage() {
  const { invoices, loading, error, refetch } = useMonthlyInvoices();
  const { bookings, loading: bookingsLoading } = useBookings();
  const sorted = useMemo(() => [...invoices].sort((a, b) => b.month.localeCompare(a.month)), [invoices]);

  const perBookingInvoices = useMemo(
    () => perBookingInvoicesFromBookings(bookings),
    [bookings],
  );

  const hasAny = sorted.length > 0 || perBookingInvoices.length > 0;

  const stats = useMemo(() => {
    const monthlyPaid = sorted.filter((i) => i.status === "paid").length;
    const pending = sorted.filter((i) => i.status !== "paid" && !i.is_overdue).length;
    const overdue = sorted.filter((i) => i.is_overdue && i.status !== "paid").length;
    const monthlyPaidCents = sorted
      .filter((i) => i.status === "paid")
      .reduce((s, i) => s + i.amount_paid_cents, 0);
    const perVisitPaidCents = perBookingInvoices.reduce((s, i) => s + Math.round(i.amountZar * 100), 0);
    const totalCount = sorted.length + perBookingInvoices.length;
    const paid = monthlyPaid + perBookingInvoices.length;
    return {
      totalCount,
      paid,
      pending,
      overdue,
      totalPaidCents: monthlyPaidCents + perVisitPaidCents,
    };
  }, [sorted, perBookingInvoices]);

  const overdueInvoice = useMemo(
    () => sorted.find((i) => i.is_overdue && i.status !== "paid"),
    [sorted],
  );

  if (loading || bookingsLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 rounded-xl bg-gray-100" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 rounded-2xl bg-gray-100" />)}
        </div>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-24 rounded-2xl bg-gray-100" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Monthly Invoices</h1>
        <p className="mt-1 text-sm text-gray-500">
          One consolidated bill per month for all your cleaning visits.
        </p>
      </div>

      {/* Error */}
      {error ? (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}{" "}
          <button type="button" className="font-semibold underline" onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      ) : null}

      {/* Overdue banner */}
      {overdueInvoice ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
            <div className="flex-1">
              <p className="font-semibold text-red-900">Payment overdue</p>
              <p className="mt-1 text-sm text-red-700">
                {invoiceOverdueEscalationText(daysPastDueJhb(overdueInvoice.due_date, new Date()))}
              </p>
            </div>
            <Button asChild size="sm" className="shrink-0 rounded-xl bg-red-600 text-white hover:bg-red-700">
              <Link href={`/account/invoices/${overdueInvoice.id}`}>Pay now</Link>
            </Button>
          </div>
        </div>
      ) : null}

      {/* Stats summary */}
      {hasAny ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            icon={FileText}
            iconBg="bg-blue-100"
            iconColor="text-blue-600"
            value={stats.totalCount}
            label="Total invoices"
          />
          <StatCard
            icon={CheckCircle2}
            iconBg="bg-green-100"
            iconColor="text-green-600"
            value={stats.paid}
            label="Paid"
          />
          <StatCard
            icon={Clock}
            iconBg="bg-amber-100"
            iconColor="text-amber-600"
            value={stats.pending}
            label="Pending"
          />
          <StatCard
            icon={Receipt}
            iconBg="bg-violet-100"
            iconColor="text-violet-600"
            value={formatZarFromCents(stats.totalPaidCents)}
            label="Total paid"
          />
        </div>
      ) : null}

      {/* Invoice list */}
      {!hasAny ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white p-12 text-center shadow-sm">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50">
            <Receipt className="h-8 w-8 text-blue-400" strokeWidth={1.5} />
          </div>
          <h2 className="mt-5 text-lg font-semibold text-gray-900">No invoices yet</h2>
          <p className="mt-2 max-w-xs text-sm text-gray-500">
            Once you complete your first paid clean, your invoice will appear here.
          </p>
          <Button asChild size="lg" className="mt-6 rounded-xl bg-blue-600 text-white hover:bg-blue-700">
            <Link href="/account/book">Book a clean</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Monthly invoices */}
          {sorted.length > 0 ? (
            <section>
              <h2 className="mb-4 text-base font-semibold text-gray-900">Monthly invoices</h2>
              <div className="space-y-3">
                {sorted.map((inv) => (
                  <InvoiceCard key={inv.id} invoice={inv} />
                ))}
              </div>
            </section>
          ) : null}

          {/* Per-visit invoices */}
          {perBookingInvoices.length > 0 ? (
            <section>
              <h2 className="mb-4 text-base font-semibold text-gray-900">Per-visit invoices</h2>
              <div className="space-y-3">
                {perBookingInvoices.map((inv) => (
                  <PerBookingInvoiceCard key={inv.bookingId} invoice={inv} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}

      {/* Payment support */}
      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600">
            <FileText className="h-5 w-5 text-white" strokeWidth={1.75} />
          </div>
          <div>
            <p className="font-semibold text-blue-900">Questions about your invoice?</p>
            <p className="mt-1 text-sm text-blue-700">
              Contact us on WhatsApp for billing queries, payment confirmations, or adjustments.
            </p>
            <a
              href="https://wa.me/27825915525"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Chat on WhatsApp
            </a>
          </div>
        </div>
      </div>

      {/* Help */}
      <HelpCard />
    </div>
  );
}
