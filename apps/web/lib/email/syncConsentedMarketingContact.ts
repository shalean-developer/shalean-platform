import type { SupabaseClient } from "@supabase/supabase-js";
import { validateEmailRecipient } from "@/lib/email/recipientSafety";

/** Enrollment happens ONLY after a new explicit consent event is recorded.
 * Never invoke from transactional sending, and never lift existing opt-outs.
 * This helper is source-only until the owner approves activation.
 */
export async function syncConsentedMarketingContact(
  admin: SupabaseClient,
  input: { customerId:string; email:string; apiKey?:string; segmentId?:string; fetchFn?:typeof fetch },
):Promise<"created"|"already_subscribed"|"blocked"|"retry_required"> {
  const recipient=validateEmailRecipient(input.email);
  if (!recipient.allowed || !input.customerId || !input.apiKey || !input.segmentId?.trim()) return "retry_required";
  const email=recipient.normalized;
  try {
    const [profile, consent, suppressed]=await Promise.all([
      admin.from("user_profiles").select("role,billing_email,marketing_emails_unsubscribed_at").eq("id",input.customerId).maybeSingle(),
      admin.from("marketing_email_consent_events").select("decision").eq("customer_id",input.customerId).eq("email",email)
        .eq("purpose","promotional_email").order("occurred_at",{ascending:false})
        .order("created_at",{ascending:false}).limit(1).maybeSingle(),
      admin.from("email_suppressions").select("email").eq("email",email).maybeSingle(),
    ]);
    if(profile.error || consent.error || suppressed.error) return "retry_required";
    if(profile.data?.role!=="customer" || profile.data.billing_email?.trim().toLowerCase()!==email
       || profile.data.marketing_emails_unsubscribed_at || consent.data?.decision!=="granted"
       || suppressed.data) return "blocked";
    const api=input.fetchFn ?? fetch;
    const headers={Authorization:`Bearer ${input.apiKey}`, "Content-Type":"application/json"};
    const suppression=await api(`https://api.resend.com/suppressions/${encodeURIComponent(email)}`,{headers,cache:"no-store"});
    if(suppression.ok) return "blocked";
    if(suppression.status!==404) return "retry_required";
    const current=await api(`https://api.resend.com/contacts/${encodeURIComponent(email)}`,{headers,cache:"no-store"});
    // Segment enrollment is a separate Resend Contacts API operation.
    // The create-contact endpoint does not itself prove segment membership.
    let createdNow=false;
    let contactId="";
    if(current.ok) {
      const body:unknown=await current.json();
      if(!body || typeof body!=="object" || !("unsubscribed" in body)
        || typeof body.unsubscribed!=="boolean" || !("id" in body)
        || typeof body.id!=="string" || !body.id.trim()) return "retry_required";
      if(body.unsubscribed) return "blocked"; // Never re-subscribe provider opt-outs.
      contactId=body.id;
    } else {
      if(current.status!==404) return "retry_required";
      // A concurrent contact creation is resolved by a later read-only retry.
      const created=await api("https://api.resend.com/contacts",{
        method:"POST",headers,body:JSON.stringify({email,unsubscribed:false}),
      });
      if(!created.ok) return "retry_required";
      const body:unknown=await created.json();
      if(!body || typeof body!=="object" || !("id" in body)
        || typeof body.id!=="string" || !body.id.trim()) return "retry_required";
      contactId=body.id;
      createdNow=true;
    }
    const segmentId=input.segmentId.trim();
    const segmentPath=`https://api.resend.com/contacts/${encodeURIComponent(contactId)}/segments`;
    const memberships=await api(segmentPath,{headers,cache:"no-store"});
    if(!memberships.ok) return "retry_required";
    const list:unknown=await memberships.json();
    if(!list || typeof list!=="object" || !("data" in list)
      || !Array.isArray(list.data)) return "retry_required";
    if(!list.data.some((segment:unknown)=>segment && typeof segment==="object"
       && "id" in segment && segment.id===segmentId)) {
      // Read current CRM consent again immediately before the segment write.
      const [fresh,latest]=await Promise.all([
        admin.from("user_profiles").select("marketing_emails_unsubscribed_at").eq("id",input.customerId).maybeSingle(),
        admin.from("marketing_email_consent_events").select("decision").eq("customer_id",input.customerId)
          .eq("email",email).eq("purpose","promotional_email")
          .order("occurred_at",{ascending:false}).order("created_at",{ascending:false})
          .limit(1).maybeSingle(),
      ]);
      if(fresh.error || latest.error || fresh.data?.marketing_emails_unsubscribed_at
         || latest.data?.decision!=="granted") return "blocked";
      const addition=await api(`${segmentPath}/${encodeURIComponent(segmentId)}`,{
        method:"POST",headers,
      });
      if(!addition.ok) return "retry_required";
    }
    return createdNow?"created":"already_subscribed";
  } catch {return "retry_required";}
}
