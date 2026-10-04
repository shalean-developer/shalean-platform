import Link from "next/link";
import { Download, ExternalLink, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { PerBookingInvoice } from "@/lib/dashboard/perBookingInvoice";

function formatDate(date: string): string {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return date || "—";
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

interface PerBookingInvoiceCardProps {
  invoice: PerBookingInvoice;
}

export function PerBookingInvoiceCard({ invoice }: PerBookingInvoiceCardProps) {
  const pdfHref = `/api/account/invoices/booking/${invoice.bookingId}/pdf`;
  const hasZoho = Boolean(invoice.zohoInvoiceId?.trim());

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-success/10 text-success">
              <FileText className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="break-words font-semibold text-foreground">{invoice.serviceName}</p>
                <Badge variant="success">Paid</Badge>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span>{formatDate(invoice.date)}</span>
                <span>
                  Total: <span className="font-medium text-foreground">R {invoice.amountZar.toLocaleString("en-ZA")}</span>
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Per-visit invoice</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {hasZoho ? (
              <>
                <Button asChild variant="outline" size="sm">
                  <a href={pdfHref} target="_blank" rel="noopener noreferrer">
                    <Download className="mr-1.5 h-4 w-4" aria-hidden />
                    PDF
                  </a>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <a href={pdfHref} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-1.5 h-4 w-4" aria-hidden />
                    View
                  </a>
                </Button>
              </>
            ) : (
              <span className="inline-flex items-center rounded-xl border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted-foreground">
                Invoice not ready yet
              </span>
            )}
            <Button asChild variant="outline" size="sm">
              <Link href={`/account/bookings/${invoice.bookingId}`}>Booking</Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
