import Link from "next/link";
import { Download, ExternalLink, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatZarFromCents } from "@/lib/dashboard/formatZar";
import { customerMonthlyInvoiceStatusLabel } from "@/lib/dashboard/monthlyInvoiceUi";
import type { CustomerMonthlyInvoiceRow } from "@/lib/dashboard/monthlyInvoiceTypes";
import { cn } from "@/lib/utils";

function monthLabel(ym: string): string {
  if (!/^\d{4}-\d{2}$/.test(ym)) return ym;
  const [y, m] = ym.split("-").map(Number);
  return new Date(y!, m! - 1, 1).toLocaleDateString("en-ZA", { month: "long", year: "numeric" });
}

function balanceFor(inv: CustomerMonthlyInvoiceRow): number {
  if (typeof inv.balance_cents === "number" && Number.isFinite(inv.balance_cents)) return inv.balance_cents;
  return Math.max(0, inv.total_amount_cents - inv.amount_paid_cents);
}

function StatusBadge({ inv }: { inv: CustomerMonthlyInvoiceRow }) {
  const status = inv.status?.toLowerCase();
  if (status === "paid") {
    return (
      <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
        Paid
      </span>
    );
  }
  if (inv.is_overdue && status !== "paid") {
    return (
      <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
        Overdue
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
      {customerMonthlyInvoiceStatusLabel(inv.status)}
    </span>
  );
}

interface InvoiceCardProps {
  invoice: CustomerMonthlyInvoiceRow;
}

export function InvoiceCard({ invoice: inv }: InvoiceCardProps) {
  const balance = balanceFor(inv);
  const payHref = typeof inv.payment_link === "string" ? inv.payment_link.trim() : "";
  const canPay = balance > 0 && inv.status !== "paid" && Boolean(payHref);
  const pdfHref = `/api/account/invoices/monthly/${inv.id}/pdf`;
  const hasZoho = Boolean(inv.zoho_invoice_id?.trim());

  return (
    <div
      className={cn(
        "rounded-2xl border bg-white p-5 shadow-sm transition",
        inv.is_overdue && inv.status !== "paid" ? "border-red-200" : "border-gray-100",
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <div
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
              inv.status === "paid" ? "bg-green-50" : inv.is_overdue ? "bg-red-50" : "bg-amber-50",
            )}
          >
            <FileText
              className={cn(
                "h-5 w-5",
                inv.status === "paid" ? "text-green-600" : inv.is_overdue ? "text-red-600" : "text-amber-600",
              )}
              strokeWidth={1.75}
            />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-gray-900">{monthLabel(inv.month)}</p>
              <StatusBadge inv={inv} />
            </div>
            <div className="mt-1 flex flex-wrap gap-4 text-sm text-gray-500">
              <span>
                Total:{" "}
                <span className="font-medium text-gray-900">{formatZarFromCents(inv.total_amount_cents)}</span>
              </span>
              <span>
                Paid:{" "}
                <span className="font-medium text-gray-900">{formatZarFromCents(inv.amount_paid_cents)}</span>
              </span>
              {balance > 0 ? (
                <span>
                  Balance:{" "}
                  <span className={cn("font-medium", inv.is_overdue ? "text-red-600" : "text-gray-900")}>
                    {formatZarFromCents(balance)}
                  </span>
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-gray-400">{inv.total_bookings} visit{inv.total_bookings !== 1 ? "s" : ""}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canPay ? (
            <Button asChild size="sm" className="rounded-xl bg-blue-600 text-white hover:bg-blue-700">
              <a href={payHref} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                Pay now
              </a>
            </Button>
          ) : null}
          {hasZoho ? (
            <Button asChild variant="outline" size="sm" className="rounded-xl">
              <a href={pdfHref} target="_blank" rel="noopener noreferrer">
                <Download className="mr-1.5 h-4 w-4" />
                PDF
              </a>
            </Button>
          ) : (
            <span className="inline-flex items-center rounded-xl border border-dashed border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500">
              Invoice syncing
            </span>
          )}
          <Button asChild variant="outline" size="sm" className="rounded-xl">
            <Link href={`/account/invoices/${inv.id}`}>View</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
