import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/admin/invoices/invoiceAdminFormatters";
import {
  formatInvoiceBookingOptionLabel,
  type InvoiceBookingOption,
} from "@/lib/admin/invoices/invoiceBookingSelectOptions";
import { adjustmentCategoryLabel, parseAdjustmentCategory } from "@/lib/monthlyInvoice/adjustmentCategory";
import { parseBookingRefFromReason } from "@/lib/monthlyInvoice/invoiceAdjustmentBookingRef";

type AdjRow = Record<string, unknown>;

function appliedIso(row: AdjRow): string | null {
  const a = row.applied_at;
  if (typeof a === "string" && a) return a;
  const c = row.created_at;
  if (typeof c === "string" && c) return c;
  return null;
}

function byLine(createdBy: unknown, creatorEmails: Record<string, string>): string {
  const id = typeof createdBy === "string" && createdBy ? createdBy : "";
  if (!id) return "—";
  const email = creatorEmails[id];
  if (email) return email;
  return `${id.slice(0, 8)}…`;
}

export type InvoiceAdjustmentsTableProps = {
  currencyCode: string;
  rows: AdjRow[];
  creatorEmails?: Record<string, string>;
  invoiceBookings?: InvoiceBookingOption[];
};

export function InvoiceAdjustmentsTable(props: InvoiceAdjustmentsTableProps) {
  const creators = props.creatorEmails ?? {};
  const bookingById = new Map((props.invoiceBookings ?? []).map((b) => [b.id, b]));

  function bookingLabel(row: AdjRow): string {
    const fromColumn = typeof row.booking_id === "string" && row.booking_id ? row.booking_id : "";
    const fromReason = parseBookingRefFromReason(row.reason);
    const id = fromColumn || fromReason || "";
    if (!id) return "—";
    const bookingRow = bookingById.get(id);
    if (bookingRow) return formatInvoiceBookingOptionLabel(bookingRow, props.currencyCode);
    return `${id.slice(0, 8)}…`;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Adjustments</CardTitle>
      </CardHeader>
      <CardContent className="p-0 sm:px-6">
        {props.rows.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400 sm:px-0">
            <p className="font-medium text-zinc-700 dark:text-zinc-300">No adjustments on this invoice</p>
            <p className="mt-1 text-xs">Credits or extra charges will show here once applied to this invoice month.</p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-zinc-100 md:hidden dark:divide-zinc-800">
              {props.rows.map((r) => {
                const cents = Math.round(Number(r.amount_cents ?? 0));
                const positive = cents >= 0;
                const cat = parseAdjustmentCategory(r.category);
                return (
                  <div key={String(r.id ?? `${appliedIso(r)}-${cents}`)} className="space-y-2 px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{adjustmentCategoryLabel(cat)}</p>
                        <p className="mt-0.5 text-xs text-zinc-500">{formatDate(appliedIso(r))}</p>
                      </div>
                      <p
                        className={`shrink-0 text-sm font-semibold tabular-nums ${
                          positive ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"
                        }`}
                      >
                        {positive ? "+" : ""}
                        {formatCurrency(cents, props.currencyCode)}
                      </p>
                    </div>
                    <p className="text-xs text-zinc-600 dark:text-zinc-300">Booking: {bookingLabel(r)}</p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-300">By: {byLine(r.created_by, creators)}</p>
                    <p className="break-words text-sm text-zinc-700 dark:text-zinc-200">{String(r.reason ?? "—")}</p>
                  </div>
                );
              })}
            </div>
            <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
              <th className="py-2 pr-4 font-medium">Date</th>
              <th className="py-2 pr-4 font-medium">Category</th>
              <th className="py-2 pr-4 font-medium">Booking</th>
              <th className="py-2 pr-4 font-medium">Amount</th>
              <th className="py-2 pr-4 font-medium">By</th>
              <th className="py-2 font-medium">Reason</th>
            </tr>
          </thead>
          <tbody>
            {props.rows.map((r) => {
                const cents = Math.round(Number(r.amount_cents ?? 0));
                const positive = cents >= 0;
                const cat = parseAdjustmentCategory(r.category);
                return (
                  <tr key={String(r.id ?? `${appliedIso(r)}-${cents}`)} className="border-b border-zinc-100 dark:border-zinc-800">
                    <td className="py-2 pr-4 align-top text-zinc-800 dark:text-zinc-100">{formatDate(appliedIso(r))}</td>
                    <td className="py-2 pr-4 align-top text-zinc-700 dark:text-zinc-200">{adjustmentCategoryLabel(cat)}</td>
                    <td className="py-2 pr-4 align-top text-xs text-zinc-600 dark:text-zinc-300">{bookingLabel(r)}</td>
                    <td
                      className={`py-2 pr-4 align-top font-semibold tabular-nums ${
                        positive ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"
                      }`}
                    >
                      {positive ? "+" : ""}
                      {formatCurrency(cents, props.currencyCode)}
                    </td>
                    <td className="py-2 pr-4 align-top text-xs text-zinc-600 dark:text-zinc-300">{byLine(r.created_by, creators)}</td>
                    <td className="py-2 align-top text-zinc-700 dark:text-zinc-200">{String(r.reason ?? "—")}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
