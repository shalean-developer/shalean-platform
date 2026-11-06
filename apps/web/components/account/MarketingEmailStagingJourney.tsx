"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabaseClient";

type State = { generation: number; evidenceCount: number; decision: string; unsubscribedAt: string | null; reconciliation: unknown[]; enrollment: unknown[] };
type Links = { url: string; unusedUrl: string; legacyUrl: string };
type Check = { label: string; status: "passed" | "failed" };
async function authorized(path: string, body?: object) {
  const client = getSupabaseClient();
  const session = await client?.auth.getSession();
  const token = session?.data.session?.access_token;
  if (!token) throw new Error("Sign in to the synthetic staging account to continue.");
  const response = await fetch(path, { method: body ? "POST" : "GET", cache: "no-store",
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!response.ok) throw new Error(`The staging check is unavailable (${response.status}).`);
  return response;
}
const state = async (): Promise<State> => (await authorized("/api/me/marketing-rehearsal")).json();
const issue = async (): Promise<Links> => (await authorized("/api/me/marketing-rehearsal", { action: "issue_links" })).json();
async function linkRequest(url: string, method: "GET" | "POST") {
  const target = new URL(url);
  if (target.origin !== window.location.origin || target.pathname !== "/api/marketing/unsubscribe")
    throw new Error("The test link is outside this staging site.");
  return fetch(target, { method, cache: "no-store", referrerPolicy: "no-referrer", headers: { Accept: method === "POST" ? "application/json" : "text/html" } });
}
function same(left: State, right: State) { return JSON.stringify(left) === JSON.stringify(right); }

export function MarketingEmailTestLink() {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_SHALEAN_APP_ENV !== "staging") return;
    let live = true;
    void authorized("/api/me/marketing-rehearsal").then(() => { if (live) setAvailable(true); }).catch(() => {});
    return () => { live = false; };
  }, []);
  return available ? <p className="mt-4 text-sm"><Link className="font-medium text-primary underline" href="/account/email-test">Test the staging email journey</Link></p> : null;
}

export function MarketingEmailStagingJourney() {
  const [current, setCurrent] = useState<State | null>(null);
  const [links, setLinks] = useState<Links | null>(null);
  const [checks, setChecks] = useState<Check[]>([]);
  const [error, setError] = useState("");
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void state().then(setCurrent).catch(() => setError("Sign in to the approved synthetic staging account. This test is unavailable for real customer accounts.")); }, []);
  async function run() {
    setBusy(true); setError(""); setChecks([]); setLinks(null);
    let withdrawn = false;
    let step = "Prepare signed links";
    const check = (ok: boolean) => {
      if (!ok) { setChecks(rows => [...rows, { label: step, status: "failed" }]); throw new Error(step); }
      setChecks(rows => [...rows, { label: step, status: "passed" }]);
    };
    try {
      const initial = await state();
      const issued = await issue();
      step = "Opening the signed confirmation does not change consent";
      const confirmation = await linkRequest(issued.url, "GET");
      check(confirmation.status === 200 && (await confirmation.text()).includes("Unsubscribe from marketing emails") && same(initial, await state()));
      step = "An older v1 link requires account confirmation and cannot withdraw";
      const oldPage = await linkRequest(issued.legacyUrl, "GET");
      const oldBody = await oldPage.text();
      check(oldPage.status === 200 && !oldBody.includes("<form") && (await linkRequest(issued.legacyUrl, "POST")).status === 409 && same(initial, await state()));
      step = "The current signed link records a withdrawal";
      if ((await linkRequest(issued.url, "POST")).status !== 200) check(false);
      const first = await state();
      check(first.decision === "withdrawn" && first.evidenceCount === initial.evidenceCount + 1);
      step = "Repeating the same link preserves evidence and queue state";
      check((await linkRequest(issued.url, "POST")).status === 200 && same(first, await state()));
      for (const status of ["completed", "processing"] as const) {
        await authorized("/api/me/marketing-rehearsal", { action: "prepare_replay", state: status });
        const before = await state();
        step = status === "completed" ? "Replay preserves a completed reconciliation job" : "Replay preserves an active processing claim and lease";
        check((await linkRequest(issued.url, "POST")).status === 200 && same(before, await state()));
      }
      await authorized("/api/me/marketing-rehearsal", { action: "prepare_replay", state: "pending" });
      await authorized("/api/me/marketing-rehearsal", { action: "prepare_partial" });
      step = "Replay recovers a missing opt-out projection without duplicating evidence";
      if ((await linkRequest(issued.url, "POST")).status !== 200) check(false);
      const recovered = await state();
      check(Boolean(recovered.unsubscribedAt) && recovered.evidenceCount === first.evidenceCount);
      step = "Fresh explicit consent advances the link generation";
      await authorized("/api/me/marketing-preferences", { decision: "granted", explicitOptIn: true, policyVersion: "marketing-email-2026-11-v1" });
      const granted = await state();
      check(granted.generation === initial.generation + 1 && granted.decision === "granted");
      step = "Both used and unused old links are rejected after re-subscription";
      check((await linkRequest(issued.url, "POST")).status === 409 && (await linkRequest(issued.unusedUrl, "POST")).status === 409 && same(granted, await state()));
      const fresh = await issue();
      step = "A new-generation link can unsubscribe again";
      if ((await linkRequest(fresh.url, "POST")).status !== 200) check(false);
      const final = await state();
      check(final.decision === "withdrawn" && final.generation === granted.generation);
      withdrawn = true;
      step = "A tampered signature is rejected without changing preferences";
      const tampered = new URL(fresh.url);
      const token = tampered.searchParams.get("token")!;
      tampered.searchParams.set("token", token.slice(0, -1) + (token.endsWith("A") ? "B" : "A"));
      check((await linkRequest(tampered.toString(), "POST")).status === 400 && same(final, await state()));
      setCurrent(final); setLinks(fresh);
    } catch {
      setError(`The journey stopped at: ${step}. It is not marked passed.`);
    } finally {
      if (!withdrawn) {
        try {
          await authorized("/api/me/marketing-rehearsal", { action: "prepare_replay", state: "pending" });
          await authorized("/api/me/marketing-preferences", { decision: "withdrawn", explicitOptIn: false });
          setCurrent(await state());
        } catch { setError(message => `${message} Cleanup could not be verified; review the synthetic account before continuing.`); }
      }
      setBusy(false);
    }
  }
  return <main className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
    <div><p className="text-sm font-semibold text-amber-800">STAGING · SYNTHETIC ACCOUNT ONLY · NO EMAILS SENT</p><h1 className="mt-2 text-2xl font-bold">Test your email marketing journey</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">This check opens signed links, records a test withdrawal, verifies replay and recovery, records fresh test consent, and rejects old links. It finishes with the test account unsubscribed.</p></div>
    <section className="rounded-2xl border bg-card p-5"><h2 className="font-semibold">Delivery safety</h2><p className="mt-2 text-sm">Outbound messaging and Resend contact writes stay disabled. Worker and webhook provider fault/retry tests run against isolated synthetic fixtures; this page never sends a message or contacts Resend.</p></section>
    {current && <section className="rounded-2xl border bg-card p-5"><h2 className="font-semibold">Synthetic account state</h2><dl className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><dt>Consent</dt><dd className="font-semibold">{current.decision}</dd></div><div><dt>Link generation</dt><dd className="font-semibold">{current.generation}</dd></div><div><dt>Evidence events</dt><dd className="font-semibold">{current.evidenceCount}</dd></div><div><dt>Provider delivery</dt><dd className="font-semibold">Disabled</dd></div></dl></section>}
    <section className="rounded-2xl border bg-card p-5"><label className="flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" checked={approved} disabled={busy} onChange={event => setApproved(event.target.checked)} /><span>I authorize consent and reconciliation-fixture changes for this synthetic staging account only.</span></label><button className="mt-4 min-h-12 rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground disabled:opacity-50" disabled={!approved || busy || !current} onClick={() => void run()}>{busy ? "Checking the journey…" : "Run no-send end-to-end checks"}</button></section>
    {error && <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">{error}</p>}
    {checks.length > 0 && <section className="rounded-2xl border bg-card p-5" aria-live="polite"><h2 className="font-semibold">Executed checks</h2><ol className="mt-3 space-y-3 text-sm">{checks.map((row, index) => <li key={index} className="flex gap-3"><span className={row.status === "passed" ? "font-semibold text-green-700" : "font-semibold text-red-700"}>{row.status === "passed" ? "PASS" : "FAIL"}</span><span>{row.label}</span></li>)}</ol></section>}
    {links && <p className="text-sm"><a className="font-semibold text-primary underline" href={links.url} target="_blank" rel="noopener noreferrer">Open the current unsubscribe confirmation</a></p>}
    <Link className="inline-block text-sm font-semibold text-primary underline" href="/account/profile">Back to email preferences</Link>
  </main>;
}
