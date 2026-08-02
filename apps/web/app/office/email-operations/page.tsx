import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type DeliveryEvent = {
  id: string;
  event_type: string;
  resend_email_id: string | null;
  recipient_email: string | null;
  subject: string | null;
  event_created_at: string | null;
  received_at: string;
};
type Suppression = { email: string; reason: string; source_event_type: string | null; suppressed_at: string };

const EVENT_LABELS: Record<string, string> = {
  "email.sent": "Sent", "email.delivered": "Delivered", "email.delivery_delayed": "Delayed",
  "email.bounced": "Bounced", "email.failed": "Failed", "email.suppressed": "Suppressed",
  "email.complained": "Complained", "email.opened": "Opened", "email.clicked": "Clicked",
};
const FILTER_EVENTS = ["all", ...Object.keys(EVENT_LABELS)];

function one(value: string | string[] | undefined): string { return Array.isArray(value) ? value[0] ?? "" : value ?? ""; }
function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Johannesburg" }).format(date);
}
function pct(value: number): string { return `${Math.round(value * 10) / 10}%`; }
function metricCard(label: string, value: string | number, description: string) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{typeof value === "number" ? value.toLocaleString("en-ZA") : value}</p><p className="mt-1 text-xs text-slate-500">{description}</p></div>;
}

export default async function EmailOperationsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const daysRaw = Number(one(params.days) || "30");
  const days = [7, 30, 90].includes(daysRaw) ? daysRaw : 30;
  const eventFilter = FILTER_EVENTS.includes(one(params.event)) ? one(params.event) : "all";
  const query = one(params.q).trim().toLowerCase();
  const admin = getSupabaseAdmin();
  if (!admin) return <main className="p-6"><div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900">Email operations data is unavailable because the Supabase service connection is not configured.</div></main>;

  const sinceIso = new Date(Date.now() - days * 86400000).toISOString();
  const [eventsResult, suppressionsResult] = await Promise.all([
    admin.from("email_delivery_events").select("id,event_type,resend_email_id,recipient_email,subject,event_created_at,received_at").gte("received_at", sinceIso).order("received_at", { ascending: false }).limit(1000),
    admin.from("email_suppressions").select("email,reason,source_event_type,suppressed_at").order("suppressed_at", { ascending: false }).limit(500),
  ]);
  const allEvents = (eventsResult.data ?? []) as DeliveryEvent[];
  const suppressions = (suppressionsResult.data ?? []) as Suppression[];
  const error = eventsResult.error?.message ?? suppressionsResult.error?.message ?? null;
  const count = (type: string) => allEvents.filter((event) => event.event_type === type).length;
  const sent = count("email.sent"), delivered = count("email.delivered"), bounced = count("email.bounced"), failed = count("email.failed"), complained = count("email.complained"), opened = count("email.opened"), clicked = count("email.clicked");
  const deliveryRate = sent ? (delivered / sent) * 100 : 0;
  const openRate = delivered ? (opened / delivered) * 100 : 0;
  const clickRate = delivered ? (clicked / delivered) * 100 : 0;
  const filteredEvents = allEvents.filter((event) => {
    if (eventFilter !== "all" && event.event_type !== eventFilter) return false;
    if (!query) return true;
    return `${event.recipient_email ?? ""} ${event.subject ?? ""} ${event.resend_email_id ?? ""}`.toLowerCase().includes(query);
  }).slice(0, 250);

  const daily = new Map<string, { sent: number; delivered: number; opened: number; bounced: number }>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setUTCHours(0,0,0,0); d.setUTCDate(d.getUTCDate() - i);
    daily.set(d.toISOString().slice(0,10), { sent: 0, delivered: 0, opened: 0, bounced: 0 });
  }
  for (const event of allEvents) {
    const key = (event.event_created_at ?? event.received_at).slice(0,10);
    const row = daily.get(key); if (!row) continue;
    if (event.event_type === "email.sent") row.sent++;
    if (event.event_type === "email.delivered") row.delivered++;
    if (event.event_type === "email.opened") row.opened++;
    if (event.event_type === "email.bounced") row.bounced++;
  }
  const trend = [...daily.entries()];
  const maxTrend = Math.max(1, ...trend.flatMap(([, r]) => [r.sent, r.delivered, r.opened, r.bounced]));

  return <main className="space-y-6 p-4 sm:p-6 lg:p-8">
    <header><p className="text-sm font-medium text-blue-600">Operations</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Email Management</h1><p className="mt-2 max-w-3xl text-sm text-slate-600">Resend delivery analytics, trends, filters and local suppression records. Times are shown in South Africa time.</p></header>
    {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">Some email data could not be loaded: {error}</div> : null}

    <form className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[160px_220px_1fr_auto]" method="get">
      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Date range<select name="days" defaultValue={String(days)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select></label>
      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Event type<select name="event" defaultValue={eventFilter} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900">{FILTER_EVENTS.map((value) => <option key={value} value={value}>{value === "all" ? "All events" : EVENT_LABELS[value]}</option>)}</select></label>
      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Search<input name="q" defaultValue={one(params.q)} placeholder="Recipient, subject or Resend ID" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900" /></label>
      <div className="flex items-end gap-2"><button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Apply</button><Link href="/office/email-operations" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Reset</Link></div>
    </form>

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {metricCard("Sent", sent, `Recorded in the last ${days} days`)}{metricCard("Delivered", delivered, `${pct(deliveryRate)} delivery rate`)}{metricCard("Opened", opened, `${pct(openRate)} open rate`)}{metricCard("Clicked", clicked, `${pct(clickRate)} click-through rate`)}{metricCard("Suppressed", suppressions.length, "Blocked locally")}
      {metricCard("Bounced", bounced, "Rejected by recipient servers")}{metricCard("Failed", failed, "Provider or delivery failures")}{metricCard("Complaints", complained, "Spam complaints")}
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div><h2 className="font-semibold text-slate-950">Daily email trend</h2><p className="mt-1 text-xs text-slate-500">Sent, delivered, opened and bounced events by day.</p></div><div className="mt-5 overflow-x-auto"><div className="flex min-w-[720px] items-end gap-2" style={{ height: 220 }}>{trend.map(([date, row]) => <div key={date} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1"><div className="flex h-44 w-full items-end justify-center gap-0.5"><div title={`Sent ${row.sent}`} className="w-1/4 rounded-t bg-blue-500" style={{ height: `${Math.max(row.sent ? 4 : 0, (row.sent / maxTrend) * 100)}%` }} /><div title={`Delivered ${row.delivered}`} className="w-1/4 rounded-t bg-emerald-500" style={{ height: `${Math.max(row.delivered ? 4 : 0, (row.delivered / maxTrend) * 100)}%` }} /><div title={`Opened ${row.opened}`} className="w-1/4 rounded-t bg-violet-500" style={{ height: `${Math.max(row.opened ? 4 : 0, (row.opened / maxTrend) * 100)}%` }} /><div title={`Bounced ${row.bounced}`} className="w-1/4 rounded-t bg-rose-500" style={{ height: `${Math.max(row.bounced ? 4 : 0, (row.bounced / maxTrend) * 100)}%` }} /></div><span className="text-[10px] text-slate-500">{date.slice(5)}</span></div>)}</div></div><div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-600"><span>● Sent</span><span>● Delivered</span><span>● Opened</span><span>● Bounced</span></div></section>

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 px-5 py-4"><h2 className="font-semibold text-slate-950">Delivery events</h2><p className="mt-1 text-xs text-slate-500">Showing {filteredEvents.length} matching events.</p></div><div className="overflow-x-auto"><table className="min-w-full divide-y divide-slate-200 text-sm"><thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Status</th><th className="px-5 py-3">Recipient</th><th className="px-5 py-3">Subject</th><th className="px-5 py-3">Resend ID</th><th className="px-5 py-3">Time</th></tr></thead><tbody className="divide-y divide-slate-100">{filteredEvents.length ? filteredEvents.map((event) => <tr key={event.id} className="align-top"><td className="whitespace-nowrap px-5 py-3 font-medium text-slate-800">{EVENT_LABELS[event.event_type] ?? event.event_type}</td><td className="px-5 py-3 text-slate-700">{event.recipient_email ?? "—"}</td><td className="max-w-md px-5 py-3 text-slate-700">{event.subject ?? "—"}</td><td className="max-w-xs truncate px-5 py-3 font-mono text-xs text-slate-500">{event.resend_email_id ?? "—"}</td><td className="whitespace-nowrap px-5 py-3 text-slate-500">{formatDate(event.event_created_at ?? event.received_at)}</td></tr>) : <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-500">No events match the current filters.</td></tr>}</tbody></table></div></section>

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 px-5 py-4"><h2 className="font-semibold text-slate-950">Suppression list</h2><p className="mt-1 text-xs text-slate-500">Latest locally blocked recipient addresses.</p></div><div className="overflow-x-auto"><table className="min-w-full divide-y divide-slate-200 text-sm"><thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Email</th><th className="px-5 py-3">Reason</th><th className="px-5 py-3">Source</th><th className="px-5 py-3">Suppressed</th></tr></thead><tbody className="divide-y divide-slate-100">{suppressions.length ? suppressions.slice(0,100).map((row) => <tr key={row.email}><td className="px-5 py-3 font-medium text-slate-800">{row.email}</td><td className="px-5 py-3 capitalize text-slate-700">{row.reason}</td><td className="px-5 py-3 text-slate-500">{row.source_event_type ?? "Manual"}</td><td className="whitespace-nowrap px-5 py-3 text-slate-500">{formatDate(row.suppressed_at)}</td></tr>) : <tr><td colSpan={4} className="px-5 py-10 text-center text-slate-500">No suppressed addresses have been recorded.</td></tr>}</tbody></table></div></section>
  </main>;
}
