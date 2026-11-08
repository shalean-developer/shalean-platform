/** Provider observations and existing imported-bank links; never financial writes. */
export type ProviderReceipt = { id: string; reference: string; paidAt: string; amountCents: number; feeCents: number | null };
export type ProviderPayout = { id: string; date: string | null; status: 'success' | 'pending' | 'processing' | 'failed'; amountCents: number };
export type ImportedDeposit = { id: string; payoutReference: string; date: string; amountCents: number; accountId: string };
export const PAYSTACK_DESTINATION_ACCOUNT_ID = '253016000000097002';
export type CashProviderEvidence = {
  period: { from: string; to: string }; asOf: string; synthetic: boolean;
  receipts: { available: boolean; grossCents: number | null; feeCents: number | null; count: number | null };
  payouts: { available: boolean; pendingCents: number | null; pendingCount: number | null; paidCents: number | null; paidCount: number | null };
  bank: { asOf: string | null; available: boolean; matchedCents: number | null; unmatchedPaidCount: number | null; matches: Array<{ payoutId: string; depositId: string; bankDate: string; amountCents: number }> };
};
export function validCashPeriod(from: string, to: string) {
  const valid = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0,10) === d;
  return valid(from) && valid(to) && from <= to && Date.parse(to)-Date.parse(from) <= 366*86400000;
}
export function cashPeriodBounds(from: string, to: string) {
  if (!validCashPeriod(from,to)) throw Error('Invalid cash-flow period');
  return { start: Date.parse(`${from}T00:00:00+02:00`), end: Date.parse(`${to}T00:00:00+02:00`)+86400000 };
}
function sum(values: number[]) {
  const result=values.reduce((a,b)=>a+b,0);
  if(!Number.isSafeInteger(result)) throw Error('Invalid financial aggregate');
  return result;
}
export function unavailableProviderEvidence(from: string,to: string,now: Date,synthetic=false): CashProviderEvidence {
  return {period:{from,to},asOf:now.toISOString(),synthetic,receipts:{available:false,grossCents:null,feeCents:null,count:null},payouts:{available:false,pendingCents:null,pendingCount:null,paidCents:null,paidCount:null},bank:{asOf:null,available:false,matchedCents:null,unmatchedPaidCount:null,matches:[]}};
}
export function summarizeProviderEvidence(receipts: ProviderReceipt[], payouts: ProviderPayout[], deposits: ImportedDeposit[] | null, from: string,to: string,now: Date,synthetic=false): CashProviderEvidence {
  const bounds=cashPeriodBounds(from,to);
  const unique = (ids: string[]) => ids.every(Boolean) && new Set(ids).size===ids.length;
  if(!unique(receipts.map(r=>r.id)) || !unique(receipts.map(r=>r.reference)) || !unique(payouts.map(p=>p.id))) throw Error('Duplicate provider identity');
  if(receipts.some(r=>!Number.isFinite(Date.parse(r.paidAt)) || !Number.isSafeInteger(r.amountCents) || r.amountCents<0 || (r.feeCents!==null && (!Number.isSafeInteger(r.feeCents) || r.feeCents<0 || r.feeCents>r.amountCents)))) throw Error('Invalid receipt evidence');
  if(payouts.some(p=>(p.status==='success' && p.date===null) || (p.date!==null && !validCashPeriod(p.date,p.date)) || !Number.isSafeInteger(p.amountCents) || p.amountCents<0 || !['success','pending','processing','failed'].includes(p.status))) throw Error('Invalid payout evidence');
  const selected=receipts.filter(r=>Date.parse(r.paidAt)>=bounds.start && Date.parse(r.paidAt)<bounds.end);
  const paid=payouts.filter(p=>p.status==='success' && p.date!==null && p.date>=from && p.date<=to);
  // Pending is a current all-date provider observation, independent of selected-period receipts.
  const pending=payouts.filter(p=>p.status==='pending' || p.status==='processing');
  const matches: CashProviderEvidence['bank']['matches']=[];
  const usedPayouts=new Set<string>();
  if(deposits!==null) {
    if(!unique(deposits.map(d=>d.id))) throw Error('Duplicate imported bank identity');
    for(const p of payouts.filter(p=>p.status==='success')) {
      const candidates=deposits.filter(d=>p.date!==null && d.accountId===PAYSTACK_DESTINATION_ACCOUNT_ID && d.payoutReference===p.id && d.amountCents===p.amountCents && validCashPeriod(d.date,d.date) && d.date>=p.date && Date.parse(d.date)-Date.parse(p.date)<=7*86400000);
      // An ambiguous match cannot certify any of the candidate deposits.
      if(candidates.length!==1) continue;
      const d=candidates[0]; usedPayouts.add(p.id);
      matches.push({payoutId:p.id,depositId:d.id,bankDate:d.date,amountCents:d.amountCents});
    }
  }
  return { period:{from,to},asOf:now.toISOString(),synthetic,
    receipts:{available:true,grossCents:sum(selected.map(r=>r.amountCents)),feeCents:selected.every(r=>r.feeCents!==null)?sum(selected.map(r=>r.feeCents!)):null,count:selected.length},
    payouts:{available:true,pendingCents:sum(pending.map(p=>p.amountCents)),pendingCount:pending.length,paidCents:sum(paid.map(p=>p.amountCents)),paidCount:paid.length},
    bank:{asOf:deposits===null?null:now.toISOString(),available:deposits!==null,matchedCents:deposits===null?null:sum(matches.filter(m=>m.bankDate>=from && m.bankDate<=to).map(m=>m.amountCents)),unmatchedPaidCount:deposits===null?null:paid.filter(p=>!usedPayouts.has(p.id)).length,matches},
  };
}
export function syntheticProviderEvidence(from: string,to: string,now: Date) {
  return summarizeProviderEvidence([{id:'demo-charge',reference:'demo-reference',paidAt:`${from}T08:00:00+02:00`,amountCents:10000,feeCents:300}], [{id:'demo-paid',date:from,status:'success',amountCents:9700},{id:'demo-pending',date:to,status:'pending',amountCents:5000}], [{id:'demo-bank-line',payoutReference:'demo-paid',date:from,amountCents:9700,accountId:PAYSTACK_DESTINATION_ACCOUNT_ID}],from,to,now,true);
}
