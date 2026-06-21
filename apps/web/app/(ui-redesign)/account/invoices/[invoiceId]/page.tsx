"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMonthlyInvoiceDetail } from "@/hooks/useMonthlyInvoices";
import { formatZarFromCents } from "@/lib/dashboard/formatZar";
import { daysPastDueJhb, invoiceOverdueEscalationText } from "@/lib/dashboard/invoiceOverdueEscalation";
import { customerMonthlyInvoiceStatusLabel } from "@/lib/dashboard/monthlyInvoiceUi";
import { trustMonthlyInvoicePayPageUrl } from "@/lib/pay/trustPayPageUrl";
import { CustomerInvoiceTimeline } from "@/components/dashboard/customer-invoice-timeline";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 rounded-xl bg-muted" />
        <div className="h-64 rounded-2xl bg-muted" />
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-foreground">Invoice</h1>
        <p className="text-sm text-red-600">{error ?? "Not found."}</p>
        <Button asChild variant="outline" className="rounded-xl">
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
  const payHref =
    paymentLink && paystackRef
      ? trustMonthlyInvoicePayPageUrl(invoice.id, paystackRef, paymentLink)
      : paymentLink;
  const canOfferPay = balance > 0 && invoice.status !== "paid";

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 rounded-lg text-blue-600">
          <Link href="/account/invoices">← All invoices</Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{monthLabel(invoice.month)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {customerMonthlyInvoiceStatusLabel(invoice.status)} · Due {fmtDueYmd(invoice.due_date)}
          </p>
        </div>
        {invoice.is_overdue && invoice.status !== "paid" ? (
          <Badge variant="destructive" className="rounded-lg text-[10px] uppercase">
            Overdue
          </Badge>
        ) : null}
      </div>

      {invoice.is_overdue && invoice.status !== "paid" ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          <p className="font-semibold">Payment overdue</p>
          <p className="mt-1 text-amber-900/90 dark:text-amber-200/90">
            {invoiceOverdueEscalationText(daysPastDueJhb(invoice.due_date, new Date()))}
          </p>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-2xl border-border bg-card shadow-sm">
          <CardContent className="p-6">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Amounts</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Total</dt>
                <dd className="font-semibold tabular-nums text-foreground">{formatZarFromCents(invoice.total_amount_cents)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Paid</dt>
                <dd className="font-semibold tabular-nums text-foreground">{formatZarFromCents(invoice.amount_paid_cents)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Balance</dt>
                <dd className="font-semibold tabular-nums text-foreground">{formatZarFromCents(balance)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Visits</dt>
                <dd className="font-semibold tabular-nums text-foreground">{invoice.total_bookings}</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-muted-foreground">
              Payments for monthly billing are handled outside this screen when we send your invoice. Contact support if you need help.
            </p>
            {canOfferPay ? (
              <div className="mt-4">
                {payHref ? (
                  <Button asChild size="lg" className="w-full rounded-xl">
                    <a href={payHref} target="_blank" rel="noopener noreferrer">
                      Pay now
                    </a>
                  </Button>
                ) : (
                  <Button type="button" size="lg" className="w-full rounded-xl" disabled>
                    Pay now
                  </Button>
                )}
              </div>
            ) : null}
            <Button asChild variant="outline" size="sm" className="mt-4 w-full rounded-xl">
              <a
                href={`/api/account/invoices/monthly/${invoice.id}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Download PDF
              </a>
            </Button>
            <Button type="button" variant="outline" size="sm" className="mt-4 rounded-xl" onClick={() => void refetch()}>
              Refresh
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border bg-card shadow-sm">
          <CardContent className="p-6">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Activity</h2>
            <div className="mt-4">
              <CustomerInvoiceTimeline invoice={invoice} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
