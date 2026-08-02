import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type EventRow = { campaign_id: string | null; event_type: string; subject: string | null; message_type: string | null; resend_email_id: string | null; recipient_email: string | null; received_at: string; event_created_at: string | null };
type AttributionRow = { campaign_id: string; booking_id: string; recipient_email: string; interaction_type: string; interaction_at: string; booking_created_at: string; revenue_cents: number; message_type: string | null; resend_email_id: string | null };

type CampaignMetric = {
  campaignId: string; sent: number; delivered: number; opened: number; clicked: number; bounced: number; complained: number;
  bookings: number; revenueCents: number; subjects: Map<string, number>; messageTypes: Map<string, number>;
};

function one(value: string | string[] | undefined): string { return Array.isArray(value) ? value[0] ?? "" : value ?? ""; }
function pct(n: number): string { return `${Math.round(n * 10) / 10}%`; }
function money(cents: number): string { return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(cents / 100); }
function formatDate(value: string): string { return new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Johannesburg" }).format(new Date(value)); }
function topKey(map: Map<string, number>): string { return [...map.entries()].sort((a,b) => b[1] - a[1])[0]?.[0] ?? "—"; }

export default async function CampaignAnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const rawDays = Number(one(params.days) || "30");
  const days = [7, 30, 90].includes(rawDays) ? rawDays : 30;
  const q = one(params.q).trim().toLowerCase();
  const admin = getSupabaseAdmin();
  if (!admin) return <main className="p-6"><div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900">Campaign analytics is unavailable because Supabase is not configured.</div></main>;

  await admin.rpc("refresh_email_campaign_attributions", { p_days: days });
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const [eventsResult, attributionResult] = await Promise.all([
    admin.from("email_delivery_events").select("campaign_id,event_type,subject,message_type,resend_email_id,recipient_email,received_at,event_created_at").not("campaign_id", "is", null).gte("received_at", since).limit(5000),
    admin.from("email_campaign_attributions").select("campaign_id,booking_id,recipient_email,interaction_type,interaction_at,booking_created_at,revenue_cents,message_type,resend_email_id").gte("booking_created_at", since).order("booking_created_at", { ascending: false }).limit(2000),
  ]);

  const events = (eventsResult.data ?? []) as EventRow[];
  const attributions = (attributionResult.data ?? []) as AttributionRow[];
  const error = eventsResult.error?.message ?? attributionResult.error?.message ?? null;
  const campaigns = new Map<string, CampaignMetric>();
  const get = (id: string) => {
    let row = campaigns.get(id);
    if (!row) { row = { campaignId: id, sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, complained: 0, bookings: 0, revenueCents: 0, subjects: new Map(), messageTypes: new Map() }; campaigns.set(id, row); }
    return row;
  };

  for (const event of events) {
    if (!event.campaign_id) continue;
    const row = get(event.campaign_id);
    if (event.event_type === "email.sent") row.sent++;
    if (event.event_type === "email.delivered") row.delivered++;
    if (event.event_type === "email.opened") row.opened++;
    if (event.event_type === "email.clicked") row.clicked++;
    if (event.event_type === "email.bounced") row.bounced++;
    if (event.event_type === "email.complained") row.complained++;
    if (event.subject) row.subjects.set(event.subject, (row.subjects.get(event.subject) ?? 0) + 1);
    if (event.message_type) row.messageTypes.set(event.message_type, (row.messageTypes.get(event.message_type) ?? 0) + 1);
  }
  for (const a of attributions) { const row = get(a.campaign_id); row.bookings++; row.revenueCents += Number(a.revenue_cents ?? 0); }

  const rows = [...campaigns.values()]
    .filter((r) => !q || `${r.campaignId} ${topKey(r.subjects)} ${topKey(r.messageTypes)}`.toLowerCase().includes(q))
    .sort((a,b) => b.revenueCents - a.revenueCents || b.bookings - a.bookings);
  const totals = rows.reduce((a,r) => ({ sent: a.sent+r.sent, delivered: a.delivered+r.delivered, opened:a.opened+r.opened, clicked:a.clicked+r.clicked, bookings:a.bookings+r.bookings, revenue:a.revenue+r.revenueCents }), { sent:0, delivered:0, opened:0, clicked:0, bookings:0, revenue:0 });
  const conversionRate = totals.delivered ? totals.bookings / totals.delivered * 100 : 0;
  const revenuePerRecipient = totals.delivered ? totals.revenue / totals.delivered : 0;

  return <main className="space-y-6 p-4 sm:p-6 lg:p-8">
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-sm font-medium text-blue-600">Email Operations</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Campaign Analytics</h1><p className="mt-2 max-w-3xl text-sm text-slate-600">Last-touch attribution based on the most recent tracked click or open within 30 days before a booking. Revenue uses the booking amount paid.</p></div><nav className="flex flex-wrap gap-2 text-sm"><Link className="rounded-lg border px-3 py-2" href="/office/email-operations">Events</Link><Link className="rounded-lg border px-3 py-2" href="/office/email-operations/timeline">Timeline</Link><Link className="rounded-lg border px-3 py-2" href="/office/email-operations/retry">Recovery</Link><Link className="rounded-lg border px-3 py-2" href="/office/email-operations/health">Health</Link></nav></header>
    {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">Some campaign data could not be loaded: {error}</div> : null}

    <form method="get" className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[180px_1fr_auto]"><label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reporting window<select name="days" defaultValue={String(days)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select></label><label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Search campaigns<input name="q" defaultValue={one(params.q)} placeholder="Campaign ID, subject or message type" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label><div className="flex items-end"><button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Apply</button></div></form>

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">{[
      ["Campaigns", rows.length.toLocaleString("en-ZA")], ["Delivered", totals.delivered.toLocaleString("en-ZA")], ["Opened", totals.opened.toLocaleString("en-ZA")], ["Clicked", totals.clicked.toLocaleString("en-ZA")], ["Bookings", totals.bookings.toLocaleString("en-ZA")], ["Attributed revenue", money(totals.revenue)]
    ].map(([label,value]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p></div>)}</section>

    <section className="grid gap-4 md:grid-cols-3"><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Booking conversion rate</p><p className="mt-2 text-3xl font-semibold">{pct(conversionRate)}</p><p className="mt-1 text-xs text-slate-500">Attributed bookings ÷ delivered emails</p></div><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Revenue per delivered recipient</p><p className="mt-2 text-3xl font-semibold">{money(revenuePerRecipient)}</p><p className="mt-1 text-xs text-slate-500">Attributed revenue ÷ delivered emails</p></div><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Attribution model</p><p className="mt-2 text-xl font-semibold">Last touch · 30 days</p><p className="mt-1 text-xs text-slate-500">Clicks take priority over opens; the latest qualifying interaction wins.</p></div></section>

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 px-5 py-4"><h2 className="font-semibold text-slate-950">Campaign performance</h2><p className="mt-1 text-xs text-slate-500">Ordered by attributed revenue.</p></div><div className="overflow-x-auto"><table className="min-w-full divide-y divide-slate-200 text-sm"><thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Campaign</th><th className="px-4 py-3">Sent</th><th className="px-4 py-3">Delivery</th><th className="px-4 py-3">Open</th><th className="px-4 py-3">Click</th><th className="px-4 py-3">Bookings</th><th className="px-4 py-3">Conversion</th><th className="px-4 py-3">Revenue</th><th className="px-4 py-3">Top subject</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.length ? rows.map((r) => <tr key={r.campaignId}><td className="px-4 py-3 font-mono text-xs font-semibold text-slate-800">{r.campaignId}</td><td className="px-4 py-3">{r.sent}</td><td className="px-4 py-3">{pct(r.sent ? r.delivered/r.sent*100 : 0)}</td><td className="px-4 py-3">{pct(r.delivered ? r.opened/r.delivered*100 : 0)}</td><td className="px-4 py-3">{pct(r.delivered ? r.clicked/r.delivered*100 : 0)}</td><td className="px-4 py-3 font-semibold">{r.bookings}</td><td className="px-4 py-3">{pct(r.delivered ? r.bookings/r.delivered*100 : 0)}</td><td className="px-4 py-3 font-semibold">{money(r.revenueCents)}</td><td className="max-w-sm px-4 py-3 text-slate-600">{topKey(r.subjects)}</td></tr>) : <tr><td colSpan={9} className="px-5 py-12 text-center text-slate-500">No tagged campaign activity exists in this reporting window. Marketing sends must include a campaign ID.</td></tr>}</tbody></table></div></section>

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 px-5 py-4"><h2 className="font-semibold text-slate-950">Recent attributed bookings</h2><p className="mt-1 text-xs text-slate-500">Auditable booking-level last-touch assignments.</p></div><div className="overflow-x-auto"><table className="min-w-full divide-y divide-slate-200 text-sm"><thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Booking</th><th className="px-4 py-3">Campaign</th><th className="px-4 py-3">Recipient</th><th className="px-4 py-3">Touch</th><th className="px-4 py-3">Booked</th><th className="px-4 py-3">Revenue</th></tr></thead><tbody className="divide-y divide-slate-100">{attributions.slice(0,100).map((a) => <tr key={a.booking_id}><td className="px-4 py-3"><Link className="font-mono text-xs font-semibold text-blue-700 hover:underline" href={`/office/bookings/${a.booking_id}`}>{a.booking_id.slice(0,8)}</Link></td><td className="px-4 py-3 font-mono text-xs">{a.campaign_id}</td><td className="px-4 py-3">{a.recipient_email}</td><td className="px-4 py-3">{a.interaction_type.replace("email.", "")} · {formatDate(a.interaction_at)}</td><td className="px-4 py-3">{formatDate(a.booking_created_at)}</td><td className="px-4 py-3 font-semibold">{money(a.revenue_cents)}</td></tr>)}</tbody></table></div></section>
  </main>;
}
