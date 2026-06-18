import Link from "next/link";
import { Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-green-50">
            <FileText className="h-5 w-5 text-green-600" strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-gray-900">{invoice.serviceName}</p>
              <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                Paid
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-4 text-sm text-gray-500">
              <span>{formatDate(invoice.date)}</span>
              <span>
                Total:{" "}
                <span className="font-medium text-gray-900">
                  R {invoice.amountZar.toLocaleString("en-ZA")}
                </span>
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-400">Per-visit invoice</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {invoice.zohoInvoiceId ? (
            <Button asChild variant="outline" size="sm" className="rounded-xl">
              <a
                href={`/api/account/invoices/booking/${invoice.bookingId}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Download className="mr-1.5 h-4 w-4" />
                Invoice
              </a>
            </Button>
          ) : null}
          <Button asChild variant="outline" size="sm" className="rounded-xl">
            <Link href={`/account/bookings/${invoice.bookingId}`}>View</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
