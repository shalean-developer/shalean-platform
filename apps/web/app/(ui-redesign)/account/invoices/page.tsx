"use client";

import Link from "next/link";
import { useMemo } from "react";
import { AlertCircle, CheckCircle2, Clock, FileText, Receipt } from "lucide-react";
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
import { Card, CardContent } from "@/components/ui/card";

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
      <div className="space-y-6" aria-hidden>
        <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl border border-border bg-card" />
          ))}
        </div>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl border border-border bg-card" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Monthly billing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One consolidated bill per month for all your cleaning visits.
        </p>
      </header>

      {error ? (
        <Card className="border-destructive/30 bg-destructive/5" role="alert">
          <CardContent className="flex flex-wrap items-center gap-3 p-4 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1 break-words">{error}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {overdueInvoice ? (
        <Card className="border-destructive/30 bg-destructive/5" role="alert">
          <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start">
            <AlertCircle className="h-5 w-5 shrink-0 text-destructive" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-foreground">Payment overdue</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {invoiceOverdueEscalationText(daysPastDueJhb(overdueInvoice.due_date, new Date()))}
              </p>
            </div>
            <Button asChild size="sm" className="w-full shrink-0 sm:w-auto">
              <Link href={`/account/invoices/${overdueInvoice.id}`}>Pay now</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {hasAny ? (
        <section aria-label="Invoice overview" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            icon={FileText}
            iconBg="bg-primary/10"
            iconColor="text-primary"
            value={stats.totalCount}
            label="Total invoices"
          />
          <StatCard
            icon={CheckCircle2}
            iconBg="bg-success/10"
            iconColor="text-success"
            value={stats.paid}
            label="Paid"
          />
          <StatCard
            icon={Clock}
            iconBg="bg-warning/15"
            iconColor="text-warning-foreground"
            value={stats.pending}
            label="Pending"
          />
          <StatCard
            icon={Receipt}
            iconBg="bg-primary/10"
            iconColor="text-primary"
            value={formatZarFromCents(stats.totalPaidCents)}
            label="Total paid"
          />
        </section>
      ) : null}

      {!hasAny ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center p-10 text-center sm:p-12">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Receipt className="h-8 w-8" strokeWidth={1.5} aria-hidden />
            </div>
            <h2 className="mt-5 text-lg font-semibold text-foreground">No invoices yet</h2>
            <p className="mt-2 max-w-xs text-sm text-muted-foreground">
              Once you complete your first paid clean, your invoice will appear here.
            </p>
            <Button asChild size="lg" className="mt-6">
              <Link href="/account/book">Book a clean</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {sorted.length > 0 ? (
            <section aria-labelledby="monthly-invoices-heading">
              <h2 id="monthly-invoices-heading" className="mb-4 text-base font-semibold text-foreground">
                Monthly invoices
              </h2>
              <div className="space-y-3">
                {sorted.map((inv) => (
                  <InvoiceCard key={inv.id} invoice={inv} />
                ))}
              </div>
            </section>
          ) : null}

          {perBookingInvoices.length > 0 ? (
            <section aria-labelledby="per-visit-invoices-heading">
              <h2 id="per-visit-invoices-heading" className="mb-4 text-base font-semibold text-foreground">
                Per-visit invoices
              </h2>
              <div className="space-y-3">
                {perBookingInvoices.map((inv) => (
                  <PerBookingInvoiceCard key={inv.bookingId} invoice={inv} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex items-start gap-4 p-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <FileText className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-foreground">Questions about your invoice?</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Contact us on WhatsApp for billing queries, payment confirmations, or adjustments.
            </p>
            <Button asChild size="sm" className="mt-3">
              <a href="https://wa.me/27825915525" target="_blank" rel="noopener noreferrer">
                Chat on WhatsApp
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      <HelpCard />
    </div>
  );
}
