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
import { Button } from "@/components/ui/button";
import {
  customerPaymentRowDisplay,
  type CustomerPaymentBadgeTone,
} from "@/lib/dashboard/customerPaymentDisplay";
import {
  CUSTOMER_ACCOUNT_INVOICES_PATH,
  customerBookingDetailPath,
} from "@/lib/customer/customerAccountPaths";
import { cn } from "@/lib/utils";

const BADGE_TONE_CLASS: Record<CustomerPaymentBadgeTone, string> = {
  success: "bg-green-100 text-green-700",
  warning: "bg-amber-100 text-amber-800",
  neutral: "bg-gray-100 text-gray-700",
  error: "bg-red-100 text-red-700",
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
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        BADGE_TONE_CLASS[tone],
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
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
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 rounded-xl bg-gray-100" />
        <div className="grid grid-cols-3 gap-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-24 rounded-2xl bg-gray-100" />)}
        </div>
        <div className="h-64 rounded-2xl bg-gray-100" />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Payments</h1>
        <p className="mt-1 text-sm text-gray-500">
          Your payment history and receipts linked to each booking.
        </p>
      </div>

      {error ? (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}{" "}
          <button type="button" className="font-semibold underline" onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      ) : null}

      {rows.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard
            icon={CreditCard}
            iconBg="bg-blue-100"
            iconColor="text-blue-600"
            value={stats.txCount}
            label="Payments made"
          />
          <StatCard
            icon={CheckCircle2}
            iconBg="bg-green-100"
            iconColor="text-green-600"
            value={`R ${stats.totalPaid.toLocaleString("en-ZA")}`}
            label="Total paid"
          />
          <StatCard
            icon={CreditCard}
            iconBg="bg-violet-100"
            iconColor="text-violet-600"
            value={`R ${stats.avgSpend.toLocaleString("en-ZA")}`}
            label="Avg. per booking"
          />
        </div>
      ) : null}

      <div className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-100">
              <CreditCard className="h-6 w-6 text-blue-600" strokeWidth={1.75} />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Paystack &amp; monthly billing</p>
              <p className="mt-1 text-sm text-gray-500">
                One-off bookings are paid securely at checkout. Monthly plan visits appear on your invoice until billed.
                If a refund is issued, this list shows Partially refunded or Fully refunded — bank timing is usually 5–10
                business days. Contact support if you need help.
              </p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm" className="shrink-0 rounded-xl">
            <Link href={CUSTOMER_ACCOUNT_INVOICES_PATH}>View invoices</Link>
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white p-12 text-center shadow-sm">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50">
            <CreditCard className="h-8 w-8 text-blue-400" strokeWidth={1.5} />
          </div>
          <h2 className="mt-5 text-lg font-semibold text-gray-900">No payments yet</h2>
          <p className="mt-2 max-w-xs text-sm text-gray-500">
            Your payment history will appear here once you&apos;ve made your first booking.
          </p>
        </div>
      ) : (
        <section>
          <h2 className="mb-4 text-base font-semibold text-gray-900">Payment history</h2>
          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="divide-y divide-gray-100">
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
                      "flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-gray-50 sm:flex-row sm:items-center sm:justify-between",
                      display.rowMuted && "bg-red-50/30",
                    )}
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                          iconTone === "success"
                            ? "bg-green-100"
                            : iconTone === "warning"
                              ? "bg-amber-100"
                              : "bg-red-100",
                        )}
                      >
                        <CreditCard
                          className={cn(
                            "h-5 w-5",
                            iconTone === "success"
                              ? "text-green-600"
                              : iconTone === "warning"
                                ? "text-amber-600"
                                : "text-red-500",
                          )}
                          strokeWidth={1.75}
                        />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{b.serviceName}</p>
                        <p className="text-xs text-gray-500">{dateLabel}</p>
                        {b.paystackReference ? (
                          <p className="text-xs text-gray-400">Ref: {b.paystackReference}</p>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="text-lg font-bold tabular-nums text-gray-900">
                        R {b.priceZar.toLocaleString("en-ZA")}
                      </p>
                      <PaymentStatusBadge label={display.badgeLabel} tone={display.badgeTone} />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex items-start gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-100">
            <Lock className="h-5 w-5 text-green-600" strokeWidth={1.75} />
          </div>
          <div>
            <p className="font-semibold text-gray-900">100% Secure payments</p>
            <p className="mt-1 text-sm text-gray-500">
              All transactions are encrypted and processed by Paystack. We never store your card details.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100">
            <ShieldCheck className="h-5 w-5 text-blue-600" strokeWidth={1.75} />
          </div>
          <div>
            <p className="font-semibold text-gray-900">Dispute protection</p>
            <p className="mt-1 text-sm text-gray-500">
              Not satisfied? Contact us within 48 hours and we&apos;ll make it right or issue a refund.
            </p>
          </div>
        </div>
      </div>

      <HelpCard />
    </div>
  );
}
