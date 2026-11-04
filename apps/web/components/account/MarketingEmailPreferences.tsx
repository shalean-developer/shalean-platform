"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useUser } from "@/hooks/useUser";

const POLICY_VERSION = "marketing-email-2026-11-v1";
type PreferenceStatus = "loading" | "no_consent" | "consent_recorded" | "unsubscribed" | "unavailable";

export function MarketingEmailPreferences() {
  const { user, loading: userLoading } = useUser();
  const [status, setStatus] = useState<PreferenceStatus>("loading");
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function request(method: "GET" | "POST", body?: object) {
    const sb = getSupabaseClient();
    if (!sb) throw new Error("Account connection unavailable.");
    const { data, error } = await sb.auth.getSession();
    if (error || !data.session?.access_token) throw new Error("Please sign in again.");
    const response = await fetch("/api/me/marketing-preferences", {
      method,
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Could not update your email preferences.");
    return await response.json() as { status?: PreferenceStatus };
  }

  useEffect(() => {
    if (userLoading) return;
    if (!user) { setStatus("unavailable"); return; }
    let cancelled = false;
    void request("GET").then((result) => {
      if (!cancelled) setStatus(result.status ?? "unavailable");
    }).catch(() => { if (!cancelled) setStatus("unavailable"); });
    return () => { cancelled = true; };
  }, [user, userLoading]);

  async function update(decision: "granted" | "withdrawn") {
    setBusy(true); setMessage("");
    try {
      await request("POST", {
        decision,
        policyVersion: POLICY_VERSION,
        explicitOptIn: decision === "granted" && checked,
      });
      setChecked(false);
      setStatus(decision === "granted" ? "consent_recorded" : "unsubscribed");
      setMessage(decision === "granted"
        ? "Your marketing consent has been recorded. Promotional emails remain subject to delivery preferences and safety checks."
        : "You have unsubscribed from marketing emails. Essential booking and account notices are unaffected.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update preferences.");
    } finally { setBusy(false); }
  }
  return (
    <section aria-labelledby="marketing-email-title" className="rounded-2xl border border-border bg-card p-5">
      <h2 id="marketing-email-title" className="text-base font-semibold">Marketing email preferences</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Get occasional Shalean cleaning offers, seasonal tips and referral promotions by email.
        You can unsubscribe at any time. Booking confirmations, payment receipts and security notices continue separately.
      </p>
      <p className="mt-3 text-sm" role="status">
        {status === "loading" ? "Checking preferences…" :
         status === "consent_recorded" ? "Marketing consent recorded." :
         status === "unsubscribed" ? "Unsubscribed from marketing emails." :
         status === "no_consent" ? "You have not subscribed to marketing emails." :
         "Preferences are temporarily unavailable."}
      </p>
      <label className="mt-3 flex items-start gap-2 text-sm">
        <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)}
          disabled={busy || status === "loading" || status === "unavailable"} className="mt-1" />
        <span>I agree to receive occasional promotional emails from Shalean Cleaning Services.</span>
      </label>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" disabled={busy || !checked || status === "loading" || status === "unavailable" || status === "unsubscribed"}
          onClick={() => void update("granted")} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
          Subscribe
        </button>
        <button type="button" disabled={busy || status === "loading" || status === "unavailable"}
          onClick={() => void update("withdrawn")} className="rounded-lg border border-border px-4 py-2 text-sm font-medium disabled:opacity-50">
          Unsubscribe
        </button>
      </div>
      {message && <p role="status" className="mt-3 text-sm">{message}</p>}
    </section>
  );
}
