'use client';
import { CashFlowDetails } from './CashFlowDetails';
import type { CashReconciliation } from '@/lib/admin/expenses/cashReconciliation';
import { formatForecastZar } from './CashFlowForecastBreakdown';
const amount = (value: number | null | undefined) => value == null ? 'Unavailable' : formatForecastZar(value);
export function CashReconciliationPanel({ data, loading, error }: { data?: CashReconciliation | null; loading: boolean; error?: string | null }) {
  return <section aria-label="Bank reconciliation and protected cash" className="min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold tracking-tight text-slate-900">Bank balances</h2><span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">Reconciliation required</span></div>
    <p className="text-sm text-slate-500">Bank feed and book balances</p>
    {data?.synthetic ? <p role="status" className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900">Demo balances — not real money.</p> : null}
    {loading ? <p role="status">Loading source evidence…</p> : error ? <p role="alert">Bank source unavailable. Safe to spend and runway remain unavailable.</p> : <>
      <div className="grid gap-3 sm:grid-cols-3">
        <p>Bank feed total<strong className="block text-lg">{amount(data?.bankCents)}</strong></p>
        <p>Zoho total<strong className="block text-lg">{amount(data?.bookCents)}</strong></p>
        <p>Difference<strong className="block text-lg">{data?.complete && !data.comparable ? 'Not comparable' : amount(data?.differenceCents)}</strong></p>
      </div>
      {data?.complete && !data.comparable ? <p className="text-sm text-slate-500">Current bank balance needed for comparison.</p> : null}
      {!data?.complete ? <p className="text-sm text-amber-800">Totals unavailable: missing or stale balances.</p> : null}
    </>}
    <div className="grid gap-3 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-2">
      <p>Safe to spend<strong className="block">Unavailable</strong></p>
      <p>Cash runway<strong className="block">Unavailable</strong></p>
    </div>
    <p className="text-xs text-amber-800">Verify balances and obligations before spending.</p>
    <CashFlowDetails title="View account details">
      {!loading && !error ? <>      <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm">
        <caption className="mb-2 text-left text-slate-600">Bank accounts · ZAR</caption>
        <thead><tr>{['Account', 'Bank feed', 'Balance type', 'Books', 'Difference', 'Status'].map(label => <th key={label} scope="col" className="p-2">{label}</th>)}</tr></thead>
        <tbody>{data?.accounts.map(a => <tr key={a.id} className="border-t">
          <th scope="row" className="p-2 font-medium">{a.name}</th>
          <td className="whitespace-nowrap p-2 tabular-nums">{amount(a.bankCents)}</td><td className="p-2">{a.bankBalanceBasis === 'current' ? 'Current' : a.bankBalanceBasis === 'available' ? 'Available' : 'Unconfirmed'}</td><td className="whitespace-nowrap p-2 tabular-nums">{amount(a.bookCents)}</td><td className="whitespace-nowrap p-2 tabular-nums">{amount(a.differenceCents)}</td>
          <td className="p-2">{!a.identityVerified ? 'Mapping unverified' : !a.fresh ? 'Feed stale or unavailable' : !a.valid ? 'Source balance unavailable' : !a.comparable ? 'Not comparable' : a.differenceCents === null ? 'Source balance unavailable' : a.differenceCents !== 0 ? 'Difference' : 'Equal · unverified'}</td>
        </tr>)}</tbody>
      </table></div>
</> : null}
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <p>Paystack Clearing · books<strong className="block">{loading || error ? 'Unavailable' : amount(data?.processorLedgerCents)}</strong></p>
        <p>Undeposited Funds · books<strong className="block">{loading || error ? 'Unavailable' : amount(data?.undepositedLedgerCents)}</strong></p>
        <p>Pending Paystack payouts<strong className="block">Not connected</strong></p>
        <p>Funds held for Bokkie<strong className="block">Reconciliation required</strong></p>
        <p>Customer advances<strong className="block">Reconciliation required</strong></p>
      </div>

      <p>Current bank balances are compared with books. Available funds may differ due to bank restrictions or pending activity; that difference is not an accounting error. An unconfirmed balance type is not compared.</p>
      <p>Transfers move cash between accounts; they do not create income or expenses. Clearing and Undeposited Funds are book balances, not verified pending payouts.</p>
      <p>Bank-held cash is not proof of Shalean ownership. Bokkie funds, customer advances, restrictions and obligations must be reconciled before cash can be called spendable. Matching balances alone do not complete statement reconciliation.</p>
      <p>A successful charge or payout marked paid does not prove a matched bank deposit. Settlements already included in bank balances must not be added again.</p>
      {!loading && !error ? <ul className="space-y-2">{data?.accounts.map(a => <li key={a.id} className="break-all"><strong>{a.name}</strong> · {a.id}<br />Feed: {a.feedAt ?? 'Unavailable'}</li>)}</ul> : null}
      <p>Source read: {data?.asOf ?? 'Unavailable'}. Read only; no accounting records changed.</p>
    </CashFlowDetails>
  </section>;
}


