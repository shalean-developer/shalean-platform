"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMonthlyInvoiceBookings, useMonthlyInvoiceDetail } from "@/hooks/useMonthlyInvoices";
import { serviceLabelFromBookingRow } from "@/lib/booking/bookingV2CustomerDisplay";
import { formatBookingWhen } from "@/lib/dashboard/bookingUtils";
import { customerBookingDetailPath } from "@/lib/customer/customerAccountPaths";
import { formatZarFromCents } from "@/lib/dashboard/formatZar";
import { daysPastDueJhb, invoiceOverdueEscalationText } from "@/lib/dashboard/invoiceOverdueEscalation";
import { customerMonthlyInvoiceStatusLabel } from "@/lib/dashboard/monthlyInvoiceUi";
import { trustMonthlyInvoicePayPageUrl } from "@/lib/pay/trustPayPageUrl";
import { CustomerInvoiceTimeline } from "@/components/dashboard/customer-invoice-timeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function monthLabel(ym: string): string {
  if (!/^\d{4}-\d{2}$/.test(ym)) return ym;
  const [y, m] = ym.split("-").map(Number);
  return new Date(y!, m! - 1, 1).toLocaleDateString("en-ZA", { month: "long", year: "numeric" });
}

function fmtDueYmd(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  const [y, M, d] = ymd.split("-").map(Number);
  return new Date(y!, M! - 1, d!).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

export default function AccountInvoiceDetailPage() {
  const params = useParams();
  const rawId = params?.invoiceId;
  const invoiceId = typeof rawId === "string" ? rawId : Array.isArray(rawId) ? rawId[0] : undefined;
  const { invoice, loading, error, refetch } = useMonthlyInvoiceDetail(invoiceId);
  const {
    bookings: invoiceBookings,
    loading: bookingsLoading,
    error: bookingsError,
  } = useMonthlyInvoiceBookings(invoiceId);

  if (loading) {
    return (
      <div className="space-y-4" aria-hidden>
        <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" />
        <div className="h-64 animate-pulse rounded-2xl border border-border bg-card" />
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-foreground">Invoice</h1>
        <Card className="border-destructive/30 bg-destructive/5" role="alert">
          <CardContent className="p-4 text-sm text-destructive">{error ?? "Not found."}</CardContent>
        </Card>
        <Button asChild variant="outline">
          <Link href="/account/invoices">Back to invoices</Link>
        </Button>
      </div>
    );
  }

  const balance =
    typeof invoice.balance_cents === "number" && Number.isFinite(invoice.balance_cents)
      ? invoice.balance_cents
      : Math.max(0, invoice.total_amount_cents - invoice.amount_paid_cents);

  const paymentLink = typeof invoice.payment_link === "string" ? invoice.payment_link.trim() : "";
  const paystackRef = typeof invoice.paystack_reference === "string" ? invoice.paystack_reference.trim() : "";
  // BILL-INV-002 Phase A: branded URL only when ref is present.
  const payHref = paystackRef
    ? trustMonthlyInvoicePayPageUrl(invoice.id, paystackRef, paymentLink || "")
    : "";
  const canOfferPay = balance > 0 && invoice.status !== "paid" && Boolean(payHref);
  const isOverdue = invoice.is_overdue && invoice.status !== "paid";

  return (
    <div className="space-y-6 pb-8">
      <Button asChild variant="ghost" size="sm" className="-ml-2 text-primary">
        <Link href="/account/invoices">← All invoices</Link>
      </Button>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-bold tracking-tight text-foreground">{monthLabel(invoice.month)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {customerMonthlyInvoiceStatusLabel(invoice.status)} · Due {fmtDueYmd(invoice.due_date)}
          </p>
        </div>
        {isOverdue ? <Badge variant="destructive">Overdue</Badge> : null}
      </header>

      {isOverdue ? (
        <Card className="border-destructive/30 bg-destructive/5" role="alert">
          <CardContent className="p-4">
            <p className="font-semibold text-foreground">Payment overdue</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {invoiceOverdueEscalationText(daysPastDueJhb(invoice.due_date, new Date()))}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="border-b border-border pb-4">
            <CardTitle className="text-base">Amounts</CardTitle>
          </CardHeader>
          <CardContent className="pt-5">
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Total</dt>
                <dd className="font-semibold tabular-nums text-foreground">{formatZarFromCents(invoice.total_amount_cents)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Paid</dt>
                <dd className="font-semibold tabular-nums text-foreground">{formatZarFromCents(invoice.amount_paid_cents)}</dd>
              </div>
              <div className="flex justify-between gap-3 border-t border-border pt-3">
                <dt className="font-medium text-foreground">Balance</dt>
                <dd className="font-bold tabular-nums text-foreground">{formatZarFromCents(balance)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Visits</dt>
                <dd className="font-semibold tabular-nums text-foreground">{invoice.total_bookings}</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-muted-foreground">
              Payments for monthly billing are handled outside this screen when we send your invoice. Contact support if you need help.
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {canOfferPay ? (
                payHref ? (
                  <Button asChild size="lg" className="w-full sm:w-auto">
                    <a href={payHref} target="_blank" rel="noopener noreferrer">
                      Pay now
                    </a>
                  </Button>
                ) : (
                  <Button type="button" size="lg" className="w-full sm:w-auto" disabled>
                    Pay now
                  </Button>
                )
              ) : null}
              <Button asChild variant="outline" className="w-full sm:w-auto">
                <a href={`/api/account/invoices/monthly/${invoice.id}/pdf`} target="_blank" rel="noopener noreferrer">
                  Download PDF
                </a>
              </Button>
              <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => void refetch()}>
                Refresh
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-border pb-4">
            <CardTitle className="text-base">Activity</CardTitle>
          </CardHeader>
          <CardContent className="pt-5">
            <CustomerInvoiceTimeline invoice={invoice} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="border-b border-border pb-4">
          <CardTitle className="text-base">Visits on this invoice</CardTitle>
        </CardHeader>
        <CardContent className="pt-5">
          {bookingsLoading ? (
            <p className="text-sm text-muted-foreground">Loading visits…</p>
          ) : bookingsError ? (
            <p className="text-sm text-destructive" role="alert">{bookingsError}</p>
          ) : invoiceBookings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No visits linked yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {invoiceBookings.map((b) => {
                const label =
                  serviceLabelFromBookingRow({ service: b.service, service_slug: b.service_slug }) ??
                  b.service ??
                  "Cleaning visit";
                const when = formatBookingWhen(b.date ?? "", b.time ?? "");
                const amount =
                  typeof b.total_paid_zar === "number" && Number.isFinite(b.total_paid_zar)
                    ? `R ${Math.round(b.total_paid_zar).toLocaleString("en-ZA")}`
                    : null;
                return (
                  <li key={b.id} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold text-foreground">{label}</p>
                      <p className="text-xs text-muted-foreground">{when}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                      {amount ? <p className="text-sm font-semibold tabular-nums text-foreground">{amount}</p> : null}
                      <Button asChild variant="ghost" size="sm" className="text-primary">
                        <Link href={customerBookingDetailPath(b.id)}>View booking</Link>
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
