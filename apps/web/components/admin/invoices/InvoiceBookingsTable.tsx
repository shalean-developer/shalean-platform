import type { MonthlyInvoiceSnapshotV1 } from "@/lib/monthlyInvoice/buildMonthlyInvoiceSnapshot";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/admin/invoices/invoiceAdminFormatters";

type BookingRow = Record<string, unknown>;

function bookingAmountCents(b: BookingRow): number {
  const zar = b.total_paid_zar;
  if (typeof zar === "number" && Number.isFinite(zar)) return Math.max(0, Math.round(zar * 100));
  const cents = b.amount_paid_cents;
  if (typeof cents === "number" && Number.isFinite(cents)) return Math.max(0, Math.round(cents));
  return 0;
}

export type InvoiceBookingsTableProps = {
  currencyCode: string;
  snapshotAtFinalize: MonthlyInvoiceSnapshotV1 | null;
  liveBookings: BookingRow[];
  cleanersById: Record<string, { id: string; full_name: string | null }>;
};

export function InvoiceBookingsTable(props: InvoiceBookingsTableProps) {
  const useSnapshot = Boolean(props.snapshotAtFinalize?.bookings?.length);
  const rows = useSnapshot
    ? (props.snapshotAtFinalize!.bookings ?? []).map((b) => {
        const fromCents = Number(b.amount_paid_cents ?? NaN);
        const fromZar =
          typeof b.total_paid_zar === "number" && Number.isFinite(b.total_paid_zar) ? Math.round(b.total_paid_zar * 100) : 0;
        const cents = Math.max(0, Number.isFinite(fromCents) ? Math.round(fromCents) : fromZar);
        return {
          id: b.id,
          date: b.date,
          service: b.service,
          status: b.status,
          cents,
          cleanerLabel: null as string | null,
        };
      })
    : props.liveBookings.map((b) => {
        const id = String(b.cleaner_id ?? "");
        const cleaner = id ? props.cleanersById[id] : undefined;
        return {
          id: String(b.id ?? ""),
          date: (b.date as string | null) ?? null,
          service: (b.service as string | null) ?? null,
          status: (b.status as string | null) ?? null,
          cents: bookingAmountCents(b),
          cleanerLabel: cleaner?.full_name ?? (id ? id.slice(0, 8) + "…" : null),
        };
      });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bookings</CardTitle>
        {useSnapshot ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Showing frozen snapshot at finalize (stable line items).</p>
        ) : (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Showing live booking rows for this invoice.</p>
        )}
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
              <th className="py-2 pr-4 font-medium">Date</th>
              <th className="py-2 pr-4 font-medium">Service</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              <th className="py-2 pr-4 font-medium">Amount</th>
              {!useSnapshot ? <th className="py-2 font-medium">Cleaner</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={useSnapshot ? 4 : 5} className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
                  <p className="font-medium text-zinc-700 dark:text-zinc-300">No bookings on this invoice</p>
                  <p className="mt-1 text-xs">Jobs linked to this billing month will appear here (or in the finalize snapshot once sent).</p>
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b border-zinc-100 dark:border-zinc-800">
                  <td className="py-2 pr-4 align-top text-zinc-800 dark:text-zinc-100">{formatDate(r.date)}</td>
                  <td className="py-2 pr-4 align-top text-zinc-700 dark:text-zinc-200">{r.service ?? "—"}</td>
                  <td className="py-2 pr-4 align-top">
                    <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                      {r.status ?? "—"}
                    </span>
                  </td>
                  <td className="py-2 pr-4 align-top font-medium tabular-nums text-zinc-900 dark:text-zinc-50">
                    {formatCurrency(r.cents, props.currencyCode)}
                  </td>
                  {!useSnapshot ? <td className="py-2 align-top text-zinc-600 dark:text-zinc-300">{r.cleanerLabel ?? "—"}</td> : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
