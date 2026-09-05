import Link from "next/link";
import { Download, ExternalLink, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatZarFromCents } from "@/lib/dashboard/formatZar";
import { customerMonthlyInvoiceStatusLabel } from "@/lib/dashboard/monthlyInvoiceUi";
import type { CustomerMonthlyInvoiceRow } from "@/lib/dashboard/monthlyInvoiceTypes";
import { trustMonthlyInvoicePayPageUrl } from "@/lib/pay/trustPayPageUrl";
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
  if (status === "paid") return <Badge variant="success">Paid</Badge>;
  if (inv.is_overdue && status !== "paid") return <Badge variant="destructive">Overdue</Badge>;
  return <Badge variant="warning">{customerMonthlyInvoiceStatusLabel(inv.status)}</Badge>;
}

interface InvoiceCardProps {
  invoice: CustomerMonthlyInvoiceRow;
}

export function InvoiceCard({ invoice: inv }: InvoiceCardProps) {
  const balance = balanceFor(inv);
  const paystackRef = typeof inv.paystack_reference === "string" ? inv.paystack_reference.trim() : "";
  // BILL-INV-002 Phase A (H03): branded /pay/invoice URL only — never raw Paystack.
  const payHref = paystackRef
    ? trustMonthlyInvoicePayPageUrl(inv.id, paystackRef, inv.payment_link?.trim() || "")
    : "";
  const canPay = balance > 0 && inv.status !== "paid" && Boolean(payHref);
  const pdfHref = `/api/account/invoices/monthly/${inv.id}/pdf`;
  const hasZoho = Boolean(inv.zoho_invoice_id?.trim());
  const isPaid = inv.status === "paid";
  const isOverdue = inv.is_overdue && !isPaid;

  return (
    <Card className={cn("transition-colors", isOverdue && "border-destructive/30")}>
      <CardContent className="p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                isPaid
                  ? "bg-success/10 text-success"
                  : isOverdue
                    ? "bg-destructive/10 text-destructive"
                    : "bg-warning/15 text-warning-foreground",
              )}
            >
              <FileText className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="break-words font-semibold text-foreground">{monthLabel(inv.month)}</p>
                <StatusBadge inv={inv} />
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span>
                  Total: <span className="font-medium text-foreground">{formatZarFromCents(inv.total_amount_cents)}</span>
                </span>
                <span>
                  Paid: <span className="font-medium text-foreground">{formatZarFromCents(inv.amount_paid_cents)}</span>
                </span>
                {balance > 0 ? (
                  <span>
                    Balance:{" "}
                    <span className={cn("font-medium", isOverdue ? "text-destructive" : "text-foreground")}>
                      {formatZarFromCents(balance)}
                    </span>
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {inv.total_bookings} visit{inv.total_bookings !== 1 ? "s" : ""}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {canPay ? (
              <Button asChild size="sm">
                <a href={payHref} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                  Pay now
                </a>
              </Button>
            ) : null}
            {hasZoho ? (
              <Button asChild variant="outline" size="sm">
                <a href={pdfHref} target="_blank" rel="noopener noreferrer">
                  <Download className="mr-1.5 h-4 w-4" aria-hidden />
                  PDF
                </a>
              </Button>
            ) : (
              <span className="inline-flex items-center rounded-xl border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted-foreground">
                Invoice syncing
              </span>
            )}
            <Button asChild variant="outline" size="sm">
              <Link href={`/account/invoices/${inv.id}`}>View</Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
