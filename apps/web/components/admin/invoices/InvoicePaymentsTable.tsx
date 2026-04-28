import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/admin/invoices/invoiceAdminFormatters";
import type { InvoiceTimelineDbEvent } from "@/lib/monthlyInvoice/buildInvoiceHumanTimeline";

function payloadKind(p: Record<string, unknown>): string {
  return String(p.kind ?? "");
}

function remainingBalanceAfter(p: Record<string, unknown>, kind: string): number | null {
  const explicit = p.balance_cents_after;
  if (typeof explicit === "number" && Number.isFinite(explicit)) return Math.max(0, Math.round(explicit));
  if (kind === "admin_mark_paid") return 0;
  const total = Math.round(Number(p.total_amount_cents ?? 0));
  const paidAfter = Math.round(Number(p.amount_paid_cents_after ?? NaN));
  if (!Number.isFinite(total) || !Number.isFinite(paidAfter)) return null;
  return Math.max(0, total - paidAfter);
}

export type InvoicePaymentsTableProps = {
  currencyCode: string;
  events: InvoiceTimelineDbEvent[];
};

export function InvoicePaymentsTable(props: InvoicePaymentsTableProps) {
  const payments = props.events
    .map((e) => {
      const k = payloadKind(e.payload);
      if (k !== "payment_received" && k !== "payment_applied" && k !== "admin_mark_paid") return null;
      const at = typeof e.payload.at === "string" ? e.payload.at : e.created_at;
      const cents = Math.round(Number(e.payload.amount_cents ?? e.payload.amount_recorded_cents ?? 0));
      const ref =
        k === "admin_mark_paid"
          ? `admin · ${String(e.payload.admin_email ?? "")}`
          : String(e.payload.paystack_charge_reference ?? "");
      const bal = remainingBalanceAfter(e.payload as Record<string, unknown>, k);
      return { id: `${e.created_at}-${at}-${cents}`, at, cents, ref, manual: k === "admin_mark_paid", balanceAfter: bal };
    })
    .filter((x): x is NonNullable<typeof x> => x != null)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payments</CardTitle>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">From the invoice event log (Paystack and manual admin settlements).</p>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
              <th className="py-2 pr-4 font-medium">Date</th>
              <th className="py-2 pr-4 font-medium">Amount</th>
              <th className="py-2 pr-4 font-medium">Balance after</th>
              <th className="py-2 font-medium">Reference</th>
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
                  <p className="font-medium text-zinc-700 dark:text-zinc-300">No payments yet</p>
                  <p className="mt-1 text-xs">When the customer pays via Paystack (or you mark paid manually), entries will appear here.</p>
                </td>
              </tr>
            ) : (
              payments.map((p) => (
                <tr key={p.id} className="border-b border-zinc-100 dark:border-zinc-800">
                  <td className="py-2 pr-4 align-top text-zinc-800 dark:text-zinc-100">{formatDate(p.at)}</td>
                  <td className="py-2 pr-4 align-top font-medium tabular-nums text-zinc-900 dark:text-zinc-50">
                    {formatCurrency(p.cents, props.currencyCode)}
                    {p.manual ? (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-900 dark:bg-amber-950/60 dark:text-amber-100">
                        Manual
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2 pr-4 align-top font-medium tabular-nums text-zinc-800 dark:text-zinc-100">
                    {p.balanceAfter == null ? (
                      "—"
                    ) : (
                      <>
                        {formatCurrency(p.balanceAfter, props.currencyCode)}
                        {p.balanceAfter === 0 ? (
                          <span className="ml-1 text-xs font-normal text-emerald-700 dark:text-emerald-300">(Settled)</span>
                        ) : null}
                      </>
                    )}
                  </td>
                  <td className="py-2 align-top font-mono text-xs text-zinc-600 dark:text-zinc-300">{p.ref || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
