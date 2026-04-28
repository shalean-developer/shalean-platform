"use client";

import { startTransition, useCallback, useEffect, useMemo, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InvoiceAdjustmentsTable } from "@/components/admin/invoices/InvoiceAdjustmentsTable";
import { InvoiceBookingsTable } from "@/components/admin/invoices/InvoiceBookingsTable";
import { InvoiceClosedBanner } from "@/components/admin/invoices/InvoiceClosedBanner";
import { InvoiceHeader } from "@/components/admin/invoices/InvoiceHeader";
import { InvoiceHeaderActions } from "@/components/admin/invoices/InvoiceHeaderActions";
import { InvoicePaymentsTable } from "@/components/admin/invoices/InvoicePaymentsTable";
import { InvoiceTimeline } from "@/components/admin/invoices/InvoiceTimeline";
import {
  buildInvoiceHumanTimelineForAdmin,
  parseMonthlyInvoiceSnapshotV1,
} from "@/lib/admin/invoices/buildInvoiceHumanTimelineForAdmin";
import { categoryAggregateSummaryLines, sumAdjustmentAmountsByCategory } from "@/lib/admin/invoices/invoiceAdjustmentAggregates";
import { formatCurrency } from "@/lib/admin/invoices/invoiceAdminFormatters";
import { splitHumanTimelineLines } from "@/lib/admin/invoices/invoiceTimelinePresentation";
import type { AdminInvoiceBundle } from "@/lib/admin/invoices/loadAdminInvoiceBundle";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import type { InvoiceTimelineDbEvent } from "@/lib/monthlyInvoice/buildInvoiceHumanTimeline";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "not_found" }
  | { status: "ready"; data: AdminInvoiceBundle };

export function AdminInvoiceDetailsView({ invoiceId }: { invoiceId: string }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const load = useCallback(async () => {
    if (!invoiceId) {
      setState({ status: "error", message: "Missing invoice id." });
      return;
    }
    const sb = getSupabaseBrowser();
    if (!sb) {
      setState({ status: "error", message: "Supabase client is not configured." });
      return;
    }
    const { data: sessionData } = await sb.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setState({ status: "error", message: "Please sign in as admin." });
      return;
    }

    const res = await fetch(`/api/admin/invoices/${encodeURIComponent(invoiceId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 404) {
      setState({ status: "not_found" });
      return;
    }
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setState({ status: "error", message: j.error ?? `Request failed (${res.status})` });
      return;
    }
    const data = (await res.json()) as AdminInvoiceBundle;
    setState({ status: "ready", data });
  }, [invoiceId]);

  useEffect(() => {
    startTransition(() => {
      void load();
    });
  }, [load]);

  const getAccessToken = useCallback(async () => {
    const sb = getSupabaseBrowser();
    const { data } = await sb?.auth.getSession() ?? { data: { session: null } };
    return data.session?.access_token ?? null;
  }, []);

  const timelineRows = useMemo(() => {
    if (state.status !== "ready") return [];
    const inv = state.data.invoice;
    const events: InvoiceTimelineDbEvent[] = state.data.events?.length
      ? state.data.events
      : ([] as InvoiceTimelineDbEvent[]);
    const lines = buildInvoiceHumanTimelineForAdmin({
      invoice: inv,
      fullEventHistory: events.length ? events : null,
    });
    return splitHumanTimelineLines(lines);
  }, [state]);

  const snapshotV1 = useMemo(() => {
    if (state.status !== "ready") return null;
    return parseMonthlyInvoiceSnapshotV1(state.data.invoice.snapshot_at_finalize);
  }, [state]);

  const payoutSummary = useMemo(() => {
    if (state.status !== "ready") return { totalCents: 0, count: 0 };
    let total = 0;
    let count = 0;
    for (const b of state.data.bookings) {
      if (String(b.payout_status ?? "").toLowerCase() !== "eligible") continue;
      const frozen = Math.round(Number(b.payout_frozen_cents ?? 0));
      total += frozen;
      count += 1;
    }
    return { totalCents: total, count };
  }, [state]);

  const adjustmentCategorySummary = useMemo(() => {
    if (state.status !== "ready") return [];
    const cur = String(state.data.invoice.currency_code ?? "ZAR");
    const totals = sumAdjustmentAmountsByCategory(state.data.adjustments);
    return categoryAggregateSummaryLines(totals, cur);
  }, [state]);

  const lastInvoiceClosed = useMemo(() => {
    if (state.status !== "ready") return null;
    let last: { at: string; via: "manual" | "paid" } | null = null;
    for (const e of state.data.events ?? []) {
      const p = e.payload as Record<string, unknown>;
      if (String(p.kind ?? "") !== "invoice_closed") continue;
      const at = typeof p.at === "string" && p.at ? p.at : e.created_at;
      const via = p.via === "paid" ? "paid" : "manual";
      last = { at, via };
    }
    return last;
  }, [state]);

  const bookingCountToSettle = useMemo(() => {
    if (state.status !== "ready") return 0;
    let n = 0;
    for (const b of state.data.bookings) {
      if (String(b.status ?? "").toLowerCase() === "cancelled") continue;
      n += 1;
    }
    return n;
  }, [state]);

  if (state.status === "loading") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-sm text-zinc-600 dark:text-zinc-300">Loading invoice…</p>
      </div>
    );
  }

  if (state.status === "not_found") {
    return (
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>Invoice not found</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">No monthly invoice exists for this id.</p>
        </CardContent>
      </Card>
    );
  }

  if (state.status === "error") {
    return (
      <Card className="max-w-lg border-red-200 dark:border-red-900/50">
        <CardHeader>
          <CardTitle className="text-red-800 dark:text-red-200">Could not load invoice</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-red-700 dark:text-red-300">{state.message}</p>
        </CardContent>
      </Card>
    );
  }

  const { invoice, customerProfile, customerContact, bookings, adjustments, adjustmentCreatorEmails, events, cleanersById } =
    state.data;
  const currency = String(invoice.currency_code ?? "ZAR");
  const totalCents = Math.round(Number(invoice.total_amount_cents ?? 0));
  const paidCents = Math.round(Number(invoice.amount_paid_cents ?? 0));
  const balanceFromRow = invoice.balance_cents;
  const balanceCents =
    typeof balanceFromRow === "number" && Number.isFinite(balanceFromRow)
      ? Math.round(balanceFromRow)
      : Math.max(0, totalCents - paidCents);
  const customerLabel = (customerProfile?.full_name ?? "").trim() || "Unknown customer";
  const customerId = String(invoice.customer_id ?? "");
  const month = String(invoice.month ?? "");
  const status = String(invoice.status ?? "draft");
  const isOverdue = Boolean(invoice.is_overdue);
  const isClosed = Boolean(invoice.is_closed);
  const paymentLink = typeof invoice.payment_link === "string" ? invoice.payment_link : null;
  const sentAt = typeof invoice.sent_at === "string" ? invoice.sent_at : null;
  const billingRiskRaw = String(customerProfile?.account_billing_risk ?? "ok").toLowerCase();
  const accountBillingRisk: "ok" | "at_risk" = billingRiskRaw === "at_risk" ? "at_risk" : "ok";

  const headerActions = (
    <InvoiceHeaderActions
      invoiceId={invoiceId}
      status={status}
      isClosed={isClosed}
      paymentLink={paymentLink}
      sentAt={sentAt}
      currencyCode={currency}
      totalAmountCents={totalCents}
      amountPaidCents={paidCents}
      balanceCents={balanceCents}
      bookingCountToSettle={bookingCountToSettle}
      getAccessToken={getAccessToken}
      onDone={load}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <InvoiceHeader
        customerLabel={customerLabel}
        customerId={customerId}
        customerEmail={customerContact.email}
        customerPhone={customerContact.phone}
        month={month}
        status={status}
        isOverdue={isOverdue}
        isClosed={isClosed}
        currencyCode={currency}
        totalAmountCents={totalCents}
        amountPaidCents={paidCents}
        balanceCents={balanceCents}
        sentAt={sentAt}
        accountBillingRisk={accountBillingRisk}
        actions={headerActions}
      />

      {isClosed ? <InvoiceClosedBanner closedAtIso={lastInvoiceClosed?.at ?? null} via={lastInvoiceClosed?.via ?? null} /> : null}

      <InvoiceTimeline rows={timelineRows} featured />

      {adjustmentCategorySummary.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Adjustment mix</CardTitle>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">Net amounts on this invoice by category (from applied adjustment lines).</p>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium tabular-nums text-zinc-900 dark:text-zinc-50">
            {adjustmentCategorySummary.map((line) => (
              <span key={line.label}>{line.text}</span>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-emerald-200/80 bg-gradient-to-br from-emerald-50/90 to-white dark:border-emerald-900/40 dark:from-emerald-950/30 dark:to-zinc-900">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Cleaner payouts</CardTitle>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            Frozen line totals for bookings already eligible for payout (customer invoice fully settled path).
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-8 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Eligible total</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-900 dark:text-emerald-100">
              {formatCurrency(payoutSummary.totalCents, currency)}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Eligible bookings</p>
            <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-50">{payoutSummary.count}</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-1">
        <InvoiceBookingsTable
          currencyCode={currency}
          snapshotAtFinalize={snapshotV1}
          liveBookings={bookings}
          cleanersById={cleanersById}
        />
        <InvoiceAdjustmentsTable currencyCode={currency} rows={adjustments} creatorEmails={adjustmentCreatorEmails} />
        <InvoicePaymentsTable currencyCode={currency} events={events} />
      </div>
    </div>
  );
}
