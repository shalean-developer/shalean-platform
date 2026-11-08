import { CashFlowDetails } from "./CashFlowDetails";
import type { CashFlowForecast } from "@/lib/admin/expenses/cashFlowForecast";
export function formatForecastZar(cents: number): string {
  return `R ${(cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
export function CashFlowForecastBreakdown({ forecast, from, to }: { forecast: CashFlowForecast; from: string; to: string }) {
  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5" aria-label="Expected cash flow breakdown">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold tracking-tight">Forecast</h2><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-800">Estimate · {from} to {to}</span></div><p className="text-sm text-slate-500">Issued invoices, payout batches and recurring expenses only.</p>
      {forecast.issues.map((issue) => <p key={issue} className="mt-2 text-sm text-amber-800">{issue}</p>)}
      {forecast.undated_income_cents !== 0 || forecast.undated_expenses_cents !== 0 ? <p className="text-sm text-amber-800">Some forecast records need dates. Review details before relying on this estimate.</p> : null}
      <CashFlowDetails title="Forecast rules & excluded amounts">
      <p className="mt-1 text-sm text-slate-600">Unpaid monthly invoices use the agreed payment date, otherwise the due date. Cleaner payouts use the configured day of the following month. Recurring expenses use scheduled occurrences. These are estimates, separate from bank cash and actual net cash flow.</p>
      <p className="mt-2 text-sm">Earlier unpaid invoices: {formatForecastZar(forecast.earlier_income_cents)} · Earlier unpaid expenses: {formatForecastZar(forecast.earlier_expenses_cents)}. These are excluded from the selected-period cards.</p>
      <p className="mt-1 text-sm">Missing or unsupported dates: income {formatForecastZar(forecast.undated_income_cents)} · expenses {formatForecastZar(forecast.undated_expenses_cents)}. Review source records before relying on this forecast.</p>
      <p className="mt-2 text-sm font-medium">Forecast scope: issued monthly invoices, existing payout batches and recurring schedules only. Future unbilled bookings, uncreated payouts and other Zoho liabilities are not included.</p>
      </CashFlowDetails>
      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-medium">View contributing records ({forecast.items.length})</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr><th className="p-2">Record</th><th className="p-2">Expected date</th><th className="p-2">Basis</th><th className="p-2">Scope</th><th className="p-2 text-right">Amount</th></tr></thead>
            <tbody>{forecast.items.map((item) => (
              <tr key={`${item.source}:${item.id}`} className="border-t border-slate-100">
                <td className="p-2">{item.description}<span className="block break-all text-xs text-slate-500">{item.source} · {item.id}</span></td>
                <td className="p-2">{item.date ?? "Needs review"}</td><td className="p-2">{item.basis}</td>
                <td className="p-2">{item.bucket === "period" ? "Selected period" : item.bucket === "earlier" ? "Earlier unpaid" : "Undated"}</td>
                <td className="p-2 text-right tabular-nums">{formatForecastZar(item.amount_cents)}</td>
              </tr>
            ))}</tbody>
          </table>
          {forecast.items.length === 0 ? <p className="mt-2 text-sm text-slate-600">No eligible unpaid records through the selected end date.</p> : null}
        </div>
      </details>
    </section>
  );
}
