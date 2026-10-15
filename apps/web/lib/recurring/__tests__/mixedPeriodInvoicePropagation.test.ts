import {beforeEach,describe,expect,it,vi} from 'vitest';
const {reconcile,sync}=vi.hoisted(()=>({reconcile:vi.fn(),sync:vi.fn()}));
vi.mock('@/lib/recurring/reconcileRecurringPlanOccurrences',()=>({
 reconcileRecurringPlanOccurrences:reconcile,
 collectDraftInvoiceIdsForRecurringPlan:vi.fn(async()=>[]),
}));
vi.mock('@/lib/monthlyInvoice/syncMonthlyInvoiceToZohoBooks',()=>({syncDraftMonthlyInvoiceToZohoAfterRecompute:sync}));
import {propagateRecurringPlanToGeneratedBookings} from '@/lib/recurring/propagateRecurringPlanToGeneratedBookings';
beforeEach(()=>{
 vi.clearAllMocks();
 reconcile.mockResolvedValue({months_reconciled:1,bookings_cancelled:1,bookings_created:0,bookings_cancel_skipped:0,bookings_cancel_skipped_locked_invoice:0,bookings_cancel_skipped_locked_payout:0,invoice_ids:['invoice'],errors:[]});
});
describe('invoice reconciliation after forward cancellation',()=>{
 it.each([
  {month:'2026-10',dates:['2026-09-30','2026-10-05'],expected:1},
  {month:'2026-09',dates:['2026-09-30'],expected:0},
  {month:'2026-10',dates:['2026-09-30'],expected:0},
 ])('recomputes and syncs only authorized forward invoices: $month $dates',async({month,dates,expected})=>{
  const writes=vi.fn(()=>{throw new Error('unexpected booking write');});
  const rpc=vi.fn(async()=>({error:null}));
  const admin={rpc,from:(table:string)=>{
   let paged=false;
   const q={select:()=>q,eq:()=>q,neq:()=>q,order:()=>q,range:()=>{paged=true;return q;},
    maybeSingle:async()=>({data:{month,status:'draft'},error:null}),
    then:(resolve:(v:unknown)=>unknown)=>Promise.resolve({data:paged?dates.map((date,i)=>({id:String(i),date})):[],error:null}).then(resolve),
    update:writes,insert:writes,delete:writes};
   expect(['bookings','monthly_invoices']).toContain(table);return q;
  }};
  const result=await propagateRecurringPlanToGeneratedBookings(admin as never,{id:'plan',preferred_cleaner_id:null} as never,{reconcileSchedule:true});
  expect(result.bookings_cancelled).toBe(1);
  expect(result.invoices_recomputed).toBe(expected);
  expect(rpc).toHaveBeenCalledTimes(expected);
  if(expected)expect(rpc).toHaveBeenCalledWith('recompute_monthly_invoice_totals',{p_invoice_id:'invoice'});
  expect(sync).toHaveBeenCalledTimes(expected);
  expect(writes).not.toHaveBeenCalled();
 });
});
