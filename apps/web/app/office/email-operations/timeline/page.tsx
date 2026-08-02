import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type TimelineEvent = {
  id: string;
  event_type: string;
  resend_email_id: string | null;
  recipient_email: string | null;
  subject: string | null;
  event_created_at: string | null;
  received_at: string;
  booking_id: string | null;
  customer_id: string | null;
  message_type: string | null;
  campaign_id: string | null;
};

const LABELS: Record<string, string> = {
  "email.sent": "Sent",
  "email.delivered": "Delivered",
  "email.delivery_delayed": "Delayed",
  "email.bounced": "Bounced",
  "email.failed": "Failed",
  "email.suppressed": "Suppressed",
  "email.complained": "Complained",
  "email.opened": "Opened",
  "email.clicked": "Clicked",
};

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Johannesburg",
  }).format(date);
}

export default async function EmailTimelinePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const bookingId = one(params.booking_id).trim();
  const customerId = one(params.customer_id).trim();
  const recipient = one(params.recipient).trim().toLowerCase();
  const admin = getSupabaseAdmin();

  if (!admin) {
    return <main className="p-6"><div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900">Email timeline data is unavailable because Supabase is not configured.</div></main>;
  }

  let request = admin
    .from("email_delivery_events")
    .select("id,event_type,resend_email_id,recipient_email,subject,event_created_at,received_at,booking_id,customer_id,message_type,campaign_id")
    .order("received_at", { ascending: false })
    .limit(500);

  if (bookingId) request = request.eq("booking_id", bookingId);
  else if (customerId) request = request.eq("customer_id", customerId);
  else if (recipient) request = request.ilike("recipient_email", recipient);
  else request = request.limit(0);

  const result = await request;
  const events = (result.data ?? []) as TimelineEvent[];
  const grouped = new Map<string, TimelineEvent[]>();
  for (const event of events) {
    const key = event.resend_email_id ?? event.id;
    const list = grouped.get(key) ?? [];
    list.push(event);
    grouped.set(key, list);
  }

  return <main className="space-y-6 p-4 sm:p-6 lg:p-8">
    <header>
      <Link href="/office/email-operations" className="text-sm font-medium text-blue-600 hover:underline">← Email operations</Link>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Email Timeline</h1>
      <p className="mt-2 text-sm text-slate-600">Inspect the full Resend lifecycle for a booking, customer or recipient.</p>
    </header>

    <form method="get" className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-3">
      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Booking ID<input name="booking_id" defaultValue={bookingId} placeholder="Booking UUID" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Customer ID<input name="customer_id" defaultValue={customerId} placeholder="Customer UUID" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recipient<input name="recipient" defaultValue={recipient} placeholder="customer@example.com" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
      <div className="lg:col-span-3 flex gap-2"><button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Load timeline</button><Link href="/office/email-operations/timeline" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Reset</Link></div>
    </form>

    {result.error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">Timeline could not be loaded: {result.error.message}</div> : null}
    {!bookingId && !customerId && !recipient ? <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm text-blue-900">Enter one identifier above. Booking ID takes priority, followed by customer ID and recipient.</div> : null}

    <section className="space-y-4">
      {[...grouped.entries()].map(([messageId, messageEvents]) => {
        const first = messageEvents[messageEvents.length - 1] ?? messageEvents[0];
        return <article key={messageId} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
            <div><p className="font-semibold text-slate-950">{first?.subject ?? first?.message_type ?? "Email message"}</p><p className="mt-1 text-sm text-slate-600">{first?.recipient_email ?? "Unknown recipient"}</p></div>
            <div className="text-xs text-slate-500 sm:text-right"><p>{first?.message_type ?? "Unclassified"}</p><p className="font-mono">{messageId}</p></div>
          </div>
          <ol className="mt-4 space-y-3">
            {messageEvents.slice().reverse().map((event) => <li key={event.id} className="flex gap-3">
              <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-blue-500" />
              <div><p className="text-sm font-medium text-slate-800">{LABELS[event.event_type] ?? event.event_type}</p><p className="text-xs text-slate-500">{formatDate(event.event_created_at ?? event.received_at)}</p></div>
            </li>)}
          </ol>
          <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-500">
            {first?.booking_id ? <Link href={`/office/bookings/${first.booking_id}`} className="font-medium text-blue-600 hover:underline">Open booking</Link> : null}
            {first?.booking_id ? <span>Booking: {first.booking_id}</span> : null}
            {first?.customer_id ? <span>Customer: {first.customer_id}</span> : null}
            {first?.campaign_id ? <span>Campaign: {first.campaign_id}</span> : null}
          </div>
        </article>;
      })}
      {(bookingId || customerId || recipient) && !events.length ? <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">No contextual email events were found. New messages must include standard context tags before they can appear by booking or customer.</div> : null}
    </section>
  </main>;
}
