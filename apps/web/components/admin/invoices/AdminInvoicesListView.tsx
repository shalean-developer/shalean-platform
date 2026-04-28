"use client";

import Link from "next/link";
import { startTransition, useCallback, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency, formatDate, formatInvoiceMonth } from "@/lib/admin/invoices/invoiceAdminFormatters";
import type { AdminInvoiceListRow } from "@/lib/admin/invoices/loadAdminInvoiceList";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

type StatusFilter = "all" | "paid" | "unpaid" | "overdue";

function statusBadgeVariant(status: string): "default" | "success" | "warning" | "destructive" | "outline" {
  const s = status.toLowerCase();
  if (s === "paid") return "success";
  if (s === "draft") return "outline";
  if (s === "sent") return "default";
  if (s === "partially_paid") return "warning";
  if (s === "overdue") return "destructive";
  return "outline";
}

export function AdminInvoicesListView() {
  const [rows, setRows] = useState<AdminInvoiceListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [balanceGt0Only, setBalanceGt0Only] = useState(false);
  const [hasDiscountsOnly, setHasDiscountsOnly] = useState(false);
  const [hasServiceIssuesOnly, setHasServiceIssuesOnly] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (debouncedQ) p.set("q", debouncedQ);
    if (status !== "all") p.set("status", status);
    if (balanceGt0Only) p.set("balance_gt0", "1");
    if (hasDiscountsOnly) p.set("has_discounts", "1");
    if (hasServiceIssuesOnly) p.set("has_service_issues", "1");
    const s = p.toString();
    return s ? `?${s}` : "";
  }, [debouncedQ, status, balanceGt0Only, hasDiscountsOnly, hasServiceIssuesOnly]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sb = getSupabaseBrowser();
      if (!sb) throw new Error("Supabase is not configured.");
      const { data: sessionData } = await sb.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Please sign in as admin.");

      const res = await fetch(`/api/admin/invoices${queryString}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = (await res.json().catch(() => ({}))) as { invoices?: AdminInvoiceListRow[]; error?: string };
      if (!res.ok) throw new Error(j.error ?? `Failed (${res.status})`);
      setRows(j.invoices ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    startTransition(() => {
      void load();
    });
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Monthly invoices</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Search by customer name or id, filter by collection status, open a row for full detail.</p>
      </div>

      <Card>
        <CardHeader className="gap-4 pb-4">
          <CardTitle className="text-lg">Filters</CardTitle>
          <div className="flex flex-col gap-4 md:flex-row md:items-end">
            <div className="grid w-full gap-1.5 md:max-w-md">
              <Label htmlFor="inv-search">Search customer</Label>
              <Input
                id="inv-search"
                placeholder="Name, customer id, or invoice id…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["all", "All"],
                  ["unpaid", "Unpaid"],
                  ["overdue", "Overdue"],
                  ["paid", "Paid"],
                ] as const
              ).map(([key, label]) => (
                <Button
                  key={key}
                  type="button"
                  size="sm"
                  variant={status === key ? "default" : "outline"}
                  onClick={() => setStatus(key)}
                >
                  {label}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 md:ml-auto">
              <Button
                type="button"
                size="sm"
                variant={balanceGt0Only ? "default" : "outline"}
                onClick={() => setBalanceGt0Only((v) => !v)}
              >
                Balance {">"} 0 only
              </Button>
              <Button
                type="button"
                size="sm"
                variant={hasDiscountsOnly ? "default" : "outline"}
                onClick={() => setHasDiscountsOnly((v) => !v)}
              >
                Has discounts
              </Button>
              <Button
                type="button"
                size="sm"
                variant={hasServiceIssuesOnly ? "default" : "outline"}
                onClick={() => setHasServiceIssuesOnly((v) => !v)}
                title="Adjustments categorized as missed visit"
              >
                Has service issues
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto px-0 pb-0">
          {error ? <p className="px-6 pb-4 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
          {loading ? (
            <p className="px-6 py-10 text-center text-sm text-zinc-500">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-zinc-500">No invoices match these filters.</p>
          ) : (
            <table className="w-full min-w-[920px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400">
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Month</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Total</th>
                  <th className="px-4 py-3 font-medium">Balance</th>
                  <th className="px-4 py-3 font-medium">Last activity</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-zinc-100 hover:bg-zinc-50/80 dark:border-zinc-800 dark:hover:bg-zinc-800/30">
                    <td className="px-4 py-3">
                      <div className="font-medium text-zinc-900 dark:text-zinc-50">{(r.customer_name ?? "").trim() || "—"}</div>
                      <div className="text-xs text-zinc-500">{r.customer_id.slice(0, 8)}…</div>
                    </td>
                    <td className="px-4 py-3 text-zinc-800 dark:text-zinc-100">
                      {formatInvoiceMonth(r.month)}
                      <div className="text-xs text-zinc-500">{r.month}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <Badge variant={statusBadgeVariant(r.status)}>{r.status.replace(/_/g, " ")}</Badge>
                        {r.days_overdue > 0 ? (
                          <Badge variant="destructive">Overdue · {r.days_overdue}d</Badge>
                        ) : r.is_overdue ? (
                          <Badge variant="destructive">Overdue</Badge>
                        ) : null}
                        {r.account_billing_risk === "at_risk" ? (
                          <Badge className="bg-amber-600 text-white hover:bg-amber-600 dark:bg-amber-700">At risk</Badge>
                        ) : null}
                        {r.has_discount_lines ? (
                          <Badge variant="outline" className="border-violet-300 text-violet-800 dark:border-violet-700 dark:text-violet-200">
                            Discount
                          </Badge>
                        ) : null}
                        {r.has_missed_visit_lines ? (
                          <Badge variant="outline" className="border-orange-300 text-orange-900 dark:border-orange-800 dark:text-orange-100">
                            Service issue
                          </Badge>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium tabular-nums text-zinc-900 dark:text-zinc-50">
                      {formatCurrency(r.total_amount_cents, r.currency_code)}
                    </td>
                    <td
                      className={`px-4 py-3 font-semibold tabular-nums ${
                        r.balance_cents > 0 ? "text-red-700 dark:text-red-300" : "text-emerald-700 dark:text-emerald-300"
                      }`}
                    >
                      {r.balance_cents <= 0 ? "Settled" : formatCurrency(r.balance_cents, r.currency_code)}
                    </td>
                    <td
                      className="px-4 py-3 text-xs text-zinc-600 dark:text-zinc-300"
                      title={
                        r.last_activity_at
                          ? `${formatDate(r.last_activity_at)} — Last financial touch (payments, adjustments, finalize/close, resend, reminders).`
                          : undefined
                      }
                    >
                      {r.last_activity_at ? formatDate(r.last_activity_at) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/invoices/${r.id}`}
                        className="text-sm font-semibold text-blue-600 hover:underline dark:text-blue-400"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!loading && rows.length > 0 ? (
            <p className="border-t border-zinc-100 px-6 py-3 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              <span className="font-medium text-zinc-600 dark:text-zinc-300">Last activity</span> is the latest{" "}
              <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">monthly_invoice_events</code> row we treat as
              meaningful: payments, adjustments, manual mark paid, finalize/close, invoice resend, payment reminders. It
              excludes reads and non-financial row churn.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
