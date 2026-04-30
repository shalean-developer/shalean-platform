"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import type { AdminPayoutRunListRow } from "@/lib/admin/payoutDisbursementRuns";

function zar(cents: number): string {
  return `R ${Math.round(cents / 100).toLocaleString("en-ZA")}`;
}

function runStatusBadge(status: string) {
  const s = status.toLowerCase();
  if (s === "paid") return <Badge className="bg-emerald-600 hover:bg-emerald-600">Paid</Badge>;
  if (s === "processing") return <Badge className="bg-amber-600 hover:bg-amber-600">Processing</Badge>;
  if (s === "approved") return <Badge variant="outline">Approved</Badge>;
  if (s === "draft") return <Badge variant="outline">Draft</Badge>;
  return <Badge variant="outline">{status}</Badge>;
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

export function AdminDisbursementRunsPanel() {
  const [runs, setRuns] = useState<AdminPayoutRunListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const getToken = useCallback(async () => {
    const sb = getSupabaseBrowser();
    const token = (await sb?.auth.getSession())?.data.session?.access_token;
    if (!token) throw new Error("Please sign in as an admin.");
    return token;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setToast(null);
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/payouts/runs", { headers: { Authorization: `Bearer ${token}` } });
      const json = await readJson<{ runs?: AdminPayoutRunListRow[] }>(res);
      if (!res.ok) throw new Error(json.error ?? "Could not load runs.");
      setRuns(json.runs ?? []);
    } catch (e) {
      setToast({ kind: "error", text: e instanceof Error ? e.message : "Load failed." });
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    return runs.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      const created = new Date(r.created_at).getTime();
      if (fromDate) {
        const from = new Date(`${fromDate}T00:00:00`).getTime();
        if (created < from) return false;
      }
      if (toDate) {
        const to = new Date(`${toDate}T23:59:59`).getTime();
        if (created > to) return false;
      }
      return true;
    });
  }, [runs, statusFilter, fromDate, toDate]);

  const post = async (path: string, body?: Record<string, unknown>) => {
    setBusy(path);
    setToast(null);
    try {
      const token = await getToken();
      const res = await fetch(path, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await readJson<{ error?: string; message?: string }>(res);
      if (!res.ok) throw new Error(json.error ?? "Request failed.");
      setToast({ kind: "success", text: json.message ?? "Done." });
      await load();
    } catch (e) {
      setToast({ kind: "error", text: e instanceof Error ? e.message : "Request failed." });
    } finally {
      setBusy(null);
    }
  };

  const postRun = async (runId: string, subpath: string, body?: Record<string, unknown>) => {
    await post(`/api/admin/payouts/runs/${encodeURIComponent(runId)}${subpath}`, body);
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Disbursement</p>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Payout runs</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Freeze weekly batches, group into a run, approve, then send Paystack transfers. Payout rows show <strong>Paid</strong> only after Paystack webhooks
          confirm.
        </p>
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

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Actions</CardTitle>
          <CardDescription>Safe order: freeze pending → create run → approve run → open run to send transfers.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={busy !== null} onClick={() => void post("/api/admin/payouts/runs/freeze")}>
            {busy === "/api/admin/payouts/runs/freeze" ? "Freezing…" : "Freeze pending"}
          </Button>
          <Button type="button" disabled={busy !== null} onClick={() => void post("/api/admin/payouts/runs")}>
            {busy === "/api/admin/payouts/runs" ? "Creating…" : "Create run from frozen"}
          </Button>
          <Button type="button" variant="secondary" disabled={loading} onClick={() => void load()}>
            Refresh
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="run-status-filter">Status</Label>
            <Select
              id="run-status-filter"
              name="run-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-10"
            >
              <option value="all">All</option>
              <option value="draft">Draft</option>
              <option value="approved">Approved</option>
              <option value="processing">Processing</option>
              <option value="paid">Paid</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="run-from">From</Label>
            <Input id="run-from" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="run-to">To</Label>
            <Input id="run-to" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Runs</CardTitle>
          <CardDescription>{filtered.length} shown · {runs.length} loaded</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-zinc-500">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-zinc-500">No runs match filters.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Run</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Cleaners</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.id.slice(0, 8)}…</TableCell>
                    <TableCell>{runStatusBadge(r.status)}</TableCell>
                    <TableCell className="tabular-nums font-medium">{zar(r.total_amount_cents)}</TableCell>
                    <TableCell>{r.cleaner_count}</TableCell>
                    <TableCell className="text-zinc-600 dark:text-zinc-400">
                      {new Date(r.created_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button size="sm" variant="outline" asChild>
                          <Link href={`/admin/payouts/runs/${encodeURIComponent(r.id)}`}>View</Link>
                        </Button>
                        {r.status === "draft" ? (
                          <Button size="sm" disabled={busy !== null} onClick={() => void postRun(r.id, "/approve")}>
                            Approve
                          </Button>
                        ) : null}
                        {r.status === "approved" || r.status === "processing" ? (
                          <>
                            <Button size="sm" disabled={busy !== null} onClick={() => void postRun(r.id, "/process")}>
                              Paystack
                            </Button>
                            <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => void postRun(r.id, "/process", { mode: "manual" })}>
                              Manual paid
                            </Button>
                            <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void postRun(r.id, "/retry")}>
                              Retry failed
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
