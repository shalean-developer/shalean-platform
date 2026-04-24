"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

type PayoutRow = {
  id: string;
  cleaner_id: string;
  cleaner_name: string;
  total_amount_cents: number;
  status: "pending" | "approved" | "paid" | "cancelled" | string;
  payment_status?: "pending" | "processing" | "success" | "failed" | "partial_failed" | string | null;
  payment_reference?: string | null;
  period_start: string;
  period_end: string;
  created_at: string;
  approved_at?: string | null;
  paid_at?: string | null;
  booking_count: number;
};

type BookingRow = {
  id: string;
  customer_name: string | null;
  service: string | null;
  date: string | null;
  total_paid_zar: number | null;
  amount_paid_cents: number | null;
  cleaner_payout_cents: number | null;
  cleaner_bonus_cents: number | null;
  company_revenue_cents: number | null;
  is_test: boolean | null;
};

type TransferRow = {
  id: string;
  amount_cents: number;
  recipient_code: string | null;
  transfer_code: string | null;
  status: "processing" | "success" | "failed" | string;
  error: string | null;
  webhook_processed_at?: string | null;
  created_at: string;
};

type Detail = {
  payout: PayoutRow & {
    cleaner_email?: string | null;
    cleaner_phone?: string | null;
  };
  bookings: BookingRow[];
  transfers: TransferRow[];
  paymentReadiness: {
    ready: boolean;
    missingBankDetails: number;
    reason: string | null;
    checkedAt: string | null;
  };
};

type MissingPayoutStatus = {
  remaining: number;
  unresolved: {
    bookingId: string;
    cleanerId: string | null;
    reason: string;
    totalPaidCents: number | null;
    totalPaidZar: number | null;
    baseAmountCents: number | null;
    service: string | null;
  }[];
};

type Toast = { kind: "success" | "error" | "info"; text: string } | null;
type RepairResult = { fixed: number; skipped: number; remaining: number; repairedAt: string } | null;

function zarFromCents(cents: number | null | undefined): string {
  const n = Math.round(Number(cents ?? 0) / 100);
  return `R ${n.toLocaleString("en-ZA")}`;
}

function customerTotalZar(row: BookingRow): string {
  if (typeof row.total_paid_zar === "number") return `R ${Math.round(row.total_paid_zar).toLocaleString("en-ZA")}`;
  return zarFromCents(row.amount_paid_cents);
}

function statusClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "paid") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100";
  if (s === "approved") return "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-100";
  if (s === "cancelled") return "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-100";
  return "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-100";
}

function paymentStatusClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "success") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100";
  if (s === "failed") return "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-100";
  if (s === "partial_failed") return "bg-orange-100 text-orange-900 dark:bg-orange-950/50 dark:text-orange-100";
  if (s === "processing") return "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-100";
  return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200";
}

function paymentStatusCopy(status: string): { label: string; description: string } {
  const s = status.toLowerCase();
  if (s === "processing") return { label: "Processing payment", description: "Waiting for Paystack confirmation" };
  if (s === "success") return { label: "Payment confirmed", description: "Paystack confirmed this transfer" };
  if (s === "failed") return { label: "Payment failed", description: "Paystack rejected or failed this transfer" };
  if (s === "partial_failed") return { label: "Payment partially failed", description: "At least one transfer failed" };
  return { label: "Payment pending", description: "Transfer has not started" };
}

function timeLabel(value: string | null | undefined): string {
  if (!value) return "unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
}

function minutesSince(value: string | null | undefined): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
}

async function readJsonResponse<T>(res: Response): Promise<T & { error?: string }> {
  const text = await res.text();
  if (!text.trim()) return {} as T & { error?: string };
  try {
    return JSON.parse(text) as T & { error?: string };
  } catch {
    return {
      error: res.ok ? "Server returned an invalid JSON response." : text.slice(0, 300),
    } as T & { error?: string };
  }
}

export default function AdminPayoutsPage() {
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [missingPayouts, setMissingPayouts] = useState<MissingPayoutStatus | null>(null);
  const [lastRepairResult, setLastRepairResult] = useState<RepairResult>(null);

  const getToken = useCallback(async () => {
    const sb = getSupabaseBrowser();
    const token = (await sb?.auth.getSession())?.data.session?.access_token;
    if (!token) throw new Error("Please sign in as an admin.");
    return token;
  }, []);

  const loadPayouts = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/payouts", { headers: { Authorization: `Bearer ${token}` } });
      const json = await readJsonResponse<{ payouts?: PayoutRow[] }>(res);
      if (!res.ok) throw new Error(json.error ?? "Could not load payouts.");
      setPayouts(json.payouts ?? []);
      if (!selectedId && json.payouts?.[0]?.id) setSelectedId(json.payouts[0].id);
    } catch (e) {
      setToast({ kind: "error", text: e instanceof Error ? e.message : "Could not load payouts." });
    } finally {
      setLoading(false);
    }
  }, [getToken, selectedId]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/payouts/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await readJsonResponse<Detail>(res);
      if (!res.ok) throw new Error(json.error ?? "Could not load payout details.");
      setDetail({
        payout: json.payout,
        bookings: json.bookings ?? [],
        transfers: json.transfers ?? [],
        paymentReadiness: json.paymentReadiness ?? { ready: false, missingBankDetails: 1, reason: "Missing bank details", checkedAt: null },
      });
    } catch (e) {
      setDetail(null);
      setToast({ kind: "error", text: e instanceof Error ? e.message : "Could not load payout details." });
    } finally {
      setDetailLoading(false);
    }
  }, [getToken]);

  const loadMissingPayouts = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/payouts/backfill-missing", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await readJsonResponse<MissingPayoutStatus>(res);
      if (!res.ok) throw new Error(json.error ?? "Could not load missing payout status.");
      setMissingPayouts({ remaining: json.remaining ?? 0, unresolved: json.unresolved ?? [] });
    } catch {
      setMissingPayouts(null);
    }
  }, [getToken]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPayouts();
      void loadMissingPayouts();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadPayouts, loadMissingPayouts]);

  useEffect(() => {
    if (!selectedId) return;
    const timer = window.setTimeout(() => void loadDetail(selectedId), 0);
    return () => window.clearTimeout(timer);
  }, [selectedId, loadDetail]);

  useEffect(() => {
    if (!selectedId) return;
    const timer = window.setInterval(() => {
      if (!busy) void loadDetail(selectedId);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [busy, selectedId, loadDetail]);

  const totals = useMemo(() => {
    const rows = detail?.bookings ?? [];
    return rows.reduce(
      (acc, row) => {
        acc.customer += typeof row.total_paid_zar === "number" ? Math.round(row.total_paid_zar * 100) : Number(row.amount_paid_cents ?? 0);
        acc.payout += Number(row.cleaner_payout_cents ?? 0);
        acc.bonus += Number(row.cleaner_bonus_cents ?? 0);
        acc.company += Number(row.company_revenue_cents ?? 0);
        acc.tests += row.is_test ? 1 : 0;
        return acc;
      },
      { customer: 0, payout: 0, bonus: 0, company: 0, tests: 0 },
    );
  }, [detail?.bookings]);

  const transferTotals = useMemo(() => {
    const rows = detail?.transfers ?? [];
    return rows.reduce(
      (acc, row) => {
        if (row.status === "success") acc.paid += Number(row.amount_cents ?? 0);
        if (row.status === "failed") acc.failed += Number(row.amount_cents ?? 0);
        return acc;
      },
      { paid: 0, failed: 0 },
    );
  }, [detail?.transfers]);

  async function postAction(path: string, success: string) {
    setBusy(path);
    try {
      const token = await getToken();
      const res = await fetch(path, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const json = await readJsonResponse<{
        error?: string;
        fixed?: number;
        skipped?: number;
        remaining?: number;
        transferCode?: string | null;
        skippedExisting?: boolean;
      }>(res);
      if (!res.ok) throw new Error(json.error ?? "Action failed.");
      if (path === "/api/admin/payouts/backfill-missing") {
        const fixed = Number(json.fixed ?? 0);
        const skipped = Number(json.skipped ?? 0);
        const remaining = Number(json.remaining ?? 0);
        setLastRepairResult({ fixed, skipped, remaining, repairedAt: new Date().toISOString() });
        success =
          remaining > 0
            ? `Fixed ${fixed} booking(s); ${remaining} still need attention.`
            : `Fixed ${fixed} booking(s).`;
      }
      if (path.includes("/pay")) {
        success = json.skippedExisting
          ? "Existing Paystack transfer found; payout marked paid."
          : `Paystack transfer sent${json.transferCode ? ` (${json.transferCode})` : ""}.`;
      }
      setToast({ kind: "success", text: success });
      await loadPayouts();
      await loadMissingPayouts();
      if (selectedId) await loadDetail(selectedId);
    } catch (e) {
      setToast({ kind: "error", text: e instanceof Error ? e.message : "Action failed." });
    } finally {
      setBusy(null);
    }
  }

  const selected = detail?.payout ?? payouts.find((p) => p.id === selectedId) ?? null;
  const approvePath = selected ? `/api/admin/payouts/${encodeURIComponent(selected.id)}/approve` : "";
  const payPath = selected ? `/api/admin/payouts/${encodeURIComponent(selected.id)}/pay` : "";
  const paymentReadiness = detail?.paymentReadiness ?? null;
  const latestFailedTransfer = detail?.transfers.find((row) => row.status === "failed") ?? null;
  const selectedPaymentStatus = String(selected?.payment_status ?? "pending");
  const selectedPaymentCopy = paymentStatusCopy(selectedPaymentStatus);
  const delayedProcessingTransfer = (detail?.transfers ?? []).find((row) => {
    if (row.status !== "processing" || row.webhook_processed_at) return false;
    return (minutesSince(row.created_at) ?? 0) >= 15;
  });
  const delayedProcessingMinutes = minutesSince(delayedProcessingTransfer?.created_at);
  const payBlockedReason =
    selected?.status !== "approved"
      ? null
      : selectedPaymentStatus === "processing"
        ? "Payment is already processing with Paystack"
        : !paymentReadiness
          ? "Checking payment readiness..."
          : !paymentReadiness.ready
            ? "Cannot pay: missing bank details"
            : null;

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Finance</p>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Payout Approval</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Generate payout batches, review job-level totals, approve, then pay via Paystack.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy === "/api/admin/payouts/backfill-missing"}
            onClick={() => void postAction("/api/admin/payouts/backfill-missing", "Missing completed-booking payouts backfilled.")}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            {busy === "/api/admin/payouts/backfill-missing" ? "Backfilling..." : "Backfill missing payouts"}
          </button>
          <button
            type="button"
            disabled={busy === "/api/admin/payouts/generate"}
            onClick={() => void postAction("/api/admin/payouts/generate", "Payout generation complete.")}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {busy === "/api/admin/payouts/generate" ? "Generating..." : "Generate weekly payouts"}
          </button>
        </div>
      </div>

      {missingPayouts && missingPayouts.remaining > 0 ? (
        <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold">
                Payout generation blocked: {missingPayouts.remaining} booking
                {missingPayouts.remaining === 1 ? "" : "s"} missing payouts
              </p>
              <p className="mt-1 text-xs text-amber-900/80 dark:text-amber-100/80">
                Showing {missingPayouts.unresolved.length} of {missingPayouts.remaining}. Repair these before generating payout batches.
              </p>
            </div>
            <button
              type="button"
              disabled={busy === "/api/admin/payouts/backfill-missing"}
              onClick={() => void postAction("/api/admin/payouts/backfill-missing", "Missing completed-booking payouts backfilled.")}
              className="rounded-lg bg-amber-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60 dark:bg-amber-200 dark:text-amber-950"
            >
              {busy === "/api/admin/payouts/backfill-missing"
                ? "Repairing..."
                : lastRepairResult
                  ? `Fixed ${lastRepairResult.fixed} booking${lastRepairResult.fixed === 1 ? "" : "s"}`
                  : "Repair Missing Payouts"}
            </button>
          </div>
          {lastRepairResult ? (
            <p className="mt-3 rounded-lg bg-white/70 px-3 py-2 text-xs font-semibold text-amber-950 dark:bg-zinc-950/40 dark:text-amber-100">
              Fixed {lastRepairResult.fixed} booking{lastRepairResult.fixed === 1 ? "" : "s"}
              {lastRepairResult.skipped > 0 ? ` · skipped ${lastRepairResult.skipped}` : ""}
              {lastRepairResult.remaining > 0 ? ` · ${lastRepairResult.remaining} still unresolved` : " · all clear"}
              <span className="ml-2 font-normal">
                Last repair:{" "}
                {new Date(lastRepairResult.repairedAt).toLocaleTimeString("en-ZA", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </p>
          ) : null}
          <ul className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
            {missingPayouts.unresolved.map((row) => (
              <li key={row.bookingId} className="rounded-lg border border-amber-200 bg-white/70 px-3 py-2 dark:border-amber-900/50 dark:bg-zinc-950/40">
                <a
                  href={`/admin/bookings?bookingId=${encodeURIComponent(row.bookingId)}`}
                  className="font-mono font-semibold text-amber-950 underline-offset-2 hover:underline dark:text-amber-100"
                >
                  Booking {row.bookingId.slice(0, 8)}
                </a>
                <p className="mt-1 text-amber-900/80 dark:text-amber-100/80">
                  {row.reason.replace(/_/g, " ")}
                  {row.service ? ` · ${row.service}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Payout batches</h2>
          </div>
          {loading ? <p className="p-4 text-sm text-zinc-500">Loading payouts...</p> : null}
          {!loading && payouts.length === 0 ? <p className="p-4 text-sm text-zinc-500">No payout batches yet.</p> : null}
          <ul className="max-h-[70vh] divide-y divide-zinc-100 overflow-y-auto dark:divide-zinc-800">
            {payouts.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(p.id)}
                  className={[
                    "w-full px-4 py-3 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-800/60",
                    selectedId === p.id ? "bg-blue-50 dark:bg-blue-950/20" : "",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{p.cleaner_name}</p>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {p.period_start} to {p.period_end} · {p.booking_count} booking(s)
                      </p>
                    </div>
                    <span className={["rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", statusClass(p.status)].join(" ")}>
                      {p.status}
                    </span>
                  </div>
                  <p className="mt-2 text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                    {zarFromCents(p.total_amount_cents)}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          {!selected ? (
            <p className="p-6 text-sm text-zinc-500">Select a payout batch to review.</p>
          ) : (
            <>
              <div className="border-b border-zinc-100 p-4 dark:border-zinc-800">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{selected.cleaner_name}</h2>
                      <span className={["rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", statusClass(selected.status)].join(" ")}>
                        {selected.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                      {selected.period_start} to {selected.period_end} · batch {selected.id.slice(0, 8)}
                    </p>
                    {detail?.payout.cleaner_email || detail?.payout.cleaner_phone ? (
                      <p className="mt-1 text-xs text-zinc-500">
                        {detail.payout.cleaner_email ?? ""} {detail.payout.cleaner_phone ? `· ${detail.payout.cleaner_phone}` : ""}
                      </p>
                    ) : null}
                    {selected.payment_status || selected.payment_reference ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                        <span className={["rounded-full px-2 py-0.5 font-bold uppercase", paymentStatusClass(selectedPaymentStatus)].join(" ")}>
                          {selectedPaymentStatus.replace(/_/g, " ")}
                        </span>
                        <span>{selectedPaymentCopy.description}</span>
                        {selected.payment_reference ? ` · ${selected.payment_reference}` : ""}
                      </div>
                    ) : null}
                    {latestFailedTransfer?.error ? (
                      <p className="mt-1 text-xs font-medium text-rose-700 dark:text-rose-300">
                        Reason: {latestFailedTransfer.error}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={`/api/admin/payouts/${encodeURIComponent(selected.id)}/export`}
                      className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
                    >
                      Export CSV
                    </a>
                    {selected.status === "pending" ? (
                      <button
                        type="button"
                        disabled={busy === approvePath}
                        onClick={() => void postAction(approvePath, "Payout approved.")}
                        className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                      >
                        {busy === approvePath ? "Approving..." : "Approve"}
                      </button>
                    ) : null}
                    {selected.status === "approved" ? (
                      <button
                        type="button"
                        disabled={busy === payPath || Boolean(payBlockedReason)}
                        onClick={() => void postAction(payPath, "Paystack transfer sent.")}
                        title={payBlockedReason ?? undefined}
                        className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {busy === payPath ? "Paying..." : ["failed", "partial_failed"].includes(String(selected.payment_status)) ? "Retry Paystack" : "Pay via Paystack"}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 border-b border-zinc-100 p-4 sm:grid-cols-4 dark:border-zinc-800">
                <Metric label="Customer total" value={zarFromCents(totals.customer)} />
                <Metric label="Cleaner payout" value={zarFromCents(totals.payout)} />
                <Metric label="Cleaner bonus" value={zarFromCents(totals.bonus)} />
                <Metric label="Company revenue" value={zarFromCents(totals.company)} />
              </div>
              {totals.tests > 0 ? (
                <p className="mx-4 mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-100">
                  This batch contains {totals.tests} test booking(s). Approval and paid actions are blocked server-side.
                </p>
              ) : null}
              {paymentReadiness ? (
                <div
                  className={[
                    "mx-4 mt-4 rounded-lg border px-3 py-2 text-sm",
                    paymentReadiness.ready
                      ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100"
                      : "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100",
                  ].join(" ")}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">
                      {paymentReadiness.ready
                        ? "Ready to pay: yes"
                        : `Missing bank details: ${paymentReadiness.missingBankDetails} cleaner`}
                    </p>
                    {!paymentReadiness.ready ? (
                      <a
                        href={`/admin/cleaners?cleanerId=${encodeURIComponent(selected.cleaner_id)}`}
                        className="rounded-md bg-amber-900 px-2.5 py-1 text-xs font-semibold text-white dark:bg-amber-200 dark:text-amber-950"
                      >
                        Add bank details
                      </a>
                    ) : null}
                  </div>
                  {!paymentReadiness.ready ? (
                    <p className="mt-1 text-xs opacity-90">Payment failed reason: {paymentReadiness.reason ?? "Missing bank details"}</p>
                  ) : null}
                  <p className="mt-1 text-xs opacity-80">Last checked: {timeLabel(paymentReadiness.checkedAt)}</p>
                </div>
              ) : null}
              {selectedPaymentStatus === "processing" ? (
                <div className="mx-4 mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
                  <p className="font-semibold">{selectedPaymentCopy.label}...</p>
                  <p className="mt-0.5 text-xs opacity-90">{selectedPaymentCopy.description}</p>
                </div>
              ) : null}
              {delayedProcessingTransfer ? (
                <div className="mx-4 mt-4 rounded-lg border border-orange-300 bg-orange-50 px-3 py-2 text-sm text-orange-950 dark:border-orange-900/60 dark:bg-orange-950/30 dark:text-orange-100">
                  <p className="font-semibold">Payment delayed - awaiting confirmation</p>
                  <p className="mt-0.5 text-xs opacity-90">
                    Paystack has not confirmed this transfer after {delayedProcessingMinutes ?? 15} minute
                    {(delayedProcessingMinutes ?? 15) === 1 ? "" : "s"}. Check Paystack before retrying.
                  </p>
                </div>
              ) : null}
              {(detail?.transfers.length ?? 0) > 0 ? (
                <div className="mx-4 mt-4 grid gap-3 sm:grid-cols-2">
                  <Metric label="Transfers paid" value={zarFromCents(transferTotals.paid)} />
                  <Metric label="Transfers failed" value={zarFromCents(transferTotals.failed)} />
                </div>
              ) : null}

              {detailLoading ? <p className="p-4 text-sm text-zinc-500">Loading batch details...</p> : null}
              <div className="overflow-x-auto p-4">
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead className="border-b border-zinc-200 text-xs uppercase text-zinc-500 dark:border-zinc-700">
                    <tr>
                      <th className="py-2 pr-3">Booking</th>
                      <th className="py-2 pr-3">Date</th>
                      <th className="py-2 pr-3">Customer total</th>
                      <th className="py-2 pr-3">Payout</th>
                      <th className="py-2 pr-3">Bonus</th>
                      <th className="py-2 pr-3">Company</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {(detail?.bookings ?? []).map((b) => (
                      <tr key={b.id}>
                        <td className="py-2 pr-3">
                          <p className="font-medium text-zinc-900 dark:text-zinc-100">{b.customer_name ?? "Customer"}</p>
                          <p className="text-xs text-zinc-500">
                            {b.service ?? "Cleaning"} · {b.id.slice(0, 8)}
                            {b.is_test ? <span className="ml-2 font-bold text-amber-700">TEST</span> : null}
                          </p>
                        </td>
                        <td className="py-2 pr-3 text-zinc-600 dark:text-zinc-400">{String(b.date ?? "—").slice(0, 10)}</td>
                        <td className="py-2 pr-3 tabular-nums">{customerTotalZar(b)}</td>
                        <td className="py-2 pr-3 tabular-nums">{zarFromCents(b.cleaner_payout_cents)}</td>
                        <td className="py-2 pr-3 tabular-nums">{zarFromCents(b.cleaner_bonus_cents)}</td>
                        <td className="py-2 pr-3 tabular-nums">{zarFromCents(b.company_revenue_cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!detailLoading && (detail?.bookings.length ?? 0) === 0 ? (
                  <p className="py-8 text-center text-sm text-zinc-500">No bookings linked to this payout batch.</p>
                ) : null}
              </div>
            </>
          )}
        </section>
      </div>

      {toast ? <ToastMessage toast={toast} onClose={() => setToast(null)} /> : null}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/50">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{value}</p>
    </div>
  );
}

function ToastMessage({ toast, onClose }: { toast: Exclude<Toast, null>; onClose: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onClose, 3500);
    return () => window.clearTimeout(t);
  }, [onClose]);
  const tone =
    toast.kind === "success"
      ? "bg-emerald-600 text-white"
      : toast.kind === "error"
        ? "bg-rose-600 text-white"
        : "bg-blue-600 text-white";
  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm">
      <div className={["rounded-lg px-4 py-3 text-sm font-medium shadow-lg", tone].join(" ")}>
        {toast.text}
      </div>
    </div>
  );
}
