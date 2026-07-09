"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Database, RefreshCw, Scale } from "lucide-react";
import {
  OfficeZohoPageHeader,
  OfficeZohoSecondaryButton,
  OfficeZohoTableShell,
} from "@/components/admin/office/OfficeZohoChrome";
import { FinanceKpiCard } from "@/components/admin/finance/FinanceKpiCard";
import { adminFetch, useAdminData } from "@/hooks/useAdminData";
import type { PaymentReconciliationPayload } from "@/lib/admin/payments/loadPaymentReconciliation";
import { defaultOfficePayoutPeriodRange } from "@/lib/admin/payouts/officePayoutPeriodReport";
import { cn } from "@/lib/utils";

function formatZar(cents: number | null): string {
  if (cents == null) return "—";
  return `R ${Math.round(cents / 100).toLocaleString("en-ZA")}`;
}

/** Compact display for long Paystack / internal gateway references. */
function shortenGatewayReference(ref: string, tail = 6): string {
  const trimmed = ref.trim();
  if (trimmed.length <= 22) return trimmed;
  const parts = trimmed.split("_");
  if (parts.length >= 2) {
    const prefix = parts.length >= 3 ? `${parts[0]}_${parts[1]}` : parts[0];
    return `${prefix}_…${trimmed.slice(-tail)}`;
  }
  return `${trimmed.slice(0, 10)}…${trimmed.slice(-tail)}`;
}

function shortenEntityId(id: string): string {
  return id.length <= 12 ? id : `${id.slice(0, 8)}…`;
}

const ISSUE_LABELS: Record<string, string> = {
  missing_fee_expense: "Missing fee expense",
  fee_expense_amount_mismatch: "Fee expense mismatch",
  booking_amount_mismatch: "Booking amount mismatch",
  entity_amount_mismatch: "Source amount mismatch",
  reference_mismatch: "Reference mismatch",
  missing_payment_transaction: "Missing payment record",
};

const ENTITY_LABELS: Record<string, string> = {
  booking: "Booking",
  monthly_invoice: "Monthly invoice",
  sales_document: "Sales document",
};

function entityHref(entityType: string, entityId: string): string | null {
  if (entityType === "booking") return `/office/bookings/${entityId}`;
  if (entityType === "monthly_invoice") return `/office/invoices/${entityId}`;
  if (entityType === "sales_document") return `/office/sales-documents/${entityId}`;
  return null;
}

type BackfillStatus = {
  missing_count: number;
};

type BackfillResult = BackfillStatus & {
  scanned: number;
  created: number;
  skipped_existing: number;
  failed: number;
};

export default function PaymentReconciliationPage() {
  const defaults = defaultOfficePayoutPeriodRange();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [issuesOnly, setIssuesOnly] = useState(true);
  const [backfillBusy, setBackfillBusy] = useState(false);
  const [backfillResult, setBackfillResult] = useState<BackfillResult | null>(null);
  const [backfillError, setBackfillError] = useState<string | null>(null);

  const params = useMemo(() => ({ from, to }), [from, to]);
  const { data, loading, error, refetch } = useAdminData<PaymentReconciliationPayload>(
    "/api/admin/payment-reconciliation",
    { params },
  );
  const { data: backfillStatus, refetch: refetchBackfillStatus } = useAdminData<BackfillStatus>(
    "/api/admin/payments/backfill-paystack",
  );

  async function runBackfill() {
    setBackfillBusy(true);
    setBackfillError(null);
    try {
      const res = await adminFetch<BackfillResult>("/api/admin/payments/backfill-paystack?limit=200", {
        method: "POST",
      });
      if (!res.ok) {
        setBackfillError(res.error ?? "Backfill failed.");
        return;
      }
      setBackfillResult(res.data ?? null);
      await Promise.all([refetch(), refetchBackfillStatus()]);
    } catch (e) {
      setBackfillError(e instanceof Error ? e.message : "Backfill failed.");
    } finally {
      setBackfillBusy(false);
    }
  }

  const summary = data?.summary;
  const rows = (data?.rows ?? []).filter((r) => !issuesOnly || r.issues.length > 0);
  const issueCount =
    (summary?.missing_expense_count ?? 0) +
    (summary?.amount_mismatch_count ?? 0) +
    (summary?.missing_payment_record_count ?? 0);

  const missingBy = summary?.missing_by_entity;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <OfficeZohoPageHeader
        title="Payment reconciliation"
        subtitle="Compare Paystack transactions, settlements, recorded payments, and fee expenses"
        live
        actions={
          <>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-slate-200 px-3 py-2 text-sm" />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-slate-200 px-3 py-2 text-sm" />
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={issuesOnly} onChange={(e) => setIssuesOnly(e.target.checked)} />
              Issues only
            </label>
            <OfficeZohoSecondaryButton onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" /> Refresh
            </OfficeZohoSecondaryButton>
            <Link href="/office/financial-dashboard" className="text-sm font-medium text-[#408df7] hover:underline">
              Finance dashboard →
            </Link>
          </>
        }
      />

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {backfillError ? <p className="text-sm text-red-600">{backfillError}</p> : null}

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Database className="h-4 w-4" />
              Historical Paystack backfill
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Creates missing payment ledger rows and approved Paystack fee expenses for paid bookings and invoices.
              Idempotent — safe to run repeatedly.
            </p>
            {backfillResult ? (
              <p className="mt-2 text-sm text-emerald-700">
                Last run: {backfillResult.created} created, {backfillResult.skipped_existing} already recorded,{" "}
                {backfillResult.failed} failed.
              </p>
            ) : null}
          </div>
          <div className="flex flex-col items-end gap-2">
            <FinanceKpiCard
              icon={Database}
              label="Missing ledger rows"
              value={String(backfillStatus?.missing_count ?? "—")}
              loading={loading}
              status={(backfillStatus?.missing_count ?? 0) > 0 ? "warning" : "positive"}
            />
            <OfficeZohoSecondaryButton onClick={() => void runBackfill()} disabled={backfillBusy}>
              <RefreshCw className={`h-4 w-4 ${backfillBusy ? "animate-spin" : ""}`} />
              {backfillBusy ? "Backfilling…" : "Run backfill"}
            </OfficeZohoSecondaryButton>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        <FinanceKpiCard icon={Scale} label="Transactions" value={String(summary?.total_transactions ?? 0)} loading={loading} />
        <FinanceKpiCard icon={CheckCircle2} label="Gross collected" value={formatZar(summary?.total_gross_cents ?? 0)} loading={loading} status="positive" />
        <FinanceKpiCard icon={AlertTriangle} label="Gateway fees" value={formatZar(summary?.total_fees_cents ?? 0)} loading={loading} status="warning" />
        <FinanceKpiCard icon={CheckCircle2} label="Net settlement" value={formatZar(summary?.total_net_cents ?? 0)} loading={loading} />
        <FinanceKpiCard
          icon={AlertTriangle}
          label="Reconciliation issues"
          value={String(issueCount)}
          loading={loading}
          status={issueCount > 0 ? "negative" : "positive"}
        />
        {missingBy ? (
          <>
            <FinanceKpiCard icon={Scale} label="Missing bookings" value={String(missingBy.booking)} loading={loading} />
            <FinanceKpiCard icon={Scale} label="Missing invoices" value={String(missingBy.monthly_invoice)} loading={loading} />
            <FinanceKpiCard icon={Scale} label="Missing sales docs" value={String(missingBy.sales_document)} loading={loading} />
          </>
        ) : null}
      </div>

      <OfficeZohoTableShell>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Entity</th>
                <th className="px-4 py-3">Paid</th>
                <th className="px-4 py-3 text-right">Gross</th>
                <th className="px-4 py-3 text-right">Fee</th>
                <th className="px-4 py-3 text-right">Net</th>
                <th className="px-4 py-3 text-right">Source amt</th>
                <th className="px-4 py-3">Fee method</th>
                <th className="px-4 py-3">Settlement</th>
                <th className="px-4 py-3">Issues</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-slate-400">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-slate-400">
                    {issuesOnly ? "No reconciliation issues in this period." : "No Paystack transactions in this period."}
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const href = entityHref(row.entity_type, row.entity_id);
                  return (
                  <tr key={`${row.gateway_reference}-${row.entity_id}`} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="max-w-[9rem] px-4 py-2 font-mono text-xs" title={row.gateway_reference}>
                      <span className="block truncate">{shortenGatewayReference(row.gateway_reference)}</span>
                    </td>
                    <td className="px-4 py-2 text-slate-600" title={row.entity_id}>
                      {href ? (
                        <Link href={href} className="font-medium text-[#408df7] hover:underline">
                          {ENTITY_LABELS[row.entity_type] ?? row.entity_type}
                        </Link>
                      ) : (
                        ENTITY_LABELS[row.entity_type] ?? row.entity_type
                      )}
                      <span className="block text-xs text-slate-400">{shortenEntityId(row.entity_id)}</span>
                    </td>
                    <td className="px-4 py-2 text-slate-600">{row.paid_at?.slice(0, 10) ?? "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatZar(row.payment_amount_cents)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatZar(row.payment_processing_fee_cents)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatZar(row.payment_net_settlement_cents)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatZar(row.booking_amount_cents)}</td>
                    <td className="px-4 py-2 text-xs text-slate-500">{row.payment_fee_method ?? "—"}</td>
                    <td className="px-4 py-2 text-xs text-slate-500">{row.payment_settlement_status ?? "—"}</td>
                    <td className="px-4 py-2">
                      {row.issues.length === 0 ? (
                        <span className="text-xs text-emerald-600">OK</span>
                      ) : (
                        <ul className="space-y-0.5">
                          {row.issues.map((issue) => (
                            <li key={issue} className={cn("text-xs font-medium text-amber-700")}>
                              {ISSUE_LABELS[issue] ?? issue}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </OfficeZohoTableShell>
    </div>
  );
}
