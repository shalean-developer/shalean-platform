"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

function settlementBadge(paymentStatus: string | null | undefined, payoutStatus: string) {
  const ps = String(paymentStatus ?? "pending").toLowerCase();
  if (payoutStatus === "paid" && ps === "success") return <span className="text-emerald-700 dark:text-emerald-400">Confirmed</span>;
  if (ps === "processing") return <Badge className="bg-amber-600 hover:bg-amber-600">Processing</Badge>;
  if (ps === "failed" || ps === "partial_failed") return <Badge variant="destructive">Needs review</Badge>;
  return <span className="text-zinc-500">Pending</span>;
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
  const [bankReferences, setBankReferences] = useState<Record<string, string>>({});
  const [bankPaidDates, setBankPaidDates] = useState<Record<string, string>>({});

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

  const recordBankTransfer = async (payoutId: string) => {
    const reference = String(bankReferences[payoutId] ?? "").trim();
    const paidDate = String(bankPaidDates[payoutId] ?? "").trim();
    if (reference.length < 3) {
      setToast({ kind: "error", text: "Enter the bank transfer reference before recording payment." });
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidDate)) {
      setToast({ kind: "error", text: "Select the actual bank transfer date before recording payment." });
      return;
    }
    const path = `/api/admin/payouts/${encodeURIComponent(payoutId)}/bank-transfer`;
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
        body: JSON.stringify({
          reference,
          paid_at: `${paidDate}T12:00:00+02:00`,
        }),
      });
      const json = await readJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(json.error ?? "Could not record bank transfer.");
      setBankReferences((current) => ({ ...current, [payoutId]: "" }));
      setBankPaidDates((current) => ({ ...current, [payoutId]: "" }));
      setToast({ kind: "success", text: "Bank transfer recorded and payout reconciled." });
      await load();
    } catch (e) {
      setToast({ kind: "error", text: e instanceof Error ? e.message : "Could not record bank transfer." });
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
                Monthly bank-transfer run · {payouts.length} cleaner payout(s)
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

          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-base">Cleaners in run</CardTitle>
                <CardDescription>Record the real bank transfer reference for each approved cleaner payout. The final child closes the run automatically.</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                {runStatus === "draft" ? (
                  <Button size="sm" disabled={busy !== null} onClick={() => void post(`${base}/approve`)}>
                    Approve run
                  </Button>
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
                    <TableHead>Settlement</TableHead>
                    <TableHead>Bank</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payouts.map((p) => {
                    return (
                      <TableRow key={p.id}>
                        <TableCell>
                          <div className="font-medium">{p.cleaner_name}</div>
                          <div className="font-mono text-[11px] text-zinc-500">{p.id.slice(0, 8)}…</div>
                        </TableCell>
                        <TableCell className="tabular-nums font-semibold">{zar(p.total_amount_cents)}</TableCell>
                        <TableCell>{batchStatusBadge(p.status)}</TableCell>
                        <TableCell>{settlementBadge(p.payment_status, p.status)}</TableCell>
                        <TableCell className="text-sm text-zinc-600 dark:text-zinc-400">
                          {p.bank_code ?? "—"}
                          {p.account_masked ? ` · ${p.account_masked}` : ""}
                        </TableCell>
                        <TableCell className="text-right">
                          {p.status === "approved" ? (
                            <div className="ml-auto flex max-w-md flex-wrap items-center justify-end gap-2">
                              <Input
                                aria-label={`Bank reference for ${p.cleaner_name}`}
                                placeholder="Bank reference"
                                value={bankReferences[p.id] ?? ""}
                                onChange={(e) =>
                                  setBankReferences((current) => ({ ...current, [p.id]: e.target.value }))
                                }
                                className="h-8 min-w-36"
                              />
                              <Input
                                aria-label={`Bank transfer date for ${p.cleaner_name}`}
                                type="date"
                                value={bankPaidDates[p.id] ?? ""}
                                onChange={(e) =>
                                  setBankPaidDates((current) => ({ ...current, [p.id]: e.target.value }))
                                }
                                className="h-8 w-auto"
                              />
                              <Button
                                size="sm"
                                disabled={
                                  busy !== null ||
                                  String(bankReferences[p.id] ?? "").trim().length < 3 ||
                                  !/^\d{4}-\d{2}-\d{2}$/.test(String(bankPaidDates[p.id] ?? "").trim())
                                }
                                onClick={() => void recordBankTransfer(p.id)}
                              >
                                Record paid
                              </Button>
                            </div>
                          ) : p.status === "paid" ? (
                            <div>
                              <span className="text-emerald-600 dark:text-emerald-400">✓ Paid</span>
                              {p.payment_reference ? (
                                <div className="mt-1 font-mono text-[11px] text-zinc-500">{p.payment_reference}</div>
                              ) : null}
                            </div>
                          ) : String(p.payment_status ?? "").toLowerCase() === "processing" ? (
                            <span className="text-amber-700 dark:text-amber-400">Transfer in progress</span>
                          ) : (
                            <span className="text-zinc-500">Await approval</span>
                          )}
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
