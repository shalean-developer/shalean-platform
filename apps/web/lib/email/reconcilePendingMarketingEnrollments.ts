import type { SupabaseClient } from "@supabase/supabase-js";
import { syncConsentedMarketingContact } from "@/lib/email/syncConsentedMarketingContact";

/** Source-only/UNSCHEDULED. Consent and suppressions are rechecked per attempt.
 * Marketing audience membership is never restored for a prior opt-out.
 */
export async function reconcilePendingMarketingEnrollments(
  admin: SupabaseClient, apiKey: string, segmentId: string,
): Promise<{ attempted: number; completed: number; blocked: number; deferred: number }> {
  if (!apiKey || !segmentId) throw new Error("Enrollment worker not configured.");
  const { data, error } = await admin.from("marketing_email_enrollment_jobs")
    .select("id,customer_id,email,attempt_count")
    .eq("status","pending").lte("next_attempt_at",new Date().toISOString())
    .order("next_attempt_at").limit(20);
  if (error) throw new Error("Cannot load pending marketing enrollments.");
  let completed=0,blocked=0,deferred=0;
  for (const job of data ?? []) {
    const outcome=await syncConsentedMarketingContact(admin,{
      customerId:job.customer_id,email:job.email,apiKey,segmentId,
    });
    const attempts=Number(job.attempt_count ?? 0)+1;
    const now=new Date().toISOString();
    const state=outcome==="created" || outcome==="already_subscribed" ? "completed"
      : outcome==="blocked" ? "blocked" : "pending";
    const delayMinutes=Math.min(1440,5*2**Math.min(attempts,8));
    const patch={
      status:state,attempt_count:attempts,updated_at:now,
      last_error:state==="pending"?"provider_retry_required":state==="blocked"?"eligibility_blocked":null,
      next_attempt_at:state==="pending"?new Date(Date.now()+delayMinutes*60000).toISOString():now,
    };
    const { data: saved,error: saveError } = await admin.from("marketing_email_enrollment_jobs")
      .update(patch).eq("id",job.id).eq("status","pending").select("id").maybeSingle();
    if (saveError || !saved) throw new Error("Cannot persist marketing enrollment outcome.");
    if(state==="completed") completed++;
    else if(state==="blocked") blocked++;
    else deferred++;
  }
  return {attempted:(data??[]).length,completed,blocked,deferred};
}
