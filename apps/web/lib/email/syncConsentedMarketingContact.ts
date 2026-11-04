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
  if (!recipient.allowed || !input.customerId || !input.apiKey) return "retry_required";
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
    if(current.ok) {
      const body:unknown=await current.json();
      if(!body || typeof body!=="object" || !("unsubscribed" in body)
        || typeof body.unsubscribed!=="boolean") return "retry_required";
      // An earlier provider unsubscribe is authoritative. Never PATCH it to false.
      return body.unsubscribed ? "blocked" : "already_subscribed";
    }
    if(current.status!==404) return "retry_required";
    // Only a never-before-seen contact may be added, solely after explicit consent.
    const created=await api("https://api.resend.com/contacts",{
      method:"POST",headers,
      body:JSON.stringify({email,unsubscribed:false,
        ...(input.segmentId?{segmentIds:[input.segmentId]}:{})}),
    });
    // A concurrent creation is not proof of subscription. Read back on the next attempt.
    if(created.status===409) return "retry_required";
    return created.ok?"created":"retry_required";
  } catch {return "retry_required";}
}
