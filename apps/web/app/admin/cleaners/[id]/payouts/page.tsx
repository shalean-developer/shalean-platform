"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

type PayoutAuditRow = {
  id: string;
  total_amount_cents: number;
  status: string;
  payment_status?: string | null;
  payment_reference?: string | null;
  period_start: string;
  period_end: string;
  payout_run_id?: string | null;
  created_at: string;
  approved_at?: string | null;
  paid_at?: string | null;
  booking_count: number;
};

function zar(cents: number): string {
  return `R ${Math.round(cents / 100).toLocaleString("en-ZA")}`;
}

async function readJson<T>(res: Response): Promise<T & { error?: string }> {
  const text = await res.text();
  if (!text.trim()) return {} as T & { error?: string };
  try {
    return JSON.parse(text) as T & { error?: string };
  } catch {
    return { error: text.slice(0, 200) } as T & { error?: string };
  }
}

export default function AdminCleanerPayoutHistoryPage() {
  const params = useParams();
  const cleanerId = String(params?.id ?? "");

  const [cleanerName, setCleanerName] = useState("");
  const [rows, setRows] = useState<PayoutAuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const getToken = useCallback(async () => {
    const sb = getSupabaseBrowser();
    const token = (await sb?.auth.getSession())?.data.session?.access_token;
    if (!token) throw new Error("Please sign in as an admin.");
    return token;
  }, []);

  const load = useCallback(async () => {
    if (!cleanerId) return;
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/cleaners/${encodeURIComponent(cleanerId)}/payouts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await readJson<{ cleaner?: { full_name?: string }; payouts?: PayoutAuditRow[] }>(res);
      if (!res.ok) throw new Error(json.error ?? "Could not load payouts.");
      setCleanerName(String(json.cleaner?.full_name ?? cleanerId));
      setRows(json.payouts ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed.");
    } finally {
      setLoading(false);
    }
  }, [cleanerId, getToken]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" className="mb-2 -ml-2 h-8 px-2" asChild>
            <Link href="/admin/cleaners">← Cleaners</Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Payout history</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{cleanerName}</p>
          <p className="font-mono text-xs text-zinc-500">{cleanerId}</p>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900 dark:bg-rose-950/40 dark:text-rose-100">{error}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Weekly payout batches</CardTitle>
          <CardDescription>
            Batched cleaner payouts (period totals). Open a row in{" "}
            <Link href="/admin/payouts?tab=batches" className="font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400">
              Paystack batches
            </Link>{" "}
            using <span className="font-mono text-xs">?payout=&#123;id&#125;</span> for job-level drill-down.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-zinc-500">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-zinc-500">No payout batches for this cleaner.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Paystack</TableHead>
                  <TableHead>Bookings</TableHead>
                  <TableHead>Run</TableHead>
                  <TableHead className="text-right">Open</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm">
                      {r.period_start} → {r.period_end}
                    </TableCell>
                    <TableCell className="tabular-nums font-medium">{zar(r.total_amount_cents)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{r.status}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-zinc-600 dark:text-zinc-400">{r.payment_status ?? "—"}</TableCell>
                    <TableCell>{r.booking_count}</TableCell>
                    <TableCell className="font-mono text-xs text-zinc-500">
                      {r.payout_run_id ? `${String(r.payout_run_id).slice(0, 8)}…` : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" asChild>
                        <Link href={`/admin/payouts?tab=batches&payout=${encodeURIComponent(r.id)}`}>Hub</Link>
                      </Button>
                      {r.payout_run_id ? (
                        <Button size="sm" variant="ghost" className="ml-1" asChild>
                          <Link href={`/admin/payouts/runs/${encodeURIComponent(r.payout_run_id)}`}>Run</Link>
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
