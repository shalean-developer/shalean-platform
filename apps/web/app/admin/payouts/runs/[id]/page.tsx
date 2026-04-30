"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AdminPayoutRunDetailPayout } from "@/lib/admin/payoutDisbursementRuns";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

function zar(cents: number): string {
  return `R ${Math.round(cents / 100).toLocaleString("en-ZA")}`;
}

function batchStatusBadge(status: string) {
  const s = status.toLowerCase();
  if (s === "paid") return <Badge className="bg-emerald-600 hover:bg-emerald-600">Paid</Badge>;
  if (s === "approved") return <Badge variant="outline">Approved</Badge>;
  if (s === "frozen") return <Badge variant="outline">Frozen</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

function paystackBadge(paymentStatus: string | null | undefined, payoutStatus: string) {
  const ps = String(paymentStatus ?? "pending").toLowerCase();
  if (payoutStatus === "paid" && ps === "success") return <span className="text-emerald-700 dark:text-emerald-400">Confirmed</span>;
  if (ps === "processing") return <Badge className="bg-amber-600 hover:bg-amber-600">Processing</Badge>;
  if (ps === "failed" || ps === "partial_failed") return <Badge variant="destructive">Failed</Badge>;
  return <span className="text-zinc-500">Pending / not sent</span>;
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

export default function AdminPayoutRunDetailPage() {
  const params = useParams();
  const runId = String(params?.id ?? "");

  const [run, setRun] = useState<Record<string, unknown> | null>(null);
  const [payouts, setPayouts] = useState<AdminPayoutRunDetailPayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const getToken = useCallback(async () => {
    const sb = getSupabaseBrowser();
    const token = (await sb?.auth.getSession())?.data.session?.access_token;
    if (!token) throw new Error("Please sign in as an admin.");
    return token;
  }, []);

  const load = useCallback(async () => {
    if (!runId) return;
    setLoading(true);
    setToast(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/payouts/runs/${encodeURIComponent(runId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await readJson<{ run?: Record<string, unknown>; payouts?: AdminPayoutRunDetailPayout[] }>(res);
      if (!res.ok) throw new Error(json.error ?? "Could not load run.");
      setRun(json.run ?? null);
      setPayouts(json.payouts ?? []);
    } catch (e) {
      setToast({ kind: "error", text: e instanceof Error ? e.message : "Load failed." });
    } finally {
      setLoading(false);
    }
  }, [getToken, runId]);

  useEffect(() => {
    void load();
  }, [load]);

  const post = async (path: string, body?: Record<string, unknown>) => {
    setBusy(path);
    setToast(null);
    try {
      const token = await getToken();
      const res = await fetch(path, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body ?? {}),
      });
      const json = await readJson<{ error?: string; mode?: string; successCount?: number; skippedInFlightCount?: number; failedCount?: number }>(res);
      if (!res.ok) throw new Error(json.error ?? "Request failed.");
      let text = "Done.";
      if (json.mode === "paystack") {
        text = `Paystack: sent ${json.successCount ?? 0}; skipped ${json.skippedInFlightCount ?? 0}; failed ${json.failedCount ?? 0}.`;
      } else if (json.mode === "manual") {
        text = `Manual: marked ${json.successCount ?? 0} paid.`;
      }
      setToast({ kind: "success", text });
      await load();
    } catch (e) {
      setToast({ kind: "error", text: e instanceof Error ? e.message : "Request failed." });
    } finally {
      setBusy(null);
    }
  };

  const downloadCsv = async () => {
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/payouts/runs/${encodeURIComponent(runId)}/export`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const j = await readJson(res);
        throw new Error(j.error ?? "Export failed.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `disbursement-run-${runId.slice(0, 8)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setToast({ kind: "success", text: "CSV downloaded." });
    } catch (e) {
      setToast({ kind: "error", text: e instanceof Error ? e.message : "Export failed." });
    }
  };

  const base = `/api/admin/payouts/runs/${encodeURIComponent(runId)}`;
  const runStatus = String(run?.status ?? "");

  const hasPaystackFailures = payouts.some((p) => ["failed", "partial_failed"].includes(String(p.payment_status ?? "").toLowerCase()));

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" className="mb-2 -ml-2 h-8 px-2" asChild>
            <Link href="/admin/payouts?tab=disbursements">← Payout runs</Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Run detail</h1>
          <p className="mt-1 font-mono text-xs text-zinc-500">{runId}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void downloadCsv()}>
            Export CSV
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void load()}>
            Refresh
          </Button>
        </div>
      </div>

      {toast ? (
        <p
          className={`rounded-lg px-3 py-2 text-sm ${
            toast.kind === "success"
              ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"
              : "bg-rose-50 text-rose-900 dark:bg-rose-950/40 dark:text-rose-100"
          }`}
        >
          {toast.text}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : !run ? (
        <p className="text-sm text-zinc-500">Run not found.</p>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Summary</CardTitle>
              <CardDescription>
                Batch ref: {String(run.paystack_batch_ref ?? "—")} · {payouts.length} cleaner payout(s)
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-6 text-sm">
              <div>
                <p className="text-xs font-semibold uppercase text-zinc-500">Status</p>
                <p className="mt-1">{batchStatusBadge(runStatus)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-zinc-500">Total</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">{zar(Number(run.total_amount_cents ?? 0))}</p>
              </div>
            </CardContent>
          </Card>

          {hasPaystackFailures ? (
            <Card className="border-amber-300 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-amber-950 dark:text-amber-100">Paystack failures</CardTitle>
                <CardDescription className="text-amber-900/80 dark:text-amber-100/80">
                  “Paid” in the batch column only appears after transfer success. Retry sends a new transfer for failed rows.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button type="button" size="sm" disabled={busy !== null} onClick={() => void post(`${base}/retry`)}>
                  Retry all failed
                </Button>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-base">Cleaners in run</CardTitle>
                <CardDescription>Bank from saved payment details · Paystack column reflects webhook state.</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                {runStatus === "draft" ? (
                  <Button size="sm" disabled={busy !== null} onClick={() => void post(`${base}/approve`)}>
                    Approve run
                  </Button>
                ) : null}
                {runStatus === "approved" || runStatus === "processing" ? (
                  <>
                    <Button size="sm" disabled={busy !== null} onClick={() => void post(`${base}/process`, {})}>
                      Send Paystack
                    </Button>
                    <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => void post(`${base}/process`, { mode: "manual" })}>
                      Mark paid (manual)
                    </Button>
                  </>
                ) : null}
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cleaner</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Batch</TableHead>
                    <TableHead>Paystack</TableHead>
                    <TableHead>Bank</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payouts.map((p) => {
                    const failed = ["failed", "partial_failed"].includes(String(p.payment_status ?? "").toLowerCase());
                    return (
                      <TableRow key={p.id}>
                        <TableCell>
                          <div className="font-medium">{p.cleaner_name}</div>
                          <div className="font-mono text-[11px] text-zinc-500">{p.id.slice(0, 8)}…</div>
                        </TableCell>
                        <TableCell className="tabular-nums font-semibold">{zar(p.total_amount_cents)}</TableCell>
                        <TableCell>{batchStatusBadge(p.status)}</TableCell>
                        <TableCell>{paystackBadge(p.payment_status, p.status)}</TableCell>
                        <TableCell className="text-sm text-zinc-600 dark:text-zinc-400">
                          {p.bank_code ?? "—"}
                          {p.account_masked ? ` · ${p.account_masked}` : ""}
                        </TableCell>
                        <TableCell className="text-right">
                          {failed ? (
                            <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void post(`${base}/retry`, { payoutId: p.id })}>
                              Retry
                            </Button>
                          ) : p.status === "paid" ? (
                            <span className="text-emerald-600 dark:text-emerald-400">✓</span>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </main>
  );
}
