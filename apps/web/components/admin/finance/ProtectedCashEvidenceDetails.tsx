import type { ProtectedCashEvidence } from '@/lib/admin/expenses/protectedCashEvidence';
import { CashFlowDetails } from './CashFlowDetails';
import { formatForecastZar } from './CashFlowForecastBreakdown';
export function ProtectedCashEvidenceDetails({ data }: { data?: ProtectedCashEvidence | null }) {
  return <CashFlowDetails title="Protected obligations · source evidence">
    {data?.synthetic ? <p role="status">Demo protected balances — not real money.</p> : null}
    <p>Current signed closing balances reported by Zoho, independent of the selected activity period. These book observations are not a reconciled total of protected cash.</p>
    {data?.accounts.map(a => <p key={a.id} className="break-words"><strong>{a.name} · Zoho books: {a.balanceCents == null ? 'Unavailable' : formatForecastZar(a.balanceCents)}</strong><br />Account: {a.id} · Books read: {a.readAt ?? 'Unavailable'}</p>) ?? <p>Protected-account source unavailable. Previous values are hidden.</p>}
    <p>Reconciliation required: Bokkie ownership, customer allocations, older unpaid cleaner earnings, other payables and restrictions, and overlap between these obligations. Do not add the Bokkie bank balance to the Bokkie liability or add overlapping obligations twice.</p>
    <p>Selected-period cleaner earnings and recurring expenses do not establish all outstanding obligations. The operating reserve is a separate policy amount, not a bank balance.</p>
    <p>Protected total: Unavailable. Spendable cash and runway remain unavailable until verified bank cash and complete, non-overlapping obligations are evidenced. No accounting records changed.</p>
  </CashFlowDetails>;
}
