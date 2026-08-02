import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DeliveryEvent = {
  id: string;
  event_type: string;
  resend_email_id: string | null;
  recipient_email: string | null;
  subject: string | null;
  event_created_at: string | null;
  received_at: string;
};

type Suppression = {
  email: string;
  reason: string;
  source_event_type: string | null;
  suppressed_at: string;
};

const EVENT_LABELS: Record<string, string> = {
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

function metricCard(label: string, value: number, description: string) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{value.toLocaleString("en-ZA")}</p>
      <p className="mt-1 text-xs text-slate-500">{description}</p>
    </div>
  );
}

export default async function EmailOperationsPage() {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return (
      <main className="p-6">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
          Email operations data is unavailable because the Supabase service connection is not configured.
        </div>
      </main>
    );
  }

  const sinceIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [eventsResult, suppressionsResult] = await Promise.all([
    admin
      .from("email_delivery_events")
      .select("id,event_type,resend_email_id,recipient_email,subject,event_created_at,received_at")
      .gte("received_at", sinceIso)
      .order("received_at", { ascending: false })
      .limit(200),
    admin
      .from("email_suppressions")
      .select("email,reason,source_event_type,suppressed_at")
      .order("suppressed_at", { ascending: false })
      .limit(100),
  ]);

  const events = (eventsResult.data ?? []) as DeliveryEvent[];
  const suppressions = (suppressionsResult.data ?? []) as Suppression[];
  const error = eventsResult.error?.message ?? suppressionsResult.error?.message ?? null;

  const count = (type: string) => events.filter((event) => event.event_type === type).length;
  const sent = count("email.sent");
  const delivered = count("email.delivered");
  const bounced = count("email.bounced");
  const failed = count("email.failed");
  const complained = count("email.complained");
  const opened = count("email.opened");
  const clicked = count("email.clicked");
  const deliveryRate = sent > 0 ? Math.round((delivered / sent) * 1000) / 10 : 0;

  return (
    <main className="space-y-6 p-4 sm:p-6 lg:p-8">
      <header>
        <p className="text-sm font-medium text-blue-600">Operations</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Email Management</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Resend delivery events and local suppression records for the last 30 days. Times are shown in South Africa time.
        </p>
      </header>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Some email data could not be loaded: {error}
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metricCard("Sent", sent, "Accepted for sending by Resend")}
        {metricCard("Delivered", delivered, `${deliveryRate}% delivery rate from recorded sent events`)}
        {metricCard("Bounced", bounced, "Addresses that rejected delivery")}
        {metricCard("Suppressed", suppressions.length, "Blocked from future sends locally")}
        {metricCard("Failed", failed, "Provider or delivery failures")}
        {metricCard("Complaints", complained, "Spam complaints received")}
        {metricCard("Opened", opened, "Requires Resend open tracking")}
        {metricCard("Clicked", clicked, "Requires Resend click tracking")}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-semibold text-slate-950">Recent delivery events</h2>
          <p className="mt-1 text-xs text-slate-500">Latest 200 webhook events received in the last 30 days.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Recipient</th>
                <th className="px-5 py-3">Subject</th>
                <th className="px-5 py-3">Resend ID</th>
                <th className="px-5 py-3">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {events.length ? (
                events.map((event) => (
                  <tr key={event.id} className="align-top">
                    <td className="whitespace-nowrap px-5 py-3 font-medium text-slate-800">
                      {EVENT_LABELS[event.event_type] ?? event.event_type}
                    </td>
                    <td className="px-5 py-3 text-slate-700">{event.recipient_email ?? "—"}</td>
                    <td className="max-w-md px-5 py-3 text-slate-700">{event.subject ?? "—"}</td>
                    <td className="max-w-xs truncate px-5 py-3 font-mono text-xs text-slate-500">
                      {event.resend_email_id ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-slate-500">
                      {formatDate(event.event_created_at ?? event.received_at)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-slate-500">
                    No Resend webhook events have been recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-semibold text-slate-950">Suppression list</h2>
          <p className="mt-1 text-xs text-slate-500">Latest 100 locally blocked recipient addresses.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Email</th>
                <th className="px-5 py-3">Reason</th>
                <th className="px-5 py-3">Source</th>
                <th className="px-5 py-3">Suppressed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {suppressions.length ? (
                suppressions.map((row) => (
                  <tr key={row.email}>
                    <td className="px-5 py-3 font-medium text-slate-800">{row.email}</td>
                    <td className="px-5 py-3 capitalize text-slate-700">{row.reason}</td>
                    <td className="px-5 py-3 text-slate-500">{row.source_event_type ?? "Manual"}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-slate-500">{formatDate(row.suppressed_at)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-5 py-10 text-center text-slate-500">
                    No suppressed addresses have been recorded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
