import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RecoveryRow = {
  id: string;
  resend_email_id: string | null;
  recipient_email: string;
  subject: string;
  booking_id: string | null;
  customer_id: string | null;
  message_type: string | null;
  delivery_status: string;
  retry_status: string;
  retry_count: number;
  next_retry_at: string | null;
  last_retry_at: string | null;
  failure_reason: string | null;
  created_at: string;
};

function fmt(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Johannesburg" }).format(new Date(value));
}

export default async function EmailRetryRecoveryPage() {
  const admin = getSupabaseAdmin();
  if (!admin) return <main className="p-6"><div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900">Recovery data is unavailable because Supabase is not configured.</div></main>;

  const { data, error } = await admin.from("email_outbound_messages")
    .select("id,resend_email_id,recipient_email,subject,booking_id,customer_id,message_type,delivery_status,retry_status,retry_count,next_retry_at,last_retry_at,failure_reason,created_at")
    .in("retry_status", ["queued", "processing", "exhausted", "blocked", "recovered"])
    .order("updated_at", { ascending: false })
    .limit(300);
  const rows = (data ?? []) as RecoveryRow[];
  const queued = rows.filter((row) => row.retry_status === "queued").length;
  const processing = rows.filter((row) => row.retry_status === "processing").length;
  const recovered = rows.filter((row) => row.retry_status === "recovered").length;
  const exhausted = rows.filter((row) => row.retry_status === "exhausted").length;
  const blocked = rows.filter((row) => row.retry_status === "blocked").length;

  return <main className="space-y-6 p-4 sm:p-6 lg:p-8">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-sm font-medium text-blue-600">Email Operations</p><h1 className="mt-1 text-3xl font-semibold text-slate-950">Retry & Recovery Center</h1><p className="mt-2 text-sm text-slate-600">Temporary failures are retried after 5 minutes, 30 minutes, 2 hours and 24 hours. Permanent bounces and complaints remain blocked.</p></div>
      <Link href="/office/email-operations/timeline" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700">View timeline</Link>
    </header>
    {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">Recovery queue could not be loaded: {error.message}</div> : null}
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {[["Queued", queued, "Waiting for automatic retry"],["Processing", processing, "Currently claimed by a worker"],["Recovered", recovered, "Successfully resent"],["Exhausted", exhausted, "All four attempts used"],["Blocked", blocked, "Permanent failure or attachment"]].map(([label,value,description]) => <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-2 text-3xl font-semibold text-slate-950">{Number(value).toLocaleString("en-ZA")}</p><p className="mt-1 text-xs text-slate-500">{description}</p></div>)}
    </section>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4"><h2 className="font-semibold text-slate-950">Recovery queue</h2><p className="mt-1 text-xs text-slate-500">Latest 300 recoverable or blocked outbound messages.</p></div>
      <div className="overflow-x-auto"><table className="min-w-full divide-y divide-slate-200 text-sm"><thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Status</th><th className="px-5 py-3">Recipient</th><th className="px-5 py-3">Subject</th><th className="px-5 py-3">Attempts</th><th className="px-5 py-3">Next retry</th><th className="px-5 py-3">Context</th><th className="px-5 py-3">Failure</th></tr></thead>
      <tbody className="divide-y divide-slate-100">{rows.length ? rows.map((row) => <tr key={row.id} className="align-top"><td className="px-5 py-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-700">{row.retry_status}</span><p className="mt-1 text-xs text-slate-500">{row.delivery_status}</p></td><td className="px-5 py-3 text-slate-700">{row.recipient_email}</td><td className="max-w-sm px-5 py-3 text-slate-700">{row.subject}<p className="mt-1 text-xs text-slate-500">{row.message_type ?? "Unclassified"}</p></td><td className="px-5 py-3 text-slate-700">{row.retry_count}/4</td><td className="whitespace-nowrap px-5 py-3 text-slate-500">{fmt(row.next_retry_at)}</td><td className="px-5 py-3 text-xs">{row.booking_id ? <Link className="font-semibold text-blue-600" href={`/office/bookings/${row.booking_id}`}>Booking</Link> : null}{row.customer_id ? <p className="mt-1 font-mono text-slate-500">{row.customer_id.slice(0,8)}…</p> : "—"}</td><td className="max-w-md break-words px-5 py-3 text-xs text-slate-500">{row.failure_reason ?? "—"}</td></tr>) : <tr><td colSpan={7} className="px-5 py-12 text-center text-slate-500">No failed or recovered messages have been recorded yet.</td></tr>}</tbody></table></div>
    </section>
  </main>;
}
