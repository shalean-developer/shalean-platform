"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, LifeBuoy, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAdminData } from "@/hooks/useAdminData";
import { getSupabaseAccessToken } from "@/lib/supabase/browser";

type CaseRow = {
  id: string;
  case_number: number;
  booking_id: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  category: string;
  priority: "low" | "normal" | "high" | "critical";
  status: string;
  subject: string;
  description: string;
  assigned_to: string | null;
  first_response_due_at: string;
  resolution_due_at: string;
  first_responded_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  resolution_summary: string | null;
  created_at: string;
};

type ResponseBody = { cases: CaseRow[] };

function label(v: string): string { return v.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); }
function when(v: string | null): string { if (!v) return "—"; const d = new Date(v); return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" }); }

export default function OfficeCustomerCarePage() {
  const { data, loading, error, refetch } = useAdminData<ResponseBody>("/api/admin/customer-care-cases");
  const [filter, setFilter] = useState<"open" | "all" | "overdue">("open");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const now = Date.now();
  const rows = data?.cases ?? [];
  const visible = useMemo(() => rows.filter((c) => {
    const done = c.status === "resolved" || c.status === "closed";
    const overdue = (!c.first_responded_at && Date.parse(c.first_response_due_at) < now) || (!done && Date.parse(c.resolution_due_at) < now);
    if (filter === "all") return true;
    if (filter === "overdue") return overdue;
    return !done;
  }), [rows, filter, now]);
  const overdueCount = rows.filter((c) => {
    const done = c.status === "resolved" || c.status === "closed";
    return (!c.first_responded_at && Date.parse(c.first_response_due_at) < now) || (!done && Date.parse(c.resolution_due_at) < now);
  }).length;

  async function updateCase(caseId: string, payload: Record<string, unknown>) {
    setBusyId(caseId);
    setActionError(null);
    try {
      const token = await getSupabaseAccessToken();
      if (!token) throw new Error("Not signed in.");
      const response = await fetch(`/api/admin/customer-care-cases/${encodeURIComponent(caseId)}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not update case.");
      await refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not update case.");
    } finally {
      setBusyId(null);
    }
  }

  async function resolveCase(c: CaseRow) {
    const summary = window.prompt("Resolution summary for the customer:", c.resolution_summary ?? "");
    if (!summary?.trim()) return;
    await updateCase(c.id, { status: "resolved", resolutionSummary: summary.trim(), note: "Case resolved from Customer Care workspace." });
  }

  async function addNote(c: CaseRow) {
    const note = window.prompt("Add an internal case note:");
    if (!note?.trim()) return;
    await updateCase(c.id, { note: note.trim() });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-bold text-slate-900">Customer Care</h1><p className="mt-1 text-sm text-slate-500">Complaint, service-recovery and refund-linked cases with SLA visibility.</p></div>
        <Button variant="outline" className="rounded-xl" onClick={() => void refetch()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="rounded-2xl"><CardContent className="p-5"><p className="text-xs uppercase text-slate-500">Open</p><p className="mt-1 text-2xl font-bold">{rows.filter((c) => !["resolved","closed"].includes(c.status)).length}</p></CardContent></Card>
        <Card className="rounded-2xl"><CardContent className="p-5"><p className="text-xs uppercase text-slate-500">Overdue</p><p className="mt-1 text-2xl font-bold text-red-600">{overdueCount}</p></CardContent></Card>
        <Card className="rounded-2xl"><CardContent className="p-5"><p className="text-xs uppercase text-slate-500">Total</p><p className="mt-1 text-2xl font-bold">{rows.length}</p></CardContent></Card>
      </div>
      <div className="flex gap-2">{(["open","overdue","all"] as const).map((v) => <button key={v} onClick={() => setFilter(v)} className={`rounded-xl border px-3 py-1.5 text-sm font-medium ${filter===v ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600"}`}>{label(v)}</button>)}</div>
      {error || actionError ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{actionError ?? error}</div> : null}
      {!loading && !error && visible.length === 0 ? <Card className="rounded-2xl"><CardContent className="p-10 text-center"><LifeBuoy className="mx-auto h-8 w-8 text-slate-400" /><p className="mt-3 font-semibold">No matching cases</p></CardContent></Card> : null}
      <div className="space-y-3">
        {visible.map((c) => {
          const done = c.status === "resolved" || c.status === "closed";
          const overdue = (!c.first_responded_at && Date.parse(c.first_response_due_at) < now) || (!done && Date.parse(c.resolution_due_at) < now);
          const busy = busyId === c.id;
          return <Card key={c.id} id={`case-${c.id}`} className="rounded-2xl"><CardHeader className="pb-2"><div className="flex flex-wrap justify-between gap-2"><div><CardTitle className="text-base">Case #{c.case_number}: {c.subject}</CardTitle><p className="mt-1 text-xs text-slate-500">{c.customer_email || c.customer_phone || "Customer"} · {label(c.category)} · {label(c.priority)}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${overdue ? "bg-red-50 text-red-700" : done ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}`}>{overdue ? "Overdue" : label(c.status)}</span></div></CardHeader><CardContent className="space-y-3 text-sm"><p className="text-slate-700">{c.description}</p><div className="grid gap-2 sm:grid-cols-2"><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs uppercase text-slate-400">First response</p><p className="mt-1 flex items-center gap-2">{c.first_responded_at ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Clock3 className="h-4 w-4 text-amber-600" />}{c.first_responded_at ? when(c.first_responded_at) : `Due ${when(c.first_response_due_at)}`}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs uppercase text-slate-400">Resolution due</p><p className="mt-1 flex items-center gap-2">{overdue ? <AlertTriangle className="h-4 w-4 text-red-600" /> : <Clock3 className="h-4 w-4" />}{when(c.resolution_due_at)}</p></div></div>{c.resolution_summary ? <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-emerald-900"><strong>Resolution:</strong> {c.resolution_summary}</div> : null}{!done ? <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" className="rounded-xl" disabled={busy} onClick={() => void updateCase(c.id, { status: "investigating", note: "Investigation started from Customer Care workspace." })}>Investigate</Button><Button size="sm" variant="outline" className="rounded-xl" disabled={busy} onClick={() => void updateCase(c.id, { status: "waiting_customer", note: "Waiting for customer response." })}>Waiting customer</Button><Button size="sm" variant="outline" className="rounded-xl" disabled={busy} onClick={() => void addNote(c)}>Add note</Button><Button size="sm" className="rounded-xl" disabled={busy} onClick={() => void resolveCase(c)}>Resolve</Button></div> : null}</CardContent></Card>;
        })}
      </div>
    </div>
  );
}
