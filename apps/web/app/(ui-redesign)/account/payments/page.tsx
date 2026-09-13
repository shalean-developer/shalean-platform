"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  CreditCard,
  Lock,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useBookings } from "@/hooks/useBookings";
import { HelpCard } from "@/components/account/HelpCard";
import { StatCard } from "@/components/account/StatCard";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  customerPaymentRowDisplay,
  type CustomerPaymentBadgeTone,
} from "@/lib/dashboard/customerPaymentDisplay";
import {
  CUSTOMER_ACCOUNT_INVOICES_PATH,
  customerBookingDetailPath,
} from "@/lib/customer/customerAccountPaths";
import { cn } from "@/lib/utils";

const BADGE_VARIANT: Record<CustomerPaymentBadgeTone, BadgeVariant> = {
  success: "success",
  warning: "warning",
  neutral: "outline",
  error: "destructive",
};

const BADGE_ICON: Record<CustomerPaymentBadgeTone, typeof CheckCircle2> = {
  success: CheckCircle2,
  warning: Clock,
  neutral: XCircle,
  error: XCircle,
};

function PaymentStatusBadge({ label, tone }: { label: string; tone: CustomerPaymentBadgeTone }) {
  const Icon = BADGE_ICON[tone];
  return (
    <Badge variant={BADGE_VARIANT[tone]} className="gap-1 normal-case tracking-normal">
      <Icon className="h-3 w-3" aria-hidden />
      {label}
    </Badge>
  );
}

export default function AccountPaymentsPage() {
  const { bookings, loading, error, refetch } = useBookings();

  const rows = useMemo(
    () => [...bookings].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [bookings],
  );

  const rowDisplays = useMemo(
    () => rows.map((b) => ({ booking: b, display: customerPaymentRowDisplay(b) })),
    [rows],
  );

  const stats = useMemo(() => {
    const paidRows = rowDisplays.filter((r) => r.display.countsAsPaidTransaction);
    const totalPaid = paidRows.reduce((s, r) => s + r.booking.priceZar, 0);
    const txCount = paidRows.length;
    const avgSpend = txCount > 0 ? Math.round(totalPaid / txCount) : 0;
    return { totalPaid, txCount, avgSpend };
  }, [rowDisplays]);

  if (loading) {
    return (
      <div className="space-y-6" aria-hidden>
        <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl border border-border bg-card" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-2xl border border-border bg-card" />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Payments</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your payment history and receipts linked to each booking.
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

      {rows.length > 0 ? (
        <section aria-label="Payment overview" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard
            icon={CreditCard}
            iconBg="bg-primary/10"
            iconColor="text-primary"
            value={stats.txCount}
            label="Payments made"
          />
          <StatCard
            icon={CheckCircle2}
            iconBg="bg-success/10"
            iconColor="text-success"
            value={`R ${stats.totalPaid.toLocaleString("en-ZA")}`}
            label="Total paid"
          />
          <StatCard
            icon={CreditCard}
            iconBg="bg-primary/10"
            iconColor="text-primary"
            value={`R ${stats.avgSpend.toLocaleString("en-ZA")}`}
            label="Avg. per booking"
          />
        </section>
      ) : null}

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <CreditCard className="h-6 w-6" strokeWidth={1.75} aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-foreground">Paystack &amp; monthly billing</p>
              <p className="mt-1 text-sm text-muted-foreground">
                One-off bookings are paid securely at checkout. Monthly plan visits appear on your invoice until billed.
                If a refund is issued, this list shows Partially refunded or Fully refunded — bank timing is usually 5–10
                business days. Contact support if you need help.
              </p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm" className="w-full shrink-0 sm:w-auto">
            <Link href={CUSTOMER_ACCOUNT_INVOICES_PATH}>View invoices</Link>
          </Button>
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center p-10 text-center sm:p-12">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <CreditCard className="h-8 w-8" strokeWidth={1.5} aria-hidden />
            </div>
            <h2 className="mt-5 text-lg font-semibold text-foreground">No payments yet</h2>
            <p className="mt-2 max-w-xs text-sm text-muted-foreground">
              Your payment history will appear here once you&apos;ve made your first booking.
            </p>
          </CardContent>
        </Card>
      ) : (
        <section aria-labelledby="payment-history-heading">
          <h2 id="payment-history-heading" className="mb-4 text-base font-semibold text-foreground">
            Payment history
          </h2>
          <Card className="overflow-hidden">
            <div className="divide-y divide-border">
              {rowDisplays.map(({ booking: b, display }) => {
                const dateLabel = new Date(b.createdAt).toLocaleDateString("en-ZA", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                });
                const iconTone = display.countsAsPaidTransaction ? "success" : display.rowMuted ? "error" : "warning";
                return (
                  <Link
                    key={b.id}
                    href={customerBookingDetailPath(b.id)}
                    className={cn(
                      "flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-muted/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring sm:flex-row sm:items-center sm:justify-between",
                      display.rowMuted && "bg-destructive/5",
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-4">
                      <div
                        className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                          iconTone === "success"
                            ? "bg-success/10 text-success"
                            : iconTone === "warning"
                              ? "bg-warning/15 text-warning-foreground"
                              : "bg-destructive/10 text-destructive",
                        )}
                      >
                        <CreditCard className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                      </div>
                      <div className="min-w-0">
                        <p className="break-words text-sm font-semibold text-foreground">{b.serviceName}</p>
                        <p className="text-xs text-muted-foreground">{dateLabel}</p>
                        {b.paystackReference ? (
                          <p className="break-all text-xs text-muted-foreground">Ref: {b.paystackReference}</p>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                      <p className="text-lg font-bold tabular-nums text-foreground">
                        R {b.priceZar.toLocaleString("en-ZA")}
                      </p>
                      <PaymentStatusBadge label={display.badgeLabel} tone={display.badgeTone} />
                    </div>
                  </Link>
                );
              })}
            </div>
          </Card>
        </section>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="flex items-start gap-4 p-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-success/10 text-success">
              <Lock className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            </div>
            <div>
              <p className="font-semibold text-foreground">100% Secure payments</p>
              <p className="mt-1 text-sm text-muted-foreground">
                All transactions are encrypted and processed by Paystack. We never store your card details.
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-start gap-4 p-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ShieldCheck className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            </div>
            <div>
              <p className="font-semibold text-foreground">Dispute protection</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Not satisfied? Contact us within 48 hours and we&apos;ll make it right or issue a refund.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <HelpCard />
    </div>
  );
}
