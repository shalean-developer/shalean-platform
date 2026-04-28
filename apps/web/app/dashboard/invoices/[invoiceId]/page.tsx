"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMonthlyInvoiceDetail } from "@/hooks/useMonthlyInvoices";
import { formatZarFromCents } from "@/lib/dashboard/formatZar";
import { daysPastDueJhb, invoiceOverdueEscalationText } from "@/lib/dashboard/invoiceOverdueEscalation";
import { customerMonthlyInvoiceStatusLabel } from "@/lib/dashboard/monthlyInvoiceUi";
import { PageHeader } from "@/components/dashboard/page-header";
import { CustomerInvoiceTimeline } from "@/components/dashboard/customer-invoice-timeline";
import { DashboardPageSkeleton } from "@/components/dashboard/dashboard-skeletons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function monthLabel(ym: string): string {
  if (!/^\d{4}-\d{2}$/.test(ym)) return ym;
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-ZA", { month: "long", year: "numeric" });
}

function fmtDueYmd(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  const [y, M, d] = ymd.split("-").map(Number);
  return new Date(y, M - 1, d).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

export default function DashboardInvoiceDetailPage() {
  const params = useParams();
  const rawId = params?.invoiceId;
  const invoiceId = typeof rawId === "string" ? rawId : Array.isArray(rawId) ? rawId[0] : undefined;
  const { invoice, loading, error, refetch } = useMonthlyInvoiceDetail(invoiceId);

  if (loading) {
    return <DashboardPageSkeleton />;
  }

  if (error || !invoice) {
    return (
      <div>
        <PageHeader title="Invoice" description="We could not load this invoice." />
        <p className="text-sm text-red-700 dark:text-red-300">{error ?? "Not found."}</p>
        <Button asChild variant="outline" className="mt-4 rounded-xl">
          <Link href="/dashboard/invoices">Back to invoices</Link>
        </Button>
      </div>
    );
  }

  const balance =
    typeof invoice.balance_cents === "number" && Number.isFinite(invoice.balance_cents)
      ? invoice.balance_cents
      : Math.max(0, invoice.total_amount_cents - invoice.amount_paid_cents);

  const payHref = typeof invoice.payment_link === "string" ? invoice.payment_link.trim() : "";
  const canOfferPay = balance > 0 && invoice.status !== "paid";

  return (
    <div>
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm" className="-ml-2 rounded-lg text-blue-600">
          <Link href="/dashboard/invoices">← All invoices</Link>
        </Button>
      </div>
      <PageHeader
        title={monthLabel(invoice.month)}
        description={`${customerMonthlyInvoiceStatusLabel(invoice.status)} · Due ${fmtDueYmd(invoice.due_date)}`}
        action={
          invoice.is_overdue && invoice.status !== "paid" ? (
            <Badge variant="destructive" className="rounded-lg text-[10px] uppercase">
              Overdue
            </Badge>
          ) : undefined
        }
      />

      {invoice.is_overdue && invoice.status !== "paid" ? (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          <p className="font-semibold">Payment overdue</p>
          <p className="mt-1 text-amber-900/90 dark:text-amber-200/90">
            {invoiceOverdueEscalationText(daysPastDueJhb(invoice.due_date, new Date()))}
          </p>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-2xl border-zinc-200/80 bg-white shadow-md dark:border-zinc-800 dark:bg-zinc-900">
          <CardContent className="p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Amounts</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-zinc-500">Total</dt>
                <dd className="font-semibold tabular-nums">{formatZarFromCents(invoice.total_amount_cents)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-zinc-500">Paid</dt>
                <dd className="font-semibold tabular-nums">{formatZarFromCents(invoice.amount_paid_cents)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-zinc-500">Balance</dt>
                <dd className="font-semibold tabular-nums">{formatZarFromCents(balance)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-zinc-500">Visits</dt>
                <dd className="font-semibold tabular-nums">{invoice.total_bookings}</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-zinc-500">
              Payments for monthly billing are handled outside this screen when we send your invoice. If you need help, contact support.
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
                  <span className="block w-full" title="Payment link not available yet">
                    <Button type="button" size="lg" className="w-full rounded-xl" disabled>
                      Pay now
                    </Button>
                  </span>
                )}
              </div>
            ) : null}
            <Button type="button" variant="outline" size="sm" className="mt-4 rounded-xl" onClick={() => void refetch()}>
              Refresh
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-zinc-200/80 bg-white shadow-md dark:border-zinc-800 dark:bg-zinc-900">
          <CardContent className="p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Activity</h2>
            <div className="mt-4">
              <CustomerInvoiceTimeline invoice={invoice} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
