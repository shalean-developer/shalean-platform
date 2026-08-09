"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Clock3, LifeBuoy, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabaseAccessToken } from "@/lib/supabase/browser";

type CustomerCase = {
  id: string;
  case_number: number;
  booking_id: string | null;
  category: string;
  priority: string;
  status: string;
  subject: string;
  first_response_due_at: string;
  resolution_due_at: string;
  first_responded_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  resolution_summary: string | null;
  created_at: string;
  updated_at: string;
};

function label(value: string): string {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusClass(status: string): string {
  if (status === "resolved" || status === "closed") return "bg-emerald-50 text-emerald-700";
  if (status === "waiting_customer") return "bg-amber-50 text-amber-700";
  return "bg-blue-50 text-blue-700";
}

function formatWhen(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" });
}

export default function AccountCasesPage() {
  const [cases, setCases] = useState<CustomerCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getSupabaseAccessToken();
      if (!token) throw new Error("Please sign in again.");
      const response = await fetch("/api/customer/cases", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = (await response.json().catch(() => ({}))) as { cases?: CustomerCase[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not load support cases.");
      setCases(body.cases ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load support cases.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openCount = useMemo(() => cases.filter((c) => !["resolved", "closed"].includes(c.status)).length, [cases]);

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Support cases</h1>
          <p className="mt-1 text-sm text-gray-500">Track complaints, billing issues, refunds and service-recovery cases in one place.</p>
        </div>
        <Button variant="outline" className="rounded-xl" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="rounded-2xl"><CardContent className="p-5"><p className="text-sm text-gray-500">Open cases</p><p className="mt-1 text-3xl font-bold text-gray-900">{loading ? "—" : openCount}</p></CardContent></Card>
        <Card className="rounded-2xl"><CardContent className="p-5"><p className="text-sm text-gray-500">Total cases</p><p className="mt-1 text-3xl font-bold text-gray-900">{loading ? "—" : cases.length}</p></CardContent></Card>
      </div>

      {error ? (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertCircle className="h-5 w-5" />{error}</div>
      ) : null}

      {!loading && !error && cases.length === 0 ? (
        <Card className="rounded-2xl"><CardContent className="p-10 text-center"><LifeBuoy className="mx-auto h-9 w-9 text-gray-400" /><p className="mt-3 font-semibold text-gray-900">No support cases</p><p className="mt-1 text-sm text-gray-500">If you need help with a booking, contact Customer Care and any formal case will appear here.</p><Button asChild className="mt-4 rounded-xl"><Link href="/account/help">Contact support</Link></Button></CardContent></Card>
      ) : null}

      <div className="space-y-4">
        {cases.map((item) => {
          const done = item.status === "resolved" || item.status === "closed";
          return (
            <Card key={item.id} className="rounded-2xl">
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div><CardTitle className="text-base">Case #{item.case_number}: {item.subject}</CardTitle><p className="mt-1 text-xs text-gray-500">{label(item.category)} · Opened {formatWhen(item.created_at)}</p></div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(item.status)}`}>{label(item.status)}</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-gray-50 p-3"><p className="text-xs font-semibold uppercase text-gray-400">First response</p><p className="mt-1 flex items-center gap-2 text-gray-700">{item.first_responded_at ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Clock3 className="h-4 w-4 text-amber-600" />}{item.first_responded_at ? formatWhen(item.first_responded_at) : `Due ${formatWhen(item.first_response_due_at)}`}</p></div>
                  <div className="rounded-xl bg-gray-50 p-3"><p className="text-xs font-semibold uppercase text-gray-400">Resolution</p><p className="mt-1 text-gray-700">{done ? formatWhen(item.resolved_at ?? item.closed_at) : `Due ${formatWhen(item.resolution_due_at)}`}</p></div>
                </div>
                {item.resolution_summary ? <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3"><p className="text-xs font-semibold uppercase text-emerald-700">Resolution</p><p className="mt-1 text-emerald-900">{item.resolution_summary}</p></div> : null}
                {item.booking_id ? <Button asChild variant="outline" size="sm" className="rounded-xl"><Link href={`/account/bookings/${item.booking_id}`}>View related booking</Link></Button> : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
