"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, CheckCircle2, Clock3, MessageSquare, RefreshCw, Send, ShieldCheck } from "lucide-react";
import { adminFetch, useAdminData } from "@/hooks/useAdminData";
import { cn } from "@/lib/utils";

type Candidate = {
  phoneE164: string;
  firstName: string;
  customerName: string;
  email: string | null;
  service: string | null;
  lastCompletedAt: string;
  daysSinceLastBooking: number;
  alreadyQueued: boolean;
};

type CampaignResponse = {
  fetchedAt: string;
  campaignKey: string;
  templateKey: string;
  templateName: string;
  templateStatus: "unknown" | "pending" | "approved" | "rejected";
  sendReady: boolean;
  bookingUrl: string;
  rules: { completedBookings: number; recurringCompleted: number; minDaysSinceLastBooking: number; maxDaysSinceLastBooking: number };
  totalEligible: number;
  unsentEligible: number;
  candidates: Candidate[];
};

type LaunchResult = { ok?: boolean; queued?: number; remaining?: number; error?: string; failures?: Array<{ phone: string; error: string }> };

export default function OnceOffRecurringCampaignPage() {
  const { data, loading, error, refetch } = useAdminData<CampaignResponse>("/api/admin/marketing/once-off-recurring-whatsapp");
  const [launching, setLaunching] = useState(false);
  const [result, setResult] = useState<LaunchResult | null>(null);

  async function launch() {
    if (!data?.sendReady || data.unsentEligible < 1) return;
    const confirmed = window.confirm(`Queue ${data.unsentEligible} WhatsApp follow-up messages? Duplicate-send protection is enabled.`);
    if (!confirmed) return;
    setLaunching(true);
    setResult(null);
    const response = await adminFetch<LaunchResult>("/api/admin/marketing/once-off-recurring-whatsapp", {
      method: "POST",
      body: JSON.stringify({ confirm: "SEND", limit: 250 }),
    });
    setLaunching(false);
    if (!response.ok) setResult({ ok: false, error: response.error || "Campaign launch failed." });
    else setResult(response.data ?? { ok: true });
    await refetch();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/office/marketing/campaigns" className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> Campaigns</Link>
          <h1 className="text-2xl font-bold text-slate-900">Once-off → Recurring WhatsApp</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">Follow up customers who completed exactly one booking, have never completed a recurring-generated booking, and last booked 8–90 days ago.</p>
        </div>
        <button type="button" onClick={() => void refetch()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-50"><RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> Refresh</button>
      </div>

      <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
        <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 text-blue-600" /><div><p className="text-sm font-semibold text-slate-900">Safe launch controls</p><p className="mt-1 text-xs leading-5 text-slate-600">No message can be launched until the Meta template is recorded as approved. Every recipient gets a permanent campaign idempotency key, so refreshing or clicking twice will not resend the same campaign.</p></div></div>
      </div>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      {data ? <>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"><MessageSquare className="h-5 w-5 text-slate-500" /><p className="mt-3 text-xs font-semibold uppercase text-slate-400">Eligible now</p><p className="text-2xl font-bold text-slate-900">{data.totalEligible}</p></div>
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"><Send className="h-5 w-5 text-slate-500" /><p className="mt-3 text-xs font-semibold uppercase text-slate-400">Unsent</p><p className="text-2xl font-bold text-slate-900">{data.unsentEligible}</p></div>
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"><CheckCircle2 className="h-5 w-5 text-slate-500" /><p className="mt-3 text-xs font-semibold uppercase text-slate-400">Template</p><p className={cn("mt-1 text-sm font-bold", data.sendReady ? "text-emerald-700" : "text-amber-700")}>{data.sendReady ? "Approved / ready" : data.templateStatus}</p><p className="mt-1 truncate font-mono text-xs text-slate-500">{data.templateName}</p></div>
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"><Clock3 className="h-5 w-5 text-slate-500" /><p className="mt-3 text-xs font-semibold uppercase text-slate-400">Window</p><p className="text-lg font-bold text-slate-900">8–90 days</p><p className="text-xs text-slate-500">after completed booking</p></div>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold text-slate-900">Campaign message</h2><p className="mt-1 text-xs text-slate-500">Marketing template · variables: first name + booking link</p></div><button type="button" onClick={() => void launch()} disabled={!data.sendReady || launching || data.unsentEligible < 1} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"><Send className="h-4 w-4" /> {launching ? "Queueing…" : `Launch to ${data.unsentEligible}`}</button></div>
          {!data.sendReady ? <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">Create and approve <span className="font-mono font-semibold">{data.templateName}</span> in Meta first. The launch button stays disabled until Shalean records it as approved.</p> : null}
          {result ? <p className={cn("mt-3 rounded-xl border px-3 py-2 text-xs", result.ok === false ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700")}>{result.error ?? `${result.queued ?? 0} messages queued. ${result.remaining ?? 0} remaining.`}</p> : null}
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm"><div className="border-b border-slate-100 px-4 py-3"><h2 className="font-bold text-slate-900">Current audience</h2><p className="text-xs text-slate-500">Calculated live from production bookings, not from the spreadsheet.</p></div><div className="max-h-[560px] overflow-auto divide-y divide-slate-100">{data.candidates.map((candidate) => <div key={candidate.phoneE164} className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[1.2fr_1fr_1fr_auto] md:items-center"><div><p className="font-semibold text-slate-800">{candidate.customerName}</p><p className="text-xs text-slate-400">{candidate.phoneE164}</p></div><div><p className="text-slate-700">{candidate.service ?? "—"}</p><p className="text-xs text-slate-400">Last service</p></div><div><p className="font-semibold text-slate-700">{candidate.daysSinceLastBooking} days ago</p><p className="text-xs text-slate-400">{new Date(candidate.lastCompletedAt).toLocaleDateString()}</p></div><span className={cn("w-fit rounded-full px-2.5 py-1 text-xs font-bold", candidate.alreadyQueued ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600")}>{candidate.alreadyQueued ? "Already queued/sent" : "Ready when approved"}</span></div>)}</div></div>
      </> : null}
    </div>
  );
}
