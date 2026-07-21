"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Download, Loader2, Pencil, Save, Wallet, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { adminFetch, getAdminToken } from "@/hooks/useAdminData";

type PayoutDetailRow = {
  id: string;
  cleaner_id: string;
  cleaner_name: string;
  total_amount_cents: number;
  calculated_amount_cents: number | null;
  adjustment_note: string | null;
  amount_adjusted_at: string | null;
  status: string;
  payment_status: string | null;
  payment_reference: string | null;
  period_start: string;
  period_end: string;
  approved_at: string | null;
  paid_at: string | null;
  cleaner_email?: string | null;
  cleaner_phone?: string | null;
};

type BookingLine = {
  id: string;
  customer_name: string | null;
  service: string | null;
  date: string | null;
  cleaner_payout_cents: number | null;
  cleaner_bonus_cents: number | null;
  is_test: boolean | null;
};

type PayoutDetailResponse = {
  payout: PayoutDetailRow;
  bookings: BookingLine[];
  paymentReadiness: {
    ready: boolean;
    missingBankDetails: number;
    reason: string | null;
    checkedAt: string | null;
  };
};

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "bg-orange-100 text-orange-700" },
  frozen: { label: "Frozen", cls: "bg-violet-100 text-violet-700" },
  approved: { label: "Approved", cls: "bg-blue-100 text-blue-700" },
  paid: { label: "Paid", cls: "bg-emerald-100 text-emerald-700" },
  cancelled: { label: "Cancelled", cls: "bg-slate-100 text-slate-600" },
};

function formatZar(cents: number): string {
  return `R ${Math.round(cents / 100).toLocaleString("en-ZA")}`;
}

function formatPeriod(start: string, end: string): string {
  const s = new Date(start).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
  const e = new Date(end).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
  return `${s} – ${e}`;
}

function centsToZarInput(cents: number): string {
  return String(Math.round(cents / 100));
}

function zarInputToCents(raw: string): number | null {
  const cleaned = raw.replace(/[R\s,]/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

type Props = {
  payoutId: string;
  onBack: () => void;
  onChanged: () => void | Promise<void>;
  onToast: (msg: string, ok: boolean) => void;
};

export function OfficePayoutDetailPanel({ payoutId, onBack, onChanged, onToast }: Props) {
  const [detail, setDetail] = useState<PayoutDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editZar, setEditZar] = useState("");
  const [editNote, setEditNote] = useState("");
  const [visitEditMode, setVisitEditMode] = useState(false);
  const [visitEdits, setVisitEdits] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAdminToken();
      if (!token) throw new Error("Not authenticated");
      const res = await globalThis.fetch(`/api/admin/payouts/${encodeURIComponent(payoutId)}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const json = (await res.json()) as PayoutDetailResponse & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not load payout.");
      setDetail(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed.");
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [payoutId]);

  useEffect(() => {
    void load();
  }, [load]);

  function startVisitEditMode() {
    if (!detail) return;
    const initial: Record<string, string> = {};
    for (const b of detail.bookings) {
      initial[b.id] = centsToZarInput(Number(b.cleaner_payout_cents ?? 0) + Number(b.cleaner_bonus_cents ?? 0));
    }
    setVisitEdits(initial);
    setVisitEditMode(true);
    setEditing(false);
  }

  function cancelVisitEditMode() {
    setVisitEditMode(false);
    setVisitEdits({});
  }

  async function handleSaveVisitEdits() {
    if (!detail) return;
    const changed = detail.bookings.filter((b) => {
      const editZar = visitEdits[b.id];
      if (editZar == null) return false;
      const cents = zarInputToCents(editZar);
      const current = Number(b.cleaner_payout_cents ?? 0) + Number(b.cleaner_bonus_cents ?? 0);
      return cents != null && cents !== current;
    });

    if (changed.length === 0) {
      onToast("No visit earnings were changed.", false);
      return;
    }

    setBusy("save-visits");
    let saved = 0;
    let pendingApproval = 0;
    let failed = 0;
    let lastError: string | null = null;
    for (const b of changed) {
      const cents = zarInputToCents(visitEdits[b.id] ?? "");
      if (cents == null) {
        failed += 1;
        continue;
      }
      const res = await adminFetch<{
        ok?: boolean;
        applied?: boolean;
        requires_approval?: boolean;
        proposal_id?: string;
        approvals_path?: string;
        error?: string;
      }>(`/api/admin/bookings/${encodeURIComponent(b.id)}/adjust-payout-earnings`, {
        method: "PATCH",
        body: JSON.stringify({ payout_cents: cents, bonus_cents: 0 }),
      });
      if (!res.ok) {
        failed += 1;
        lastError = res.error ?? "Save failed";
        continue;
      }
      if (res.data?.requires_approval === true || res.data?.applied === false) {
        pendingApproval += 1;
        continue;
      }
      saved += 1;
    }
    setBusy(null);
    if (failed > 0) {
      onToast(
        lastError
          ? `${lastError} (${saved} saved, ${pendingApproval} pending approval, ${failed} failed)`
          : `Saved ${saved}; ${pendingApproval} pending approval; ${failed} failed.`,
        false,
      );
    } else if (pendingApproval > 0 && saved === 0) {
      onToast(
        `Proposed ${pendingApproval} visit${pendingApproval === 1 ? "" : "s"} for second-admin approval — open /office/payouts/approvals.`,
        true,
      );
    } else if (pendingApproval > 0) {
      onToast(
        `Updated ${saved}; ${pendingApproval} proposed for approval.`,
        true,
      );
      setVisitEditMode(false);
      setVisitEdits({});
    } else {
      onToast(`Updated ${saved} visit${saved === 1 ? "" : "s"} — batch total recalculated.`, true);
      setVisitEditMode(false);
      setVisitEdits({});
    }
    await load();
    await onChanged();
  }

  async function handleSaveAmount() {
    const cents = zarInputToCents(editZar);
    if (cents == null) {
      onToast("Enter a valid payout amount.", false);
      return;
    }
    setBusy("save-amount");
    const res = await adminFetch(`/api/admin/payouts/${encodeURIComponent(payoutId)}/amount`, {
      method: "PATCH",
      body: JSON.stringify({
        total_amount_cents: cents,
        adjustment_note: editNote.trim() || null,
      }),
    });
    setBusy(null);
    if (res.ok) {
      onToast("Payout amount updated", true);
      setEditing(false);
      await load();
      await onChanged();
    } else {
      onToast(res.error ?? "Failed to update amount", false);
    }
  }

  function startEditing() {
    if (!detail) return;
    setEditZar(centsToZarInput(detail.payout.total_amount_cents));
    setEditNote(detail.payout.adjustment_note ?? "");
    setEditing(true);
  }

  async function handleApprove() {
    setBusy("approve");
    const res = await adminFetch(`/api/admin/payouts/${encodeURIComponent(payoutId)}/approve`, { method: "POST" });
    setBusy(null);
    if (res.ok) {
      onToast("Payout approved", true);
      await load();
      await onChanged();
    } else {
      onToast(res.error ?? "Failed to approve", false);
    }
  }

  async function handlePay() {
    setBusy("pay");
    const res = await adminFetch(`/api/admin/payouts/${encodeURIComponent(payoutId)}/pay`, { method: "POST" });
    setBusy(null);
    if (res.ok) {
      onToast("Paystack transfer sent", true);
      await load();
      await onChanged();
    } else {
      onToast(res.error ?? "Payment failed", false);
    }
  }

  async function handleExport() {
    setBusy("export");
    try {
      const token = await getAdminToken();
      if (!token) {
        onToast("Not authenticated", false);
        return;
      }
      const res = await globalThis.fetch(`/api/admin/payouts/${encodeURIComponent(payoutId)}/export`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        onToast(j.error ?? "Export failed", false);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `payout-${payoutId.slice(0, 8)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      onToast("Payout exported", true);
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Export failed", false);
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-slate-100 bg-white p-8 text-sm text-slate-500 shadow-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading payout…
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm">
        <p className="text-sm text-red-700">{error ?? "Payout not found."}</p>
        <button type="button" onClick={onBack} className="mt-3 text-sm font-semibold text-red-700 hover:underline">
          ← Back to all payouts
        </button>
      </div>
    );
  }

  const p = detail.payout;
  const statusKey = (p.status ?? "pending").toLowerCase();
  const status = STATUS_MAP[statusKey] ?? { label: p.status ?? "—", cls: "bg-slate-100 text-slate-600" };
  const payBlocked = !detail.paymentReadiness.ready;
  const testCount = detail.bookings.filter((b) => b.is_test === true).length;
  const canEdit = statusKey === "pending" || statusKey === "frozen";
  const calculatedCents = p.calculated_amount_cents ?? p.total_amount_cents;
  const bookingTotalCents = detail.bookings.reduce(
    (sum, b) => sum + Number(b.cleaner_payout_cents ?? 0) + Number(b.cleaner_bonus_cents ?? 0),
    0,
  );

  return (
    <div className="space-y-4 rounded-2xl border border-blue-100 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-4 sm:px-6">
        <button
          type="button"
          onClick={onBack}
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-700"
        >
          <ArrowLeft className="h-4 w-4" />
          All payouts
        </button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900">{p.cleaner_name}</h2>
              <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold", status.cls)}>{status.label}</span>
            </div>
            <p className="mt-1 text-sm text-slate-600">{formatPeriod(p.period_start, p.period_end)}</p>
            <p className="font-mono text-xs text-slate-400">{p.id}</p>
            {p.cleaner_email || p.cleaner_phone ? (
              <p className="mt-1 text-xs text-slate-500">
                {[p.cleaner_email, p.cleaner_phone].filter(Boolean).join(" · ")}
              </p>
            ) : null}
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Net payout</p>
            {editing ? (
              <div className="mt-1 space-y-2">
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={editZar}
                  onChange={(e) => setEditZar(e.target.value)}
                  className="w-36 rounded-md border border-blue-200 px-2 py-1 text-right text-xl font-bold tabular-nums text-slate-900"
                />
                {zarInputToCents(editZar) !== calculatedCents ? (
                  <input
                    type="text"
                    placeholder="Adjustment note"
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                    className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600"
                  />
                ) : null}
              </div>
            ) : (
              <>
                <p className="text-2xl font-bold tabular-nums text-slate-900">{formatZar(p.total_amount_cents)}</p>
                {p.amount_adjusted_at ? (
                  <p className="text-xs text-violet-600">Manually adjusted</p>
                ) : null}
                {calculatedCents !== p.total_amount_cents ? (
                  <p className="text-xs text-slate-400">Calculated: {formatZar(calculatedCents)}</p>
                ) : null}
              </>
            )}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void handleExport()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {busy === "export" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Export CSV
          </button>
          {canEdit && !editing && !visitEditMode ? (
            <button
              type="button"
              disabled={busy !== null}
              onClick={startVisitEditMode}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit visits
            </button>
          ) : null}
          {visitEditMode ? (
            <>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void handleSaveVisitEdits()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {busy === "save-visits" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save visits
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={cancelVisitEditMode}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </button>
            </>
          ) : null}
          {canEdit && !editing && !visitEditMode ? (
            <button
              type="button"
              disabled={busy !== null}
              onClick={startEditing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit batch total
            </button>
          ) : null}
          {editing ? (
            <>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void handleSaveAmount()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {busy === "save-amount" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => setEditing(false)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </button>
            </>
          ) : null}
          {statusKey === "pending" || statusKey === "frozen" ? (
            <button
              type="button"
              disabled={busy !== null || testCount > 0}
              onClick={() => void handleApprove()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {busy === "approve" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Approve
            </button>
          ) : null}
          {statusKey === "approved" ? (
            <button
              type="button"
              disabled={busy !== null || payBlocked}
              title={payBlocked ? (detail.paymentReadiness.reason ?? "Missing bank details") : undefined}
              onClick={() => void handlePay()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {busy === "pay" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wallet className="h-3.5 w-3.5" />}
              Pay via Paystack
            </button>
          ) : null}
          <Link
            href={`/office/cleaners/${encodeURIComponent(p.cleaner_id)}`}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cleaner profile
          </Link>
        </div>
      </div>

      {canEdit ? (
        <div className="mx-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950 sm:mx-6">
          <p className="font-semibold">Edit earnings before approval</p>
          <p className="mt-1 text-xs leading-relaxed">
            Use <strong>Edit visits</strong> to change each visit amount (e.g. set all 5 visits to R300), or{" "}
            <strong>Edit batch total</strong> for a single lump-sum override. Then click <strong>Approve</strong>.
          </p>
        </div>
      ) : null}

      {p.adjustment_note ? (
        <div className="mx-4 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-950 sm:mx-6">
          <p className="font-semibold">Adjustment note</p>
          <p className="mt-1 text-xs">{p.adjustment_note}</p>
        </div>
      ) : null}

      {bookingTotalCents !== p.total_amount_cents && !p.amount_adjusted_at ? (
        <div className="mx-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 sm:mx-6">
          <p className="font-semibold">Amount mismatch</p>
          <p className="mt-1 text-xs">
            Booking total is {formatZar(bookingTotalCents)} but batch shows {formatZar(p.total_amount_cents)}. Edit
            before approving.
          </p>
        </div>
      ) : null}

      {!detail.paymentReadiness.ready ? (
        <div className="mx-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 sm:mx-6">
          <p className="font-semibold">Bank details required before Paystack</p>
          <p className="mt-1 text-xs">{detail.paymentReadiness.reason ?? "Add bank details on the cleaner profile."}</p>
        </div>
      ) : null}

      {testCount > 0 ? (
        <div className="mx-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 sm:mx-6">
          This batch includes {testCount} test booking{testCount === 1 ? "" : "s"}. Approval is blocked.
        </div>
      ) : null}

      <div className="overflow-x-auto px-4 pb-4 sm:px-6 sm:pb-6">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
          Bookings in batch ({detail.bookings.length})
          {visitEditMode ? (
            <span className="ml-2 font-medium normal-case text-blue-600">— edit each visit amount (ZAR)</span>
          ) : null}
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">
              <th className="py-2 pr-3">Date</th>
              <th className="py-2 pr-3">Customer</th>
              <th className="py-2 pr-3">Service</th>
              <th className="py-2 text-right">Payout</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {detail.bookings.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-6 text-center text-slate-400">
                  No bookings linked to this batch.
                </td>
              </tr>
            ) : (
              detail.bookings.map((b) => {
                const lineCents = Number(b.cleaner_payout_cents ?? 0) + Number(b.cleaner_bonus_cents ?? 0);
                return (
                <tr key={b.id}>
                  <td className="py-2 pr-3 text-slate-600">{b.date ?? "—"}</td>
                  <td className="py-2 pr-3 font-medium text-slate-800">
                    <Link href={`/office/bookings/${encodeURIComponent(b.id)}`} className="hover:text-blue-700 hover:underline">
                      {b.customer_name ?? "—"}
                    </Link>
                  </td>
                  <td className="py-2 pr-3 text-slate-600">{b.service ?? "—"}</td>
                  <td className="py-2 text-right font-semibold tabular-nums text-slate-800">
                    {visitEditMode && canEdit ? (
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={visitEdits[b.id] ?? centsToZarInput(lineCents)}
                        onChange={(e) => setVisitEdits((prev) => ({ ...prev, [b.id]: e.target.value }))}
                        className="w-24 rounded-md border border-blue-200 bg-white px-2 py-1 text-right text-sm font-bold tabular-nums"
                        aria-label={`Edit payout for ${b.customer_name ?? b.id}`}
                      />
                    ) : (
                      formatZar(lineCents)
                    )}
                  </td>
                </tr>
              );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
