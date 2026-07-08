"use client";

import { startTransition, useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
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
import { invoiceBookingOptionsFromRows } from "@/lib/admin/invoices/invoiceBookingSelectOptions";
import { splitHumanTimelineLines } from "@/lib/admin/invoices/invoiceTimelinePresentation";
import { formatZohoOrderReference } from "@/lib/zoho/zohoOrderReference";
import type { AdminInvoiceBundle } from "@/lib/admin/invoices/loadAdminInvoiceBundle";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import type { InvoiceTimelineDbEvent } from "@/lib/monthlyInvoice/buildInvoiceHumanTimeline";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "not_found" }
  | { status: "ready"; data: AdminInvoiceBundle };

export function AdminInvoiceDetailsView({
  invoiceId,
  listHref = "/admin/invoices",
  customersHref = "/admin/customers",
}: {
  invoiceId: string;
  listHref?: string;
  customersHref?: string;
}) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [zohoRefreshBusy, setZohoRefreshBusy] = useState(false);
  const [zohoSyncBusy, setZohoSyncBusy] = useState(false);
  const [zohoRefreshToast, setZohoRefreshToast] = useState<{ text: string; error?: boolean } | null>(null);

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

  const refreshZohoPdf = useCallback(async () => {
    setZohoRefreshBusy(true);
    setZohoRefreshToast(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Not signed in.");

      const res = await fetch(`/api/admin/invoices/${encodeURIComponent(invoiceId)}/sync-zoho`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? `Request failed (${res.status})`);

      setZohoRefreshToast({ text: "Zoho PDF updated. Download again to view changes." });
      await load();
    } catch (e) {
      setZohoRefreshToast({
        text: e instanceof Error ? e.message : "Zoho refresh failed.",
        error: true,
      });
    } finally {
      setZohoRefreshBusy(false);
    }
  }, [getAccessToken, invoiceId, load]);

  const syncToZoho = useCallback(async () => {
    setZohoSyncBusy(true);
    setZohoRefreshToast(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Not signed in.");

      const res = await fetch(`/api/admin/invoices/${encodeURIComponent(invoiceId)}/sync-zoho`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; zohoInvoiceId?: string };
      if (!res.ok) throw new Error(j.error ?? `Request failed (${res.status})`);

      setZohoRefreshToast({
        text: j.zohoInvoiceId
          ? `Synced to Zoho. You can download the PDF now.`
          : "Synced to Zoho.",
      });
      await load();
    } catch (e) {
      setZohoRefreshToast({
        text: e instanceof Error ? e.message : "Zoho sync failed.",
        error: true,
      });
    } finally {
      setZohoSyncBusy(false);
    }
  }, [getAccessToken, invoiceId, load]);

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

  const invoiceBookingOptions = useMemo(() => {
    if (state.status !== "ready") return [];
    return invoiceBookingOptionsFromRows(state.data.bookings);
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
  const paystackReference = typeof invoice.paystack_reference === "string" ? invoice.paystack_reference : null;
  const sentAt = typeof invoice.sent_at === "string" ? invoice.sent_at : null;
  const refundedAt = typeof invoice.refunded_at === "string" ? invoice.refunded_at : null;
  const refundReference = typeof invoice.refund_reference === "string" ? invoice.refund_reference : null;
  const viewCount = Math.max(0, Math.round(Number(invoice.view_count ?? 0)));
  const firstViewedAt = typeof invoice.first_viewed_at === "string" ? invoice.first_viewed_at : null;
  const lastViewedAt = typeof invoice.last_viewed_at === "string" ? invoice.last_viewed_at : null;
  const billingRiskRaw = String(customerProfile?.account_billing_risk ?? "ok").toLowerCase();
  const accountBillingRisk: "ok" | "at_risk" = billingRiskRaw === "at_risk" ? "at_risk" : "ok";

  const hasInvoicePdf = typeof invoice.zoho_invoice_id === "string" && invoice.zoho_invoice_id.trim().length > 0;
  const zohoInvoiceNumber =
    typeof invoice.zoho_invoice_number === "string" && invoice.zoho_invoice_number.trim().length > 0
      ? invoice.zoho_invoice_number.trim()
      : null;
  const shaleanOrderRef = invoiceId ? formatZohoOrderReference(invoiceId, "monthly") : null;
  const canRefreshZohoPdf = status === "draft" && !isClosed && hasInvoicePdf;
  const canSyncToZoho = !hasInvoicePdf && totalCents > 0;

  const headerActions = (
    <div className="grid w-full min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center lg:justify-end">
      {canSyncToZoho ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={zohoSyncBusy}
          className="w-full justify-center border-amber-300 text-amber-800 hover:bg-amber-50 sm:w-auto"
          title="Create this invoice in Zoho Books and link the PDF."
          onClick={() => void syncToZoho()}
        >
          {zohoSyncBusy ? "Syncing…" : "Sync to Zoho"}
        </Button>
      ) : null}
      {canRefreshZohoPdf ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={zohoRefreshBusy}
          className="w-full justify-center sm:w-auto"
          title="Rebuild the Zoho draft from current bookings and adjustment lines."
          onClick={() => void refreshZohoPdf()}
        >
          {zohoRefreshBusy ? "Refreshing…" : "Refresh Zoho PDF"}
        </Button>
      ) : null}
      {hasInvoicePdf ? (
        <a
          href={`/api/admin/invoices/${invoiceId}/pdf`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 sm:w-auto dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
        >
          Download PDF
        </a>
      ) : null}
      <div className="contents sm:col-span-2 lg:contents">
        <InvoiceHeaderActions
        invoiceId={invoiceId}
        status={status}
        isClosed={isClosed}
        paymentLink={paymentLink}
        paystackReference={paystackReference}
        sentAt={sentAt}
        hasInvoicePdf={hasInvoicePdf}
        currencyCode={currency}
        totalAmountCents={totalCents}
        amountPaidCents={paidCents}
        balanceCents={balanceCents}
        bookingCountToSettle={bookingCountToSettle}
        refundedAt={refundedAt}
        refundReference={refundReference}
        invoiceBookings={invoiceBookingOptions}
        getAccessToken={getAccessToken}
        onDone={load}
        />
      </div>
      {zohoRefreshToast ? (
        <p
          className={`col-span-full text-xs ${zohoRefreshToast.error ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-300"}`}
        >
          {zohoRefreshToast.text}
        </p>
      ) : null}
    </div>
  );

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6 overflow-x-hidden">
      <InvoiceHeader
        customerLabel={customerLabel}
        customerId={customerId}
        customerEmail={customerContact.email}
        customerLoginEmail={customerContact.loginEmail}
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
        viewCount={viewCount}
        firstViewedAt={firstViewedAt}
        lastViewedAt={lastViewedAt}
        accountBillingRisk={accountBillingRisk}
        zohoInvoiceNumber={zohoInvoiceNumber}
        shaleanOrderRef={shaleanOrderRef}
        listHref={listHref}
        customersHref={customersHref}
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
        <CardContent className="grid grid-cols-2 gap-4 sm:flex sm:flex-wrap sm:gap-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Eligible total</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-emerald-900 sm:text-2xl dark:text-emerald-100">
              {formatCurrency(payoutSummary.totalCents, currency)}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Eligible bookings</p>
            <p className="mt-1 text-xl font-bold text-zinc-900 sm:text-2xl dark:text-zinc-50">{payoutSummary.count}</p>
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
        <InvoiceAdjustmentsTable
          currencyCode={currency}
          rows={adjustments}
          creatorEmails={adjustmentCreatorEmails}
          invoiceBookings={invoiceBookingOptions}
        />
        <InvoicePaymentsTable currencyCode={currency} events={events} />
      </div>
    </div>
  );
}
