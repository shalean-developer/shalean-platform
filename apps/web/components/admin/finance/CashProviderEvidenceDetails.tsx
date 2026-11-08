import type { CashProviderEvidence } from '@/lib/payments/cashProviderEvidence';
import { CashFlowDetails } from './CashFlowDetails';
import { formatForecastZar } from './CashFlowForecastBreakdown';
const amount=(v:number|null|undefined)=>v==null?'Unavailable':formatForecastZar(v);
export function CashProviderEvidenceDetails({data}:{data?:CashProviderEvidence|null}) {
  return <CashFlowDetails title="Paystack source & deposit matches">
    {!data?.receipts.available ? <p>Paystack source unavailable. Previous-period figures are hidden.</p> : <>
      <p>Provider read: {data.asOf}. Observations may be cached for up to 60 seconds. Gross charges use South African payment dates; refunds and adjustments are separate.</p>
      <p>Provider transactions: {data.receipts.count}. Current pending payouts: {data.payouts.pendingCount} · {amount(data.payouts.pendingCents)}. Pending amounts are not restricted to the selected payment period.</p>
      <p>Provider-paid payouts are not verified bank deposits. No provider amount is added to the four-account bank/book balance.</p>
      {!data.bank.available ? <p>Bank matching unavailable. No bank receipt is inferred from a paid payout.</p> : <>
        <p>Matched bank deposits in the selected bank-date period: {amount(data.bank.matchedCents)}. Paid payouts awaiting a bank match: {data.bank.unmatchedPaidCount}.</p>
        <p>Bank evidence read: {data.bank.asOf}. These are existing imported-bank links, not a complete bank-statement reconciliation.</p>
        {data.bank.matches.length ? <div className="overflow-x-auto"><table className="w-full min-w-[480px] text-left text-sm"><caption>Existing payout-to-bank links</caption><thead><tr><th>Payout</th><th>Bank record</th><th>Bank date</th><th>Amount</th></tr></thead><tbody>{data.bank.matches.map(m=><tr key={m.depositId}><td>{m.payoutId}</td><td>{m.depositId}</td><td>{m.bankDate}</td><td>{amount(m.amountCents)}</td></tr>)}</tbody></table></div>:null}
      </>}
    </>}
  </CashFlowDetails>;
}
