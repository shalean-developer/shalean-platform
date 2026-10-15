import {describe,it,expect,vi} from 'vitest';
vi.mock('@/lib/booking/bookingLifecycleJobs',()=>({scheduleBookingLifecycleJobs:vi.fn()}));
vi.mock('@/lib/logging/systemLog',()=>({logSystemEvent:vi.fn(),reportOperationalIssue:vi.fn()}));
import {scheduleBookingLifecycleJobs} from '@/lib/booking/bookingLifecycleJobs';
import {recordBookingSideEffects} from '@/lib/booking/recordBookingSideEffects';
describe('historical payment-only effects',()=>{
 it('records payment event and customer totals without scheduling old lifecycle jobs',async()=>{
  const insert=vi.fn().mockResolvedValue({error:null});const rpc=vi.fn().mockResolvedValue({error:null});
  await recordBookingSideEffects({supabase:{from:()=>({insert}),rpc} as never,bookingId:'booking',userId:'customer',customerEmail:'customer@example.com',amountCents:12550,paystackReference:'charge',createdAt:'2026-09-30T12:00:00Z',appointmentDateYmd:'2026-09-30',appointmentTimeHm:'09:00',skipLifecycleJobs:true});
  expect(insert).toHaveBeenCalledWith(expect.objectContaining({event_type:'booking_created',booking_id:'booking'}));
  expect(rpc).toHaveBeenCalledWith('increment_user_profile_stats',{p_user_id:'customer',p_amount:12550});
  expect(scheduleBookingLifecycleJobs).not.toHaveBeenCalled();
 });
});
