import {describe,it,expect,vi,beforeEach} from 'vitest';
const state=vi.hoisted(()=>({fail:true}));
vi.mock('@/lib/referrals/server',()=>({createPendingCustomerReferral:vi.fn(),processCustomerReferralAfterFirstPaidBooking:async({admin}:any)=>{await admin.rpc('award_customer_referral_credit');}}));
vi.mock('@/lib/referrals/creditReservations',()=>({settleCleaningCreditForBooking:async()=>({ok:true})}));
vi.mock('@/lib/recurring/refreshRecurringPaymentStateForBooking',()=>({refreshRecurringPaymentStateForBooking:async(admin:any)=>{await admin.rpc('refresh_test');}}));
vi.mock('@/lib/ai-autonomy/learningLoop',()=>({learnFromPaymentSuccess:vi.fn().mockResolvedValue(undefined)}));
vi.mock('@/lib/logging/systemLog',()=>({reportOperationalIssue:vi.fn()}));
import {reportOperationalIssue} from '@/lib/logging/systemLog';
import {runHistoricalPaymentEffect,retryHistoricalPaymentEffects,completeHistoricalPaymentEffects} from '@/lib/booking/historicalPaymentEffects';
const payload={bookingId:'booking',userId:null,customerEmail:'customer@example.com',amountCents:100,paystackReference:'charge',paidAtIso:'2026-09-30T12:00:00Z',cityId:null,referralCode:'',effect:'referral' as const};
describe('durable historical payment effect retries',()=>{
 beforeEach(()=>{state.fail=true;vi.clearAllMocks();});
 it.each([true,false])('detects silently handled referral RPC failure: transport=%s',async(transport)=>{
  const admin={rpc:async()=>transport?{data:null,error:{message:'transient'}}:{data:{ok:false,error_message:'award failed'},error:null}};
  await expect(runHistoricalPaymentEffect(admin as never,payload)).rejects.toThrow(transport?'transient':'award failed');
 });
 it.each(['referral','payment_state'] as const)('retains failed %s work, then retries and removes only after success',async(effect)=>{
  const jobPayload={...payload,effect};
  const remove=vi.fn();const update=vi.fn();
  const admin={rpc:async()=>state.fail?{data:null,error:{message:'transient'}}:{data:{ok:true},error:null},from:()=>{
   const q={select:()=>q,eq:()=>q,order:()=>q,limit:async()=>({data:[{id:'job',payload:jobPayload,attempts:0}],error:null}),
   delete:()=>({eq:async()=>{remove();return {error:null};}}),update:(patch:unknown)=>({eq:async()=>{update(patch);return {error:null};}})};return q;
  }};
  await retryHistoricalPaymentEffects(admin as never);expect(remove).not.toHaveBeenCalled();expect(update).toHaveBeenCalledWith(expect.objectContaining({attempts:1}));
  state.fail=false;await retryHistoricalPaymentEffects(admin as never);expect(remove).toHaveBeenCalledOnce();
 });
 it('does not run effects when the committed queue cannot be read',async()=>{
  const rpc=vi.fn();const admin={rpc,from:()=>({select:()=>({eq:()=>({contains:async()=>({data:null,error:{message:'queue down'}})})})})};
  await expect(completeHistoricalPaymentEffects(admin as never,payload)).rejects.toThrow('queue_read_failed');expect(rpc).not.toHaveBeenCalled();
 });
 it('retains critical payment-state work and reports incomplete finalization',async()=>{
  const remove=vi.fn();const q={select:()=>q,eq:()=>q,contains:async()=>({data:[{id:'critical',payload:{...payload,effect:'payment_state'}}],error:null}),delete:()=>({eq:remove})};
  const admin={from:()=>q,rpc:async()=>({data:null,error:{message:'refresh failed'}})};
  await expect(completeHistoricalPaymentEffects(admin as never,payload)).rejects.toThrow('refresh failed');
  expect(remove).not.toHaveBeenCalled();
 });

 it('reports retained retry work when successful effect cleanup returns a database error',async()=>{
  const jobs=[{id:'retained',payload}];const remove=vi.fn().mockResolvedValue({error:{message:'delete unavailable'}});
  const q={select:()=>q,eq:()=>q,contains:async()=>({data:jobs,error:null}),delete:()=>({eq:remove})};
  const admin={from:()=>q,rpc:async()=>({data:{ok:true},error:null})};
  await completeHistoricalPaymentEffects(admin as never,payload);
  expect(remove).toHaveBeenCalledWith('id','retained');expect(jobs).toHaveLength(1);
  expect(reportOperationalIssue).toHaveBeenCalledWith('warn','historicalPaymentEffects','Payment effect retained for retry',expect.objectContaining({error:expect.stringContaining('delete unavailable')}));
 });

});
