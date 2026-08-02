import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type DeliveryEvent = { event_type: string; event_created_at: string | null; received_at: string };
type ResendRecord = { record?: string; name?: string; type?: string; value?: string; status?: string };
type ResendDomain = { id?: string; name?: string; status?: string; region?: string; records?: ResendRecord[] };
type DnsAnswer = { data?: string };

type Check = { label: string; status: "healthy" | "warning" | "critical" | "unknown"; detail: string };

function one(value: string | string[] | undefined): string { return Array.isArray(value) ? value[0] ?? "" : value ?? ""; }
function pct(value: number): string { return `${Math.round(value * 100) / 100}%`; }
function statusClasses(status: Check["status"]): string {
  if (status === "healthy") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "warning") return "border-amber-200 bg-amber-50 text-amber-800";
  if (status === "critical") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}
function metricCard(label: string, value: string | number, description: string) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{typeof value === "number" ? value.toLocaleString("en-ZA") : value}</p><p className="mt-1 text-xs text-slate-500">{description}</p></div>;
}
function normalizeRecord(record: ResendRecord): string { return `${record.record ?? ""} ${record.name ?? ""} ${record.type ?? ""} ${record.value ?? ""}`.toLowerCase(); }

async function loadResendDomain(domainName: string): Promise<{ domain: ResendDomain | null; error: string | null }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { domain: null, error: "RESEND_API_KEY is not configured." };
  try {
    const response = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${apiKey}` }, cache: "no-store" });
    if (!response.ok) return { domain: null, error: `Resend domain request failed (${response.status}).` };
    const json = await response.json() as { data?: ResendDomain[] };
    const summary = json.data?.find((item) => item.name === domainName) ?? null;
    if (!summary?.id) return { domain: summary, error: summary ? null : `${domainName} was not found in Resend.` };
    const detailResponse = await fetch(`https://api.resend.com/domains/${summary.id}`, { headers: { Authorization: `Bearer ${apiKey}` }, cache: "no-store" });
    if (!detailResponse.ok) return { domain: summary, error: `Resend domain detail request failed (${detailResponse.status}).` };
    return { domain: await detailResponse.json() as ResendDomain, error: null };
  } catch (error) {
    return { domain: null, error: error instanceof Error ? error.message : "Unable to contact Resend." };
  }
}

async function loadDmarc(domainName: string): Promise<{ present: boolean; policy: string | null; error: string | null }> {
  try {
    const response = await fetch(`https://dns.google/resolve?name=_dmarc.${encodeURIComponent(domainName)}&type=TXT`, { cache: "no-store" });
    if (!response.ok) return { present: false, policy: null, error: `DNS check failed (${response.status}).` };
    const json = await response.json() as { Answer?: DnsAnswer[] };
    const record = json.Answer?.map((answer) => answer.data ?? "").find((value) => value.toLowerCase().includes("v=dmarc1")) ?? null;
    const policy = record?.match(/p=([^;\s"]+)/i)?.[1]?.toLowerCase() ?? null;
    return { present: Boolean(record), policy, error: null };
  } catch (error) {
    return { present: false, policy: null, error: error instanceof Error ? error.message : "Unable to check DMARC." };
  }
}

export default async function EmailHealthPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const daysRaw = Number(one(params.days) || "30");
  const days = [7, 30, 90].includes(daysRaw) ? daysRaw : 30;
  const domainName = process.env.RESEND_SENDING_DOMAIN || "shalean.co.za";
  const admin = getSupabaseAdmin();
  if (!admin) return <main className="p-6"><div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900">Email health data is unavailable because the Supabase service connection is not configured.</div></main>;

  const sinceIso = new Date(Date.now() - days * 86400000).toISOString();
  const [eventsResult, suppressionsResult, resendResult, dmarcResult] = await Promise.all([
    admin.from("email_delivery_events").select("event_type,event_created_at,received_at").gte("received_at", sinceIso).limit(10000),
    admin.from("email_suppressions").select("email", { count: "exact", head: true }),
    loadResendDomain(domainName),
    loadDmarc(domainName),
  ]);
  const events = (eventsResult.data ?? []) as DeliveryEvent[];
  const count = (type: string) => events.filter((event) => event.event_type === type).length;
  const sent = count("email.sent");
  const delivered = count("email.delivered");
  const bounced = count("email.bounced");
  const failed = count("email.failed");
  const complained = count("email.complained");
  const delayed = count("email.delivery_delayed");
  const suppressedEvents = count("email.suppressed");
  const deliveryRate = sent ? delivered / sent * 100 : 0;
  const bounceRate = sent ? bounced / sent * 100 : 0;
  const complaintRate = sent ? complained / sent * 100 : 0;
  const failureRate = sent ? failed / sent * 100 : 0;
  const delayedRate = sent ? delayed / sent * 100 : 0;

  const records = resendResult.domain?.records ?? [];
  const spfRecord = records.find((record) => normalizeRecord(record).includes("spf"));
  const dkimRecord = records.find((record) => normalizeRecord(record).includes("dkim"));
  const recordHealthy = (record: ResendRecord | undefined) => record?.status?.toLowerCase() === "verified";
  const domainVerified = resendResult.domain?.status?.toLowerCase() === "verified";

  const checks: Check[] = [
    { label: "Resend domain", status: domainVerified ? "healthy" : resendResult.domain ? "critical" : "unknown", detail: resendResult.domain ? `${domainName} is ${resendResult.domain.status ?? "unknown"} in Resend.` : resendResult.error ?? "Domain status unavailable." },
    { label: "SPF", status: spfRecord ? (recordHealthy(spfRecord) ? "healthy" : "warning") : "critical", detail: spfRecord ? `SPF record is ${spfRecord.status ?? "present but unverified"}.` : "No SPF record was returned by Resend." },
    { label: "DKIM", status: dkimRecord ? (recordHealthy(dkimRecord) ? "healthy" : "warning") : "critical", detail: dkimRecord ? `DKIM record is ${dkimRecord.status ?? "present but unverified"}.` : "No DKIM record was returned by Resend." },
    { label: "DMARC", status: dmarcResult.present ? (dmarcResult.policy === "reject" || dmarcResult.policy === "quarantine" ? "healthy" : "warning") : (dmarcResult.error ? "unknown" : "critical"), detail: dmarcResult.present ? `DMARC policy is p=${dmarcResult.policy ?? "unknown"}.` : dmarcResult.error ?? "No DMARC TXT record was found." },
    { label: "Delivery rate", status: !sent ? "unknown" : deliveryRate >= 98 ? "healthy" : deliveryRate >= 95 ? "warning" : "critical", detail: sent ? `${pct(deliveryRate)} over the last ${days} days.` : "No sent events are available for this period." },
    { label: "Bounce rate", status: !sent ? "unknown" : bounceRate <= 1 ? "healthy" : bounceRate <= 2 ? "warning" : "critical", detail: sent ? `${pct(bounceRate)} over the last ${days} days.` : "No sent events are available for this period." },
    { label: "Complaint rate", status: !sent ? "unknown" : complaintRate <= 0.1 ? "healthy" : complaintRate <= 0.3 ? "warning" : "critical", detail: sent ? `${pct(complaintRate)} over the last ${days} days.` : "No sent events are available for this period." },
  ];
  const weights = { healthy: 100, warning: 65, critical: 20, unknown: 50 } as const;
  const healthScore = Math.round(checks.reduce((sum, check) => sum + weights[check.status], 0) / checks.length);
  const healthLabel = healthScore >= 85 ? "Healthy" : healthScore >= 65 ? "Needs attention" : "At risk";

  const recommendations: string[] = [];
  if (!domainVerified) recommendations.push("Complete or repair the Resend domain verification records before increasing sending volume.");
  if (!spfRecord || !recordHealthy(spfRecord)) recommendations.push("Verify the SPF record shown in Resend and remove conflicting SPF records.");
  if (!dkimRecord || !recordHealthy(dkimRecord)) recommendations.push("Verify the Resend DKIM record so recipient servers can authenticate Shalean messages.");
  if (!dmarcResult.present) recommendations.push("Publish a DMARC TXT record at _dmarc.shalean.co.za, beginning with monitoring before enforcing quarantine or reject.");
  else if (dmarcResult.policy === "none") recommendations.push("Review DMARC reports and move from p=none to quarantine or reject when legitimate sources are aligned.");
  if (bounceRate > 1) recommendations.push("Review bounced recipients, validate addresses before sending, and keep the suppression list enforced.");
  if (complaintRate > 0.1) recommendations.push("Review email frequency, consent and unsubscribe handling because the complaint rate is above the preferred threshold.");
  if (delayedRate > 2) recommendations.push("Investigate delivery delays by recipient domain and monitor whether delayed messages later deliver or fail.");
  if (!recommendations.length) recommendations.push("No urgent action is required. Continue monitoring delivery, bounce and complaint trends.");

  const daily = new Map<string, { sent: number; delivered: number; bounced: number; complained: number }>();
  for (let i = days - 1; i >= 0; i--) { const d = new Date(); d.setUTCHours(0,0,0,0); d.setUTCDate(d.getUTCDate() - i); daily.set(d.toISOString().slice(0,10), { sent: 0, delivered: 0, bounced: 0, complained: 0 }); }
  for (const event of events) { const key = (event.event_created_at ?? event.received_at).slice(0,10); const row = daily.get(key); if (!row) continue; if (event.event_type === "email.sent") row.sent++; if (event.event_type === "email.delivered") row.delivered++; if (event.event_type === "email.bounced") row.bounced++; if (event.event_type === "email.complained") row.complained++; }
  const trend = [...daily.entries()];
  const maxTrend = Math.max(1, ...trend.flatMap(([, row]) => [row.sent, row.delivered, row.bounced, row.complained]));
  const loadError = eventsResult.error?.message ?? suppressionsResult.error?.message ?? resendResult.error ?? null;

  return <main className="space-y-6 p-4 sm:p-6 lg:p-8">
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-sm font-medium text-blue-600">Email operations · Phase 4</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Email Health Dashboard</h1><p className="mt-2 max-w-3xl text-sm text-slate-600">Authentication status, sender reputation signals and delivery health for {domainName}.</p></div><div className="flex flex-wrap gap-2"><Link href="/office/email-operations" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700">Email events</Link><Link href="/office/email-operations/timeline" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700">Timeline</Link><Link href="/office/email-operations/retry" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700">Recovery</Link></div></header>
    {loadError ? <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Some health data could not be loaded: {loadError}</div> : null}
    <form method="get" className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reporting window<select name="days" defaultValue={String(days)} className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select></label><button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Apply</button></form>

    <section className="grid gap-4 lg:grid-cols-[320px_1fr]"><div className={`rounded-3xl border p-6 ${healthScore >= 85 ? "border-emerald-200 bg-emerald-50" : healthScore >= 65 ? "border-amber-200 bg-amber-50" : "border-rose-200 bg-rose-50"}`}><p className="text-sm font-semibold uppercase tracking-wide text-slate-600">Overall health score</p><p className="mt-4 text-6xl font-bold tracking-tight text-slate-950">{healthScore}</p><p className="mt-2 text-lg font-semibold text-slate-800">{healthLabel}</p><p className="mt-3 text-sm text-slate-600">Calculated from domain authentication and recent delivery outcomes.</p></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{checks.map((check) => <div key={check.label} className={`rounded-2xl border p-4 ${statusClasses(check.status)}`}><div className="flex items-center justify-between gap-3"><p className="font-semibold">{check.label}</p><span className="rounded-full bg-white/70 px-2 py-1 text-[10px] font-bold uppercase tracking-wide">{check.status}</span></div><p className="mt-2 text-xs leading-5">{check.detail}</p></div>)}</div></section>

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{metricCard("Sent", sent, `Last ${days} days`)}{metricCard("Delivery rate", pct(deliveryRate), `${delivered.toLocaleString("en-ZA")} delivered`)}{metricCard("Bounce rate", pct(bounceRate), `${bounced.toLocaleString("en-ZA")} bounced`)}{metricCard("Complaint rate", pct(complaintRate), `${complained.toLocaleString("en-ZA")} complaints`)}{metricCard("Suppressed", suppressionsResult.count ?? 0, `${suppressedEvents} suppression events`)}{metricCard("Failure rate", pct(failureRate), `${failed.toLocaleString("en-ZA")} failed`)}{metricCard("Delayed rate", pct(delayedRate), `${delayed.toLocaleString("en-ZA")} delayed`)}</section>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-semibold text-slate-950">Health trend</h2><p className="mt-1 text-xs text-slate-500">Daily sent, delivered, bounced and complaint events.</p><div className="mt-5 overflow-x-auto"><div className="flex min-w-[720px] items-end gap-2" style={{ height: 220 }}>{trend.map(([date, row]) => <div key={date} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1"><div className="flex h-44 w-full items-end justify-center gap-0.5"><div title={`Sent ${row.sent}`} className="w-1/4 rounded-t bg-blue-500" style={{ height: `${Math.max(row.sent ? 4 : 0, row.sent / maxTrend * 100)}%` }} /><div title={`Delivered ${row.delivered}`} className="w-1/4 rounded-t bg-emerald-500" style={{ height: `${Math.max(row.delivered ? 4 : 0, row.delivered / maxTrend * 100)}%` }} /><div title={`Bounced ${row.bounced}`} className="w-1/4 rounded-t bg-rose-500" style={{ height: `${Math.max(row.bounced ? 4 : 0, row.bounced / maxTrend * 100)}%` }} /><div title={`Complaints ${row.complained}`} className="w-1/4 rounded-t bg-amber-500" style={{ height: `${Math.max(row.complained ? 4 : 0, row.complained / maxTrend * 100)}%` }} /></div><span className="text-[10px] text-slate-500">{date.slice(5)}</span></div>)}</div></div></section>

    <section className="grid gap-4 lg:grid-cols-2"><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-semibold text-slate-950">Recommended actions</h2><div className="mt-4 space-y-3">{recommendations.map((item, index) => <div key={item} className="flex gap-3 rounded-xl bg-slate-50 p-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">{index + 1}</span><p className="text-sm leading-6 text-slate-700">{item}</p></div>)}</div></div><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-semibold text-slate-950">Domain records reported by Resend</h2><p className="mt-1 text-xs text-slate-500">Region: {resendResult.domain?.region ?? "—"}</p><div className="mt-4 space-y-3">{records.length ? records.map((record, index) => <div key={`${record.name ?? "record"}-${index}`} className="rounded-xl border border-slate-200 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-mono text-xs font-semibold text-slate-800">{record.record ?? record.type ?? "DNS"} · {record.name ?? "—"}</p><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase text-slate-600">{record.status ?? "unknown"}</span></div><p className="mt-2 break-all font-mono text-[11px] text-slate-500">{record.value ?? "Value hidden or unavailable"}</p></div>) : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No domain records were returned.</p>}</div></div></section>
  </main>;
}
