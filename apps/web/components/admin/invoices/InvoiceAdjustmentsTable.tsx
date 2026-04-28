import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/admin/invoices/invoiceAdminFormatters";
import { adjustmentCategoryLabel, parseAdjustmentCategory } from "@/lib/monthlyInvoice/adjustmentCategory";

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
};

export function InvoiceAdjustmentsTable(props: InvoiceAdjustmentsTableProps) {
  const creators = props.creatorEmails ?? {};

  return (
    <Card>
      <CardHeader>
        <CardTitle>Adjustments</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
              <th className="py-2 pr-4 font-medium">Date</th>
              <th className="py-2 pr-4 font-medium">Category</th>
              <th className="py-2 pr-4 font-medium">Amount</th>
              <th className="py-2 pr-4 font-medium">By</th>
              <th className="py-2 font-medium">Reason</th>
            </tr>
          </thead>
          <tbody>
            {props.rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
                  <p className="font-medium text-zinc-700 dark:text-zinc-300">No adjustments on this invoice</p>
                  <p className="mt-1 text-xs">Credits or extra charges will show here once applied to this invoice month.</p>
                </td>
              </tr>
            ) : (
              props.rows.map((r) => {
                const cents = Math.round(Number(r.amount_cents ?? 0));
                const positive = cents >= 0;
                const cat = parseAdjustmentCategory(r.category);
                return (
                  <tr key={String(r.id ?? `${appliedIso(r)}-${cents}`)} className="border-b border-zinc-100 dark:border-zinc-800">
                    <td className="py-2 pr-4 align-top text-zinc-800 dark:text-zinc-100">{formatDate(appliedIso(r))}</td>
                    <td className="py-2 pr-4 align-top text-zinc-700 dark:text-zinc-200">{adjustmentCategoryLabel(cat)}</td>
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
              })
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
