import { backfillRecurringOccurrencesToToday } from '@/lib/recurring/backfillRecurringOccurrencesToToday';
import { insertRecurringOccurrenceBooking } from '@/lib/recurring/insertRecurringOccurrenceBooking';
import { insertMonthlyRecurringOccurrenceBooking } from '@/lib/recurring/insertMonthlyRecurringOccurrenceBooking';
import { performAdminBookingStatusChange } from '@/lib/admin/performAdminBookingStatusChange';
import { runCleanerBookingLifecycleAction } from '@/lib/cleaner/runCleanerBookingLifecycleAction';
import { setAdminManualBookingDirectAssigned } from '@/lib/admin/adminManualDirectAssignCommand';
import { describe, it, expect, vi } from 'vitest';
import { ensureCleanerEarningsLedgerRow } from '@/lib/payout/ensureCleanerEarningsLedger';
import { applyRecurringOccurrenceRosterContinuity } from '@/lib/recurring/applyRecurringOccurrenceRosterContinuity';
import { collectDraftInvoiceIdsForRecurringPlan } from '@/lib/recurring/reconcileRecurringPlanOccurrences';
describe('October boundary consolidated regressions', () => {
 it.each(['2026-09-30',' 2026-09-30 ',null])('direct solo assignment rejects %s before expiring offers',async(date)=>{
  const writes:string[]=[];
  const admin={from:(table:string)=>{const q={select:()=>q,maybeSingle:async()=>({data:{date},error:null}),update:()=>{writes.push(table);return q;},eq:()=>q,then:(resolve:(v:unknown)=>unknown)=>Promise.resolve({error:table==='bookings'?{message:'historical_payout_item_deferred'}:null}).then(resolve)};return q;}};
  expect(await setAdminManualBookingDirectAssigned({admin:admin as never,bookingId:'old',cleanerId:'new',nowIso:'2026-10-14T17:00:00Z',prevCleanerId:'prior',assignMeta:{} as never,truthPatch:{}})).toMatchObject({ok:false});
  expect(writes).toEqual([]);
 });
 it.each(['2026-09-30',' 2026-09-30 ',null])('historical finalized solo %s cannot insert a missing ledger row', async (date) => {
  const inserted = vi.fn();
  const admin = {from(table:string) {let write=false;const q={select:()=>q,eq:()=>q,insert:(value:unknown)=>{inserted(value);write=true;return q;},maybeSingle:async()=>({error:null,data:table==='bookings'?{date,status:'completed',cleaner_id:'cleaner',is_team_job:false,cleaner_line_earnings_finalized_at:'2026-09-30T12:00:00Z',cleaner_earnings_total_cents:100}:write?{id:'new-ledger'}:null})};return q;}};
  expect(await ensureCleanerEarningsLedgerRow({admin:admin as never,bookingId:'old'})).toMatchObject({ok:true,skipped:true,reason:"historical_payout_item_deferred"});
  expect(inserted).not.toHaveBeenCalled();
 });
 it('historical custom recurring roster preserves its header', async()=>{
  const writes=vi.fn(); const rpc=vi.fn();
  const row={date:'2026-09-30',status:'pending',cleaner_id:'old',is_team_job:false,team_id:null,cleaner_line_earnings_finalized_at:null,booking_cleaners:[{cleaner_id:'other',role:'lead',source:'admin_roster_edit'}]};
  const q={select:()=>q,eq:()=>q,update:(patch:unknown)=>{writes(patch);return q;},maybeSingle:async()=>({data:row,error:null}),then:(resolve:(v:unknown)=>unknown)=>Promise.resolve({data:null,error:null}).then(resolve)};
  expect(await applyRecurringOccurrenceRosterContinuity({from:()=>q,rpc} as never,{bookingId:'old',recurringId:'plan'})).toMatchObject({ok:true,applied:false,reason:"historical_payout_item_deferred"});
  expect(writes).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalled();
 });
 it('draft invoice collection excludes historical invoices',async()=>{
  const q={select:()=>q,eq:()=>q,neq:()=>q,not:()=>q,then:(resolve:(v:unknown)=>unknown)=>Promise.resolve({data:[{date:'2026-07-01',monthly_invoice_id:'july-invoice',monthly_invoices:{status:'draft'}}],error:null}).then(resolve)};
  expect(await collectDraftInvoiceIdsForRecurringPlan({from:()=>q} as never,'plan')).toEqual([]);
 });
});

describe('historical creation and completion preflights',()=>{
 it.each(['2026-07','2026-09','invalid'])('rejects backfill window %s before any database access',async(month)=>{
  const from=vi.fn(()=>{throw new Error('unexpected database access');});
  expect(await backfillRecurringOccurrencesToToday({from} as never,'plan',{invoiceMonthYm:month})).toMatchObject({ok:false,error:'historical_payout_item_deferred'});
  expect(from).not.toHaveBeenCalled();
 });
 it.each([insertRecurringOccurrenceBooking,insertMonthlyRecurringOccurrenceBooking])('rejects direct historical occurrence insertion before any side effect',async(insert)=>{
  const from=vi.fn(()=>{throw new Error('unexpected database access');});
  expect(await insert({from} as never,{recurring:{id:'plan',customer_id:'customer',price:100,booking_snapshot_template:{}},occurrenceDateYmd:'2026-09-30',customerEmail:'fixture@example.test',customerName:null,customerPhone:null})).toEqual({ok:false,error:'historical_payout_item_deferred'});
  expect(from).not.toHaveBeenCalled();
 });
 it.each([null,0])('defers missing historical completion basis %s before lifecycle writes',async(display)=>{
  const writes=vi.fn(()=>{throw new Error('unexpected write');});
  const row={id:'old',date:'2026-09-30',status:'in_progress',cleaner_id:'cleaner',payout_owner_cleaner_id:'cleaner',display_earnings_cents:display};
  const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:row,error:null}),update:writes};
  const admin={from:()=>q};
  expect(await performAdminBookingStatusChange({admin:admin as never,bookingId:'old',status:'completed',reason:'Recorded service completion',adminUserId:'admin'})).toMatchObject({ok:false,status:409,code:'historical_payout_item_deferred'});
  expect(await runCleanerBookingLifecycleAction({admin:admin as never,bookingId:'old',cleanerId:'cleaner',action:'complete'})).toMatchObject({status:409,json:{code:'historical_payout_item_deferred'}});
  expect(writes).not.toHaveBeenCalled();
 });
});
