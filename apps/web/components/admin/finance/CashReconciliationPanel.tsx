'use client';
import type { CashReconciliation } from '@/lib/admin/expenses/cashReconciliation';
import { formatForecastZar } from './CashFlowForecastBreakdown';
const amount = (value: number | null | undefined) => value == null ? 'Unavailable' : formatForecastZar(value);
export function CashReconciliationPanel({ data, loading, error }: { data?: CashReconciliation | null; loading: boolean; error?: string | null }) {
  return <section aria-label="Bank reconciliation and protected cash" className="space-y-4 rounded-xl border border-amber-200 bg-white p-5">
    <h2 className="text-lg font-semibold">Bank reconciliation and protected cash</h2>
    <p className="text-sm text-slate-600">Current balances are a point-in-time snapshot, independent of the chart date range. Transfers between these accounts move cash; they do not create income or expenses.</p>
    {data?.synthetic ? <p role="status" className="rounded-lg bg-amber-50 p-3 font-medium">Synthetic staging demonstration — every amount in this section is fictional. No live bank or Zoho balances are imported.</p> : null}
    {loading ? <p role="status">Loading source evidence…</p> : error ? <p role="alert">Bank source unavailable. Safe to spend and runway remain unavailable.</p> : <>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm">
        <caption className="mb-2 text-left text-slate-600">Four mapped bank accounts · ZAR · read only</caption>
        <thead><tr>{['Account / source ID', 'Bank feed', 'Books', 'Books minus bank', 'Evidence'].map(label => <th key={label} scope="col" className="p-2">{label}</th>)}</tr></thead>
        <tbody>{data?.accounts.map(a => <tr key={a.id} className="border-t">
          <th scope="row" className="p-2 font-medium">{a.name}<span className="block text-xs font-normal text-slate-500">{a.id}</span></th>
          <td className="p-2">{amount(a.bankCents)}</td><td className="p-2">{amount(a.bookCents)}</td><td className="p-2">{amount(a.differenceCents)}</td>
          <td className="p-2">{!a.identityVerified ? 'Mapping unverified' : !a.fresh ? 'Feed stale or unavailable' : a.differenceCents !== 0 ? 'Unresolved difference' : 'Balances agree; statement reconciliation unverified'}<span className="block text-xs text-slate-500">Feed: {a.feedAt ?? 'Unavailable'}</span></td>
        </tr>)}</tbody>
      </table></div>
      <div className="grid gap-3 sm:grid-cols-3">
        <p>Bank-feed total<strong className="block text-lg">{amount(data?.bankCents)}</strong></p>
        <p>Book total<strong className="block text-lg">{amount(data?.bookCents)}</strong></p>
        <p>Unresolved net difference<strong className="block text-lg">{amount(data?.differenceCents)}</strong></p>
      </div>
      {!data?.complete ? <p className="text-sm text-amber-800">The four-account source is incomplete, stale or unverified. Consolidated totals are unavailable; individual available values are shown for investigation.</p> : null}
    </>}
    <div className="grid gap-3 rounded-lg border p-4 text-sm sm:grid-cols-3">
      <p>Paystack Clearing · book balance<strong className="block">{loading || error ? 'Unavailable' : amount(data?.processorLedgerCents)}</strong></p>
      <p>Undeposited Funds · book balance<strong className="block">{loading || error ? 'Unavailable' : amount(data?.undepositedLedgerCents)}</strong></p>
      <p>Provider-verified pending payouts<strong className="block">Not yet connected</strong></p>
    </div>
    <div className="grid gap-3 rounded-lg bg-slate-50 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
      <p>Funds held for Bokkie<strong className="block">Reconciliation required</strong></p>
      <p>Customer advances<strong className="block">Reconciliation required</strong></p>
      <p>Safe to spend<strong className="block">Unavailable</strong></p>
      <p>Cash runway<strong className="block">Unavailable</strong></p>
    </div>
    <p className="text-sm text-slate-600">Bank-held cash is not proof of Shalean ownership. Bokkie funds, customer advances, other restrictions and obligations must be reconciled before cash can be called spendable. Equal balances and a recent refresh alone do not pass this gate.</p>
    <p className="text-sm text-slate-600">Paystack pending funds are separate from bank cash. A successful charge, a Clearing ledger balance or a payout marked paid does not independently prove a matched bank deposit. Settlements already in these bank balances must not be added again.</p>
    <p className="text-xs text-slate-500">Source read: {data?.asOf ?? 'Unavailable'}. No balances or accounting records are changed by this view.</p>
  </section>;
}
