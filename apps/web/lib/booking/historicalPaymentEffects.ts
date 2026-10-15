import 'server-only';
import {refreshRecurringPaymentStateForBooking} from '@/lib/recurring/refreshRecurringPaymentStateForBooking';
import {settleCleaningCreditForBooking} from '@/lib/referrals/creditReservations';
import type {SupabaseClient} from '@supabase/supabase-js';
import {cancelUnsentBookingPaymentRecoveryJobs} from '@/lib/booking/cancelUnsentBookingPaymentRecoveryJobs';
import {createPendingCustomerReferral,processCustomerReferralAfterFirstPaidBooking} from '@/lib/referrals/server';
import {syncUserPrimaryCityFromBooking} from '@/lib/growth/syncPrimaryCity';
import {attributePaidBookingToGrowthOutcomes} from '@/lib/growth/growthActionOutcomes';
import {recordConversionExperimentResultsOnPayment} from '@/lib/conversion/conversionExperimentOutcomes';
import {learnFromPaymentSuccess} from '@/lib/ai-autonomy/learningLoop';
import {reportOperationalIssue} from '@/lib/logging/systemLog';
export const HISTORICAL_PAYMENT_EFFECT_JOB='historical_payment_effect';
const effects=['payment_state','cancel_recovery','receipt','referral','city','growth','conversion'] as const;
export type HistoricalPaymentEffectPayload={bookingId:string;userId:string|null;customerEmail:string;amountCents:number;paystackReference:string;paidAtIso:string;cityId:string|null;referralCode:string;effect?:typeof effects[number]};

/** Observe returned DB errors even when older helpers log and return instead of throwing. */
export function observePaymentEffectErrors(admin:SupabaseClient,failures:string[]):SupabaseClient {
  const wrap=(target:any,rpcName?:string):any=>{
    if (!target || (typeof target!=='object' && typeof target!=='function')) return target;
    return new Proxy(target,{get(t,key){
      const member=Reflect.get(t,key);
      if (key==='then' && typeof member==='function') return (resolve:(v:unknown)=>unknown,reject:(e:unknown)=>unknown)=>member.call(t,(result:any)=>{
        if(result?.error && result.error.code!=='23505') failures.push(result.error.message??'database_error');
        const row=Array.isArray(result?.data)?result.data[0]:result?.data;
        if(rpcName==='award_customer_referral_credit' && !result?.error && !row?.ok) failures.push(row?.error_message??'referral_award_failed');
        return resolve(result);
      },reject);
      if(typeof member==='function') return (...args:unknown[])=>wrap(member.apply(t,args),key==='rpc'?String(args[0]):rpcName);
      return member;
    }});
  };
  return wrap(admin) as SupabaseClient;
}
export async function runHistoricalPaymentEffect(admin:SupabaseClient,p:HistoricalPaymentEffectPayload):Promise<void>{
  if(!p.effect || !effects.includes(p.effect)) throw new Error('invalid_historical_payment_effect');
  const failures:string[]=[];const db=observePaymentEffectErrors(admin,failures);
  switch(p.effect){
    case 'payment_state': {
      const settlement=await settleCleaningCreditForBooking(db,p.bookingId);
      if(!settlement.ok && settlement.error!=='reservation_not_found') throw new Error(`cleaning_credit_settlement_failed:${settlement.error}`);
      await refreshRecurringPaymentStateForBooking(db,p.bookingId);break;
    }

    case 'cancel_recovery': await cancelUnsentBookingPaymentRecoveryJobs(db,p.bookingId);break;
    case 'receipt': {const {error}=await db.rpc('audit_03c02_record_payment_receipt',{p_booking_id:p.bookingId,p_reference:p.paystackReference,p_amount_cents:p.amountCents});if(error) failures.push(error.message);break;}
    case 'referral':
      if(p.referralCode) await createPendingCustomerReferral({admin:db,refCode:p.referralCode,referredUserId:p.userId,referredEmail:p.customerEmail});
      if(failures.length) break;
      await processCustomerReferralAfterFirstPaidBooking({admin:db,bookingUserId:p.userId,customerEmail:p.customerEmail,bookingId:p.bookingId});break;
    case 'city': await syncUserPrimaryCityFromBooking(db,p.userId,p.cityId);break;
    case 'growth': await attributePaidBookingToGrowthOutcomes({admin:db,userId:p.userId,bookingId:p.bookingId,amountCents:p.amountCents,paidAtIso:p.paidAtIso});break;
    case 'conversion': await recordConversionExperimentResultsOnPayment(db,{bookingId:p.bookingId,userId:p.userId,revenueCents:p.amountCents,paidAtIso:p.paidAtIso});break;
  }
  if(failures.length) throw new Error(failures.join('; ').slice(0,1000));
}
export async function completeHistoricalPaymentEffects(admin:SupabaseClient,p:HistoricalPaymentEffectPayload):Promise<void>{
  // Capture already committed these jobs atomically. Reads/execution may fail without losing retries.
  const {data,error}=await admin.from('failed_jobs').select('id,payload')
    .eq('type',HISTORICAL_PAYMENT_EFFECT_JOB).contains('payload',{bookingId:p.bookingId});
  if(error) throw new Error('historical_payment_effect_queue_read_failed');
  let criticalFailure:unknown;
  for(const job of data??[]){
    try {await runHistoricalPaymentEffect(admin,job.payload as HistoricalPaymentEffectPayload);await admin.from('failed_jobs').delete().eq('id',job.id);}
    catch(error){if((job.payload as HistoricalPaymentEffectPayload).effect==='payment_state') criticalFailure=error;await reportOperationalIssue('warn','historicalPaymentEffects','Payment effect retained for retry',{bookingId:p.bookingId,effect:(job.payload as HistoricalPaymentEffectPayload).effect,error:String(error)});}
  }
  if(criticalFailure) throw criticalFailure;
  // Learning is advisory and does not own financial/customer attribution completion.
  void learnFromPaymentSuccess(admin,{userId:p.userId,bookingId:p.bookingId,amountCents:p.amountCents});
}
export async function retryHistoricalPaymentEffects(admin:SupabaseClient):Promise<void>{
 const {data,error}=await admin.from('failed_jobs').select('id,payload,attempts').eq('type',HISTORICAL_PAYMENT_EFFECT_JOB).order('created_at',{ascending:true}).limit(25);
 if(error) throw new Error(error.message);
 for(const job of data??[]){
  try{await runHistoricalPaymentEffect(admin,job.payload as HistoricalPaymentEffectPayload);const {error}=await admin.from('failed_jobs').delete().eq('id',job.id);if(error) throw new Error(error.message);}
  catch(error){const attempts=Number(job.attempts??0)+1;await admin.from('failed_jobs').update({attempts,type:attempts>=25?'historical_payment_effect_exhausted':HISTORICAL_PAYMENT_EFFECT_JOB}).eq('id',job.id);await reportOperationalIssue(attempts>=25?'critical':'warn','historicalPaymentEffects/retry','Payment effect retry failed',{jobId:job.id,attempts,error:String(error)});}
 }
}
