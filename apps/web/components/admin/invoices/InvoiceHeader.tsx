import type { ReactNode } from "react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDate, formatInvoiceMonth } from "@/lib/admin/invoices/invoiceAdminFormatters";

export type InvoiceHeaderProps = {
  customerLabel: string;
  customerId: string;
  customerEmail: string | null;
  customerPhone: string | null;
  month: string;
  status: string;
  isOverdue: boolean;
  isClosed: boolean;
  currencyCode: string;
  totalAmountCents: number;
  amountPaidCents: number;
  balanceCents: number;
  /** Last time the monthly invoice email was sent (from `monthly_invoices.sent_at`). */
  sentAt: string | null;
  /** From `user_profiles.account_billing_risk`. */
  accountBillingRisk: "ok" | "at_risk";
  actions?: ReactNode;
};

function statusBadgeVariant(
  status: string,
): "default" | "success" | "warning" | "destructive" | "outline" {
  const s = status.toLowerCase();
  if (s === "paid") return "success";
  if (s === "draft") return "outline";
  if (s === "sent") return "default";
  if (s === "partially_paid") return "warning";
  if (s === "overdue") return "destructive";
  return "outline";
}

function whatsAppHref(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 9) return null;
  return `https://wa.me/${digits}`;
}

export function InvoiceHeader(props: InvoiceHeaderProps) {
  const st = props.status.toLowerCase();
  const settled = props.balanceCents <= 0;
  const wa = whatsAppHref(props.customerPhone);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-xl">Monthly invoice</CardTitle>
            <CardDescription className="text-base text-zinc-700 dark:text-zinc-200">
              <span className="font-medium text-zinc-900 dark:text-zinc-50">{props.customerLabel}</span>
              <span className="block text-xs font-normal text-zinc-500 dark:text-zinc-400">Customer ID: {props.customerId}</span>
            </CardDescription>
            <p className="pt-1 text-sm text-zinc-600 dark:text-zinc-300">
              Billing month: <span className="font-semibold text-zinc-900 dark:text-zinc-100">{formatInvoiceMonth(props.month)}</span>{" "}
              <span className="text-zinc-400">({props.month})</span>
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={statusBadgeVariant(st)}>{st.replace(/_/g, " ")}</Badge>
              {props.isOverdue ? <Badge variant="destructive">Overdue</Badge> : null}
              {props.accountBillingRisk === "at_risk" ? (
                <Badge variant="destructive" className="bg-amber-600 text-white hover:bg-amber-600 dark:bg-amber-700">
                  At risk
                </Badge>
              ) : null}
              {props.isClosed ? (
                <Badge variant="outline" className="uppercase">
                  Closed
                </Badge>
              ) : null}
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Last invoice email sent: {props.sentAt ? formatDate(props.sentAt) : "—"}
            </p>
            {props.actions ? <div className="w-full max-w-xl lg:w-auto">{props.actions}</div> : null}
          </div>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-700 dark:bg-zinc-800/40">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Contact</p>
          <div className="mt-2 flex flex-col gap-2 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
            {props.customerEmail ? (
              <a className="font-medium text-blue-600 hover:underline dark:text-blue-400" href={`mailto:${props.customerEmail}`}>
                {props.customerEmail}
              </a>
            ) : (
              <span className="text-zinc-500">No email on file</span>
            )}
            {props.customerPhone ? (
              <a className="font-medium text-zinc-800 hover:underline dark:text-zinc-100" href={`tel:${props.customerPhone}`}>
                {props.customerPhone}
              </a>
            ) : (
              <span className="text-zinc-500">No phone on file</span>
            )}
            {wa ? (
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                WhatsApp
              </a>
            ) : (
              <span className="text-xs text-zinc-400">WhatsApp (add phone)</span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/60">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Total</p>
            <p className="mt-1 text-base font-semibold text-zinc-900 dark:text-zinc-50 sm:text-lg">
              {formatCurrency(props.totalAmountCents, props.currencyCode)}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/60">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Paid</p>
            <p className="mt-1 text-base font-semibold text-emerald-700 dark:text-emerald-300 sm:text-lg">
              {formatCurrency(props.amountPaidCents, props.currencyCode)}
            </p>
          </div>
          <div
            className={`rounded-lg p-4 sm:col-span-1 ${
              settled
                ? "border-2 border-emerald-500/70 bg-emerald-50 dark:border-emerald-600/60 dark:bg-emerald-950/30"
                : "border-2 border-red-500/80 bg-red-50 dark:border-red-600/70 dark:bg-red-950/25"
            }`}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300">Balance due</p>
            {settled ? (
              <p className="mt-1 text-lg font-bold text-emerald-800 dark:text-emerald-200">Settled</p>
            ) : (
              <p className="mt-1 text-xl font-bold tabular-nums text-red-800 dark:text-red-200">
                {formatCurrency(props.balanceCents, props.currencyCode)}
              </p>
            )}
          </div>
        </div>
        <div className="mt-4 text-sm">
          <Link href="/admin/invoices" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            ← All invoices
          </Link>
          <span className="mx-2 text-zinc-300 dark:text-zinc-600">|</span>
          <Link href="/admin/customers" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            Customers
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
