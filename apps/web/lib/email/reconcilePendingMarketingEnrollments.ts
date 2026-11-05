import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { syncConsentedMarketingContact } from "@/lib/email/syncConsentedMarketingContact";

/** Source-only/UNSCHEDULED, protected by both cron lock and DB claims.
 * An expired lease is safely replayable: provider contact/segment writes are idempotent
 * and the live CRM opt-out is checked before each retry.
 */
export async function reconcilePendingMarketingEnrollments(
  admin: SupabaseClient, apiKey: string, segmentId: string,
): Promise<{attempted:number;completed:number;blocked:number;deferred:number}> {
  if(!apiKey || !segmentId) throw new Error("Enrollment worker not configured.");
  const now=new Date().toISOString();
  const {error:recoveryError}=await admin.from("marketing_email_enrollment_jobs")
    .update({status:"pending",claim_token:null,lease_expires_at:null})
    .eq("status","processing").lte("lease_expires_at",now);
  if(recoveryError) throw new Error("Cannot recover stale marketing enrollment leases.");
  const {data,error}=await admin.from("marketing_email_enrollment_jobs")
    .select("id,customer_id,email,attempt_count")
    .eq("status","pending").lte("next_attempt_at",now)
    .order("next_attempt_at").limit(20);
  if(error) throw new Error("Cannot load pending marketing enrollments.");
  let attempted=0,completed=0,blocked=0,deferred=0;
  for(const job of data??[]){
    const token=randomUUID();
    const {data:claimed,error:claimError}=await admin.from("marketing_email_enrollment_jobs")
      .update({status:"processing",claim_token:token,
        lease_expires_at:new Date(Date.now()+5*60_000).toISOString()})
      .eq("id",job.id).eq("status","pending")
      .lte("next_attempt_at",new Date().toISOString())
      .select("id").maybeSingle();
    if(claimError) throw new Error("Cannot claim marketing enrollment job.");
    if(!claimed) continue;
    attempted++;
    const outcome=await syncConsentedMarketingContact(admin,{
      customerId:job.customer_id,email:job.email,apiKey,segmentId,
    });
    const attempts=Number(job.attempt_count??0)+1;
    const done=outcome==="created"||outcome==="already_subscribed";
    const state=done?"completed":outcome==="blocked"?"blocked":"pending";
    const delayMinutes=Math.min(1440,5*2**Math.min(attempts,8));
    const nowFinish=new Date().toISOString();
    const patch={
      status:state,attempt_count:attempts,updated_at:nowFinish,
      last_error:state==="pending"?"provider_retry_required":state==="blocked"?"eligibility_blocked":null,
      next_attempt_at:state==="pending"?new Date(Date.now()+delayMinutes*60000).toISOString():nowFinish,
      claim_token:null,lease_expires_at:null,
    };
    const {data:saved,error:saveError}=await admin.from("marketing_email_enrollment_jobs")
      .update(patch).eq("id",job.id).eq("status","processing")
      .eq("claim_token",token).select("id").maybeSingle();
    if(saveError||!saved) throw new Error("Cannot persist marketing enrollment outcome.");
    if(done) completed++;
    else if(state==="blocked") blocked++;
    else deferred++;
  }
  return {attempted,completed,blocked,deferred};
}
