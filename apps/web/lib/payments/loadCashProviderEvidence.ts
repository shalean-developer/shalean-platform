import 'server-only';
import { zohoBooksClient } from '@/lib/zoho/zohoBooksClient';
import { PAYSTACK_DESTINATION_ACCOUNT_ID, summarizeProviderEvidence, syntheticProviderEvidence, unavailableProviderEvidence, validCashPeriod, type ProviderReceipt, type ProviderPayout, type ImportedDeposit } from './cashProviderEvidence';
type Raw = Record<string,unknown>;
const record=(v:unknown): Raw => v!==null && typeof v==='object' && !Array.isArray(v)?v as Raw:{};
const id=(v:unknown) => typeof v==='string' && v.trim()?v.trim():typeof v==='number' && Number.isSafeInteger(v)?String(v):'';
const cents=(v:unknown) => typeof v==='number' && Number.isSafeInteger(v) && v>=0?v:null;
const zar=(v:unknown) => typeof v==='number' && Number.isFinite(v) && Number.isSafeInteger(Math.round(v*100))?Math.round(v*100):null;
const payoutReference=(v:unknown) => typeof v==='string' ? /^(?:PAYSTACK-PAYOUT-)?(\d+)$/.exec(v.trim())?.[1]??'' : '';
type Snapshot={receipts:ProviderReceipt[];payouts:ProviderPayout[];asOf:Date};
let cached: {secret:string;expires:number;value:Snapshot}|undefined;
let flight: {secret:string;promise:Promise<Snapshot>}|undefined;
async function paystackPages(path:string,secret:string):Promise<Raw[]> {
  const rows:Raw[]=[]; let total:number|undefined;
  for(let page=1;page<=100;page++) {
    const params=new URLSearchParams({perPage:'100',page:String(page)});
    const res=await fetch(`https://api.paystack.co/${path}${path.includes('?')?'&':'?'}${params}`,{method:'GET',headers:{Authorization:`Bearer ${secret}`},cache:'no-store',signal:AbortSignal.timeout(15000)});
    if(!res.ok) throw Error('Provider unavailable');
    const data=record(await res.json()); const meta=record(data.meta);
    if(data.status!==true || !Array.isArray(data.data) || !Number.isSafeInteger(meta.total) || Number(meta.total)<0 || !Number.isSafeInteger(meta.pageCount)) throw Error('Provider pagination unverified');
    if(total!==undefined && total!==meta.total) throw Error('Provider snapshot changed');
    total=Number(meta.total); rows.push(...data.data.map(record));
    if(page>=Number(meta.pageCount)) {
      if(rows.length!==total) throw Error('Provider snapshot incomplete');
      return rows;
    }
  }
  throw Error('Provider pagination incomplete');
}
async function providerSnapshot(secret:string):Promise<Snapshot> {
  if(cached?.secret===secret && cached.expires>Date.now()) return cached.value;
  if(flight?.secret===secret) return flight.promise;
  const promise=(async()=>{
    // Scan all successful receipts, then filter by paid_at locally. The API date filter
    // is not treated as proof of payment-date completeness for older initiated charges.
    const [transactions,settlements]=await Promise.all([paystackPages('transaction?status=success',secret),paystackPages('settlement',secret)]);
    const receipts:ProviderReceipt[]=[]; const payouts:ProviderPayout[]=[];
    for(const t of transactions) {
      if(t.domain!=='live') throw Error('Provider mode mismatch');
      if(t.currency!=='ZAR' || t.status!=='success') continue;
      const amount=cents(t.amount); if(amount===null || !id(t.id) || typeof t.reference!=='string' || typeof t.paid_at!=='string') throw Error('Receipt unverified');
      receipts.push({id:id(t.id),reference:t.reference,paidAt:t.paid_at,amountCents:amount,feeCents:cents(t.fees)});
    }
    for(const s of settlements) {
      if(s.domain!=='live' || id(s.integration)!=='1019240') throw Error('Provider account or mode mismatch');
      if(s.currency!=='ZAR') continue;
      const amount=cents(s.effective_amount); const rawDate=typeof s.settlement_date==='string'?s.settlement_date.slice(0,10):'';
      const date=validCashPeriod(rawDate,rawDate)?rawDate:null;
      if(!/^\d+$/.test(id(s.id)) || amount===null || (s.status==='success' && date===null) || !['success','pending','processing','failed'].includes(String(s.status))) throw Error('Payout unverified');
      payouts.push({id:id(s.id),date,status:s.status as ProviderPayout['status'],amountCents:amount});
    }
    if(!settlements.length) throw Error('Provider identity unverified');
    const value={receipts,payouts,asOf:new Date()}; cached={secret,expires:Date.now()+60000,value}; return value;
  })();
  flight={secret,promise};
  try{return await promise;}finally{if(flight?.promise===promise) flight=undefined;}
}
async function importedBankDeposits(from:string,to:string):Promise<ImportedDeposit[]> {
  const rows:Raw[]=[]; const seen=new Set<string>();
  const after=new Date(Date.parse(from)-7*86400000).toISOString().slice(0,10);
  const before=new Date(Date.parse(to)+7*86400000).toISOString().slice(0,10);
  for(let page=1;page<=25;page++) {
    const params=new URLSearchParams({account_id:PAYSTACK_DESTINATION_ACCOUNT_ID,date_after:after,date_before:before,page:String(page),per_page:'200',filter_by:'Status.All'});
    const res=record(await zohoBooksClient.getWithTokenRecovery(`/banktransactions?${params}`));
    const context=record(res.page_context);
    if(!Array.isArray(res.banktransactions) || typeof context.has_more_page!=='boolean') throw Error('Bank source incomplete');
    for(const raw of res.banktransactions) {
      const row=record(raw); const key=id(row.transaction_id);
      if(!key || seen.has(key)) throw Error('Bank page identity unverified');
      seen.add(key); rows.push(row);
    }
    if(!context.has_more_page) break;
    if(page===25) throw Error('Bank source incomplete');
  }
  const deposits:ImportedDeposit[]=[];
  // Only existing categorized/matched records with an explicit provider ID
  // are candidates. Amount/date alone and manually-added records never prove a match.
  for(const row of rows.filter(r=>payoutReference(r.reference_number) && ['matched','categorized'].includes(String(r.status??'').toLowerCase()))) {
    const res=record(await zohoBooksClient.getWithTokenRecovery(`/banktransactions/${encodeURIComponent(id(row.transaction_id))}`));
    const detail=record(res.banktransaction);
    if(id(detail.transaction_id)!==id(row.transaction_id) || detail.currency_code!=='ZAR' || id(detail.to_account_id)!==PAYSTACK_DESTINATION_ACCOUNT_ID || !Array.isArray(detail.imported_transactions)) continue;
    for(const raw of detail.imported_transactions) {
      const line=record(raw); const amount=zar(line.amount);
      if(!id(line.imported_transaction_id) || !['matched','categorized'].includes(String(line.status??'').toLowerCase()) || id(line.account_id)!==PAYSTACK_DESTINATION_ACCOUNT_ID || amount===null || amount<0 || typeof line.date!=='string') continue;
      deposits.push({id:id(line.imported_transaction_id),payoutReference:payoutReference(detail.reference_number),date:line.date.slice(0,10),amountCents:amount,accountId:PAYSTACK_DESTINATION_ACCOUNT_ID});
    }
  }
  return deposits;
}
export async function loadCashProviderEvidence(from:string,to:string,now=new Date()) {
  if(!validCashPeriod(from,to)) throw Error('Invalid cash-flow period');
  const env=process.env.SHALEAN_APP_ENV?.trim().toLowerCase();
  if(env==='staging' || env==='development') return syntheticProviderEvidence(from,to,now);
  const unavailable=()=>unavailableProviderEvidence(from,to,now);
  const secret=process.env.PAYSTACK_SECRET_KEY??'';
  if(!['production','prod'].includes(env??'') || !secret.startsWith('sk_live_') || process.env.ZOHO_ORGANIZATION_ID!=='927500285') return unavailable();
  try {
    const snapshot=await providerSnapshot(secret);
    const result=summarizeProviderEvidence(snapshot.receipts,snapshot.payouts,null,from,to,snapshot.asOf);
    try {
      const deposits=await importedBankDeposits(from,to);
      result.bank=summarizeProviderEvidence(snapshot.receipts,snapshot.payouts,deposits,from,to,snapshot.asOf).bank;
      result.bank.asOf=new Date().toISOString();
    } catch { /* independent provider metrics remain available */ }
    return result;
  } catch {return unavailable();}
}
