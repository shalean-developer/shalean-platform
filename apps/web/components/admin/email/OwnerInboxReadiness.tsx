"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { adminFetch } from "@/hooks/useAdminData";
type Setup = { recipients: {email:string;status:string}[]; sendingEnabled:false; webhookConfigured:boolean };
const labels:Record<string,string> = {account_required:"Create a staging customer account",customer_account_required:"A customer account is required",verification_required:"Confirm this account’s email",consent_required:"Record your consent in customer preferences",delivery_paused:"Consent recorded; earlier opt-out needs review",consent_recorded:"Consent recorded; delivery verification pending"};
export function OwnerInboxReadiness() {
  const [setup,setSetup] = useState<Setup|null>(null);
  useEffect(()=>{let active=true;void adminFetch<Setup>("/api/admin/email/acceptance").then(r=>{if(active && r.data?.recipients?.length===2)setSetup(r.data);}).catch(()=>{});return()=>{active=false;};},[]);
  if(!setup)return null;
  return <section className="mt-5 rounded-xl border border-border p-4" aria-labelledby="owner-inbox-title">
    <h3 id="owner-inbox-title" className="font-semibold">Your inbox acceptance setup</h3>
    <p className="mt-2 text-sm text-muted-foreground">Only these two inboxes are designated for the next delivery test. Sending is paused. Listing an address does not grant marketing consent.</p>
    <ul className="mt-3 space-y-3 text-sm">{setup.recipients.map(r=><li key={r.email}><span className="break-all font-medium">{r.email}</span><p>{labels[r.status]??"Setup status unavailable"}</p></li>)}</ul>
    <p className="mt-3 text-sm">Use a separate browser profile for customer testing so your Office session stays signed in. Confirm the email, then choose Subscribe in that customer’s preferences.</p>
    <div className="mt-3 flex flex-wrap gap-4 text-sm font-semibold"><Link className="underline" href="/auth/login?redirect=%2Faccount%2Fprofile&intent=customer">Customer sign-in</Link><Link className="underline" href="/auth/signup?redirect=%2Faccount%2Fprofile">Create customer account</Link></div>
    <p className="mt-3 text-sm text-muted-foreground">Delivery feedback: {setup.webhookConfigured?"endpoint configured; live delivery verification pending":"setup pending"}. Provider contact changes remain disabled.</p>
  </section>;
}
