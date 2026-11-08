"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { adminFetch } from "@/hooks/useAdminData";
type Setup = { recipients: {email:string;status:string}[]; sendingEnabled:false; testSendEnabled:boolean; webhookConfigured:boolean };
const labels:Record<string,string> = {account_required:"Create a staging customer account",customer_account_required:"A customer account is required",verification_required:"Confirm this account’s email",consent_required:"Record your consent in customer preferences",delivery_paused:"Consent recorded; earlier opt-out needs review",consent_recorded:"Consent recorded; delivery verification pending"};
export function OwnerInboxReadiness() {
  const [setup,setSetup] = useState<Setup|null>(null);
  const [authorized,setAuthorized] = useState(false);
  const [busy,setBusy] = useState<string|null>(null);
  const [feedback,setFeedback] = useState<Record<string,string>>({});
  useEffect(()=>{let active=true;void adminFetch<Setup>("/api/admin/email/acceptance").then(r=>{if(active && r.data?.recipients?.length===2)setSetup(r.data);}).catch(()=>{});return()=>{active=false;};},[]);
  if(!setup)return null;
  const sendTest = async (email:string) => {
    if (!authorized || busy || !setup.testSendEnabled) return;
    setBusy(email);
    try {
      const result = await adminFetch<{outcome:string}>("/api/admin/email/acceptance/send", {
        method:"POST",body:JSON.stringify({email,explicitTestSend:true}),
      });
      const outcomes:Record<string,string> = {
        accepted:"Accepted by the email provider. Inbox receipt and delivery feedback still need verification.",
        already_requested:"A test was already requested for this subscription. Check Delivery operations; nothing was sent again.",
        accepted_tracking_review:"Provider accepted the email, but tracking needs review. Do not retry.",
        submission_unknown:"Submission outcome is uncertain. Check provider records; no automatic retry will run.",
      };
      setFeedback(previous=>({...previous,[email]:result.ok ? outcomes[result.data?.outcome??""]??"Check delivery records." : result.error??"Test unavailable."}));
    } finally {setBusy(null);setAuthorized(false);}
  };
  return <section className="mt-5 rounded-xl border border-border p-4" aria-labelledby="owner-inbox-title">
    <h3 id="owner-inbox-title" className="font-semibold">Your inbox acceptance setup</h3>
    <p className="mt-2 text-sm text-muted-foreground">Normal delivery stays paused. Each inbox can receive one test per subscription. Consent and suppression are checked again before sending.</p>
    <ul className="mt-3 space-y-3 text-sm">{setup.recipients.map(r=><li key={r.email}>
      <span className="break-all font-medium">{r.email}</span><p>{labels[r.status]??"Setup status unavailable"}</p>
      <button type="button" className="mt-2 rounded-lg border border-border px-3 py-2 font-semibold disabled:opacity-50" disabled={!authorized||Boolean(busy)||!setup.testSendEnabled||r.status!=="consent_recorded"} onClick={()=>void sendTest(r.email)}>{busy===r.email?"Submitting…":"Send test to this inbox"}</button>
      {feedback[r.email]&&<p role="status" className="mt-2">{feedback[r.email]}</p>}
    </li>)}</ul>
    <label className="mt-4 flex items-start gap-2 text-sm"><input type="checkbox" checked={authorized} disabled={Boolean(busy)||!setup.testSendEnabled} onChange={event=>setAuthorized(event.target.checked)}/>Send the Shalean staging delivery test to the inbox I select.</label>
    {!setup.testSendEnabled&&<p className="mt-2 text-sm">Restricted test delivery needs staging activation.</p>}
    <p className="mt-2 text-sm text-muted-foreground">Subject: [SHALEAN STAGING — TEST] Email preferences delivery test. Includes unsubscribe and preference links.</p>
    <p className="mt-3 text-sm">Use a separate browser profile for customer testing so your Office session stays signed in. Confirm the email, then choose Subscribe in that customer’s preferences.</p>
    <div className="mt-3 flex flex-wrap gap-4 text-sm font-semibold"><Link className="underline" href="/auth/login?redirect=%2Faccount%2Fprofile&intent=customer">Customer sign-in</Link><Link className="underline" href="/auth/signup?redirect=%2Faccount%2Fprofile">Create customer account</Link></div>
    <p className="mt-3 text-sm text-muted-foreground">Delivery feedback: {setup.webhookConfigured?"endpoint configured; live delivery verification pending":"setup pending"}. Provider contact changes remain disabled. <Link className="underline" href="/office/email-operations">Delivery operations</Link></p>
  </section>;
}
