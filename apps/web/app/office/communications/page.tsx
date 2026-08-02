import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type Communication = {
  id: string;
  channel: string;
  status: string | null;
  message_type: string | null;
  recipient: string | null;
  summary: string | null;
  booking_id: string | null;
  customer_id: string | null;
  provider_message_id: string | null;
  occurred_at: string;
};

function one(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] ?? "" : value ?? ""; }
function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Johannesburg" }).format(new Date(value));
}
function card(label: string, value: number, detail: string) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-2 text-3xl font-semibold text-slate-950">{value.toLocaleString("en-ZA")}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div>;
}

export default async function CommunicationsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const daysRaw = Number(one(params.days) || "30");
  const days = [7, 30, 90].includes(daysRaw) ? daysRaw : 30;
  const channel = one(params.channel) || "all";
  const query = one(params.q).trim().toLowerCase();
  const admin = getSupabaseAdmin();
  if (!admin) return <main className="p-6"><div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900">Communications data is unavailable because Supabase is not configured.</div></main>;

  const since = new Date(Date.now() - days * 86400000).toISOString();
  const result = await admin.from("communication_timeline").select("id,channel,status,message_type,recipient,summary,booking_id,customer_id,provider_message_id,occurred_at").gte("occurred_at", since).order("occurred_at", { ascending: false }).limit(1500);
  const rows = (result.data ?? []) as Communication[];
  const channels = ["email", "whatsapp", "sms", "push", "notification"];
  const count = (name: string) => rows.filter((row) => row.channel === name).length;
  const failures = rows.filter((row) => /fail|bounce|complain|suppressed|error/i.test(row.status ?? "")).length;
  const delivered = rows.filter((row) => /delivered|read|opened|clicked/i.test(row.status ?? "")).length;
  const filtered = rows.filter((row) => {
    if (channel !== "all" && row.channel !== channel) return false;
    if (!query) return true;
    return `${row.recipient ?? ""} ${row.summary ?? ""} ${row.message_type ?? ""} ${row.booking_id ?? ""}`.toLowerCase().includes(query);
  }).slice(0, 300);

  return <main className="space-y-6 p-4 sm:p-6 lg:p-8">
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div><p className="text-sm font-medium text-blue-600">Operations</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Communication Center</h1><p className="mt-2 max-w-3xl text-sm text-slate-600">A unified timeline for customer email, WhatsApp, SMS, push and operational notifications.</p></div>
      <div className="flex flex-wrap gap-2"><Link href="/office/email-operations" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">Email operations</Link><Link href="/office/email-operations/retry" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">Recovery center</Link></div>
    </header>

    {result.error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">Communication data could not be loaded: {result.error.message}</div> : null}

    <form method="get" className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[160px_180px_1fr_auto]">
      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Date range<select name="days" defaultValue={String(days)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select></label>
      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Channel<select name="channel" defaultValue={channel} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="all">All channels</option>{channels.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Search<input name="q" defaultValue={one(params.q)} placeholder="Customer, recipient, booking or message" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
      <div className="flex items-end gap-2"><button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Apply</button><Link href="/office/communications" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Reset</Link></div>
    </form>

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{card("All communications", rows.length, `Last ${days} days`)}{card("Email events", count("email"), "Resend lifecycle events")}{card("WhatsApp events", count("whatsapp"), "Outbound and delivery activity")}{card("Push notifications", count("push"), "In-app and push records")}{card("SMS events", count("sms"), "Logged SMS activity")}{card("Delivered / engaged", delivered, "Delivered, read, opened or clicked")}{card("Needs attention", failures, "Failed, bounced, complained or suppressed")}</section>

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4"><h2 className="font-semibold text-slate-950">Unified timeline</h2><p className="mt-1 text-xs text-slate-500">Showing {filtered.length} matching records.</p></div>
      <div className="overflow-x-auto"><table className="min-w-full divide-y divide-slate-200 text-sm"><thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Channel</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Recipient</th><th className="px-5 py-3">Message</th><th className="px-5 py-3">Context</th><th className="px-5 py-3">Time</th></tr></thead><tbody className="divide-y divide-slate-100">{filtered.length ? filtered.map((row) => <tr key={row.id} className="align-top"><td className="px-5 py-3 font-semibold capitalize text-slate-800">{row.channel}</td><td className="px-5 py-3 text-slate-700">{row.status ?? "—"}</td><td className="px-5 py-3 text-slate-700">{row.recipient ?? "—"}</td><td className="max-w-md px-5 py-3"><p className="font-medium text-slate-800">{row.summary ?? row.message_type ?? "Communication"}</p><p className="mt-1 text-xs text-slate-500">{row.message_type ?? "—"}</p></td><td className="px-5 py-3 text-xs text-slate-600">{row.booking_id ? <Link className="font-semibold text-blue-600 hover:underline" href={`/office/bookings/${row.booking_id}`}>Booking</Link> : null}{row.booking_id && row.customer_id ? " · " : null}{row.customer_id ? <span>Customer {row.customer_id.slice(0,8)}</span> : null}{!row.booking_id && !row.customer_id ? "—" : null}</td><td className="whitespace-nowrap px-5 py-3 text-slate-500">{formatDate(row.occurred_at)}</td></tr>) : <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-500">No communication records match the filters.</td></tr>}</tbody></table></div>
    </section>
  </main>;
}
