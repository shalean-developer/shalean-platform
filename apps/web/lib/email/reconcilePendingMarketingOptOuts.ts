import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { reconcileResendUnsubscribe } from "@/lib/email/reconcileResendUnsubscribe";

/** Unsubscribe-only. A DB-level conditional claim prevents concurrent provider writes.
 * Expired leases are recovered for idempotent unsubscribe replay after a crash.
 * This worker is unscheduled until a separate owner authorisation.
 */
export async function reconcilePendingMarketingOptOuts(
  admin: SupabaseClient, apiKey: string,
): Promise<{attempted:number;completed:number;deferred:number}> {
  const now=new Date().toISOString();
  const {error: recoveryError}=await admin.from("marketing_email_reconciliation_jobs")
    .update({status:"pending",claim_token:null,lease_expires_at:null})
    .eq("status","processing").lte("lease_expires_at",now);
  if(recoveryError) throw new Error("Cannot recover stale marketing unsubscribe leases.");
  const {data:due,error}=await admin.from("marketing_email_reconciliation_jobs")
    .select("id,email,attempt_count").eq("status","pending")
    .lte("next_attempt_at",now).order("next_attempt_at").limit(20);
  if(error) throw new Error("Cannot load marketing reconciliation queue.");
  let attempted=0,completed=0,deferred=0;
  for(const job of due??[]){
    const token=randomUUID();
    // Atomic compare-and-claim. A concurrent worker receives no returned row.
    const {data:claimed,error:claimError}=await admin.from("marketing_email_reconciliation_jobs")
      .update({status:"processing",claim_token:token,
        lease_expires_at:new Date(Date.now()+5*60_000).toISOString()})
      .eq("id",job.id).eq("status","pending")
      .lte("next_attempt_at",new Date().toISOString()).select("id").maybeSingle();
    if(claimError) throw new Error("Could not claim marketing unsubscribe job.");
    if(!claimed) continue;
    attempted++;
    const outcome=await reconcileResendUnsubscribe(job.email,{apiKey});
    const attempts=Number(job.attempt_count??0)+1;
    const finished=outcome==="updated"||outcome==="not_found";
    const delayMinutes=Math.min(24*60,5*Math.pow(2,Math.min(attempts,8)));
    const patch={
      status:finished?"completed":"pending",attempt_count:attempts,
      last_error:finished?null:"provider_retry_required",
      next_attempt_at:finished?new Date().toISOString()
        :new Date(Date.now()+delayMinutes*60_000).toISOString(),
      claim_token:null,lease_expires_at:null,updated_at:new Date().toISOString(),
    };
    const {data:saved,error:saveError}=await admin.from("marketing_email_reconciliation_jobs")
      .update(patch).eq("id",job.id).eq("status","processing")
      .eq("claim_token",token).select("id").maybeSingle();
    if(saveError||!saved) throw new Error("Could not persist provider reconciliation result.");
    if(finished) completed++; else deferred++;
  }
  return {attempted,completed,deferred};
}
