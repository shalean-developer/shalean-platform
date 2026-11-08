import { afterEach,expect,it,vi } from 'vitest';
const {get}=vi.hoisted(()=>({get:vi.fn()}));
vi.mock('@/lib/zoho/zohoBooksClient',()=>({zohoBooksClient:{getWithTokenRecovery:get}}));
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.resetAllMocks();vi.resetModules();});
async function setup(){
  vi.stubEnv('SHALEAN_APP_ENV','production');vi.stubEnv('ZOHO_ORGANIZATION_ID','927500285');vi.stubEnv('PAYSTACK_SECRET_KEY','sk_live_synthetic-unit-only');
  const fetch=vi.fn(async(input:string)=>{
    const url=new URL(input);expect(url.searchParams.get('perPage')).toBe('100');
    if(url.pathname==='/transaction')expect(url.searchParams.get('status')).toBe('success');
    const data=url.pathname==='/transaction'?[{id:1,domain:'live',status:'success',currency:'ZAR',reference:'synthetic-only',paid_at:'2026-11-01T08:00:00Z',amount:10000,fees:300}]:[{id:123,integration:1019240,domain:'live',currency:'ZAR',status:'pending',settlement_date:null,effective_amount:9700}];
    return new Response(JSON.stringify({status:true,data,meta:{total:1,pageCount:1}}));
  });vi.stubGlobal('fetch',fetch);get.mockRejectedValue(Error('no bank evidence'));
  const {loadCashProviderEvidence}=await import('../loadCashProviderEvidence');return {loadCashProviderEvidence,fetch};
}
it('isolates staging and unknown environments before any provider reads',async()=>{
  const fetch=vi.fn();vi.stubGlobal('fetch',fetch);const {loadCashProviderEvidence}=await import('../loadCashProviderEvidence');
  vi.stubEnv('SHALEAN_APP_ENV','staging');expect((await loadCashProviderEvidence('2026-11-01','2026-11-30')).synthetic).toBe(true);
  vi.stubEnv('SHALEAN_APP_ENV','unknown');expect((await loadCashProviderEvidence('2026-11-01','2026-11-30')).receipts.grossCents).toBeNull();
  expect(fetch).not.toHaveBeenCalled();expect(get).not.toHaveBeenCalled();
});
it('reads complete successful receipts and all-date pending payouts without bank writes, and coalesces refreshes',async()=>{
  const {loadCashProviderEvidence,fetch}=await setup();
  const s=await loadCashProviderEvidence('2026-11-01','2026-11-30');expect(s.receipts.grossCents).toBe(10000);expect(s.payouts.pendingCents).toBe(9700);expect(s.bank.available).toBe(false);
  await loadCashProviderEvidence('2026-10-01','2026-10-31');expect(fetch).toHaveBeenCalledTimes(2);
  for(const [url,opts] of fetch.mock.calls as unknown as [string,{method?:string}][]) {expect(url).toMatch(/^https:\/\/api.paystack.co\//);expect(opts.method).toBe('GET');}
});
it('fails closed on truncated/moving provider pagination instead of returning a partial zero',async()=>{
  const {loadCashProviderEvidence,fetch}=await setup();fetch.mockImplementation(async()=>new Response(JSON.stringify({status:true,data:[],meta:{total:2,pageCount:1}})));
  const s=await loadCashProviderEvidence('2026-11-01','2026-11-30');expect(s.receipts.grossCents).toBeNull();expect(s.payouts.pendingCents).toBeNull();
});
it('rejects an unexpected Paystack account identity',async()=>{
  const {loadCashProviderEvidence,fetch}=await setup();fetch.mockImplementation(async(input:string)=>new Response(JSON.stringify({status:true,data:new URL(input).pathname==='/transaction'?[]:[{id:123,integration:999,domain:'live',currency:'ZAR',status:'success',settlement_date:'2026-11-01',effective_amount:9700}],meta:{total:new URL(input).pathname==='/transaction'?0:1,pageCount:1}})));
  expect((await loadCashProviderEvidence('2026-11-01','2026-11-30')).payouts.available).toBe(false);
});

it.each([['matched','123'],['matched','PAYSTACK-PAYOUT-123'],['matched','unrelated-123'],['manually_added','PAYSTACK-PAYOUT-123']])('requires an imported link for %s with explicit reference %s',async(status,reference)=>{
  const {loadCashProviderEvidence,fetch}=await setup();
  fetch.mockImplementation(async(input:string)=>new Response(JSON.stringify({status:true,data:new URL(input).pathname==='/transaction'?[]:[{id:123,integration:1019240,domain:'live',currency:'ZAR',status:'success',settlement_date:'2026-11-01',effective_amount:9700}],meta:{total:new URL(input).pathname==='/transaction'?0:1,pageCount:1}})));
  get.mockImplementation(async(path:string)=>path.startsWith('/banktransactions?')?{banktransactions:[{transaction_id:'book-link',reference_number:reference,status}],page_context:{has_more_page:false}}:{banktransaction:{transaction_id:'book-link',currency_code:'ZAR',to_account_id:'253016000000097002',reference_number:reference,imported_transactions:[{imported_transaction_id:'bank-line',status:'matched',account_id:'253016000000097002',date:'2026-11-01',amount:97}]}});
  const s=await loadCashProviderEvidence('2026-11-01','2026-11-30');
  const eligible=status==='matched' && reference!=='unrelated-123';
  expect(s.payouts.paidCents).toBe(9700);expect(s.bank.matchedCents).toBe(eligible?9700:0);
  expect(get).toHaveBeenCalledTimes(eligible?2:1);
});

it('follows provider pagination metadata even when a page is shorter than requested',async()=>{
  const {loadCashProviderEvidence,fetch}=await setup();
  fetch.mockImplementation(async(input:string)=>{
    const url=new URL(input);const page=Number(url.searchParams.get('page'));
    const data=url.pathname==='/transaction'?[{id:page,domain:'live',status:'success',currency:'ZAR',reference:`synthetic-${page}`,paid_at:'2026-11-01T08:00:00Z',amount:10000,fees:300}]:[{id:123,integration:1019240,domain:'live',currency:'ZAR',status:'pending',settlement_date:null,effective_amount:9700}];
    return new Response(JSON.stringify({status:true,data,meta:{total:url.pathname==='/transaction'?2:1,pageCount:url.pathname==='/transaction'?2:1}}));
  });
  const s=await loadCashProviderEvidence('2026-11-01','2026-11-30');expect(s.receipts.count).toBe(2);expect(s.receipts.grossCents).toBe(20000);
});
