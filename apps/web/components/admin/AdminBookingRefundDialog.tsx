"use client";

import { useState } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  bookingId: string;
  paidCents: number;
  priorRefundedCents: number;
  refundStatus: string | null;
  getAccessToken: () => Promise<string | null | undefined>;
  onDone: () => Promise<void> | void;
};

function formatZar(cents: number): string {
  return `R ${(Math.max(0, cents) / 100).toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function AdminBookingRefundDialog({
  open,
  onClose,
  bookingId,
  paidCents,
  priorRefundedCents,
  refundStatus,
  getAccessToken,
  onDone,
}: Props) {
  const refundable = Math.max(0, paidCents - priorRefundedCents);
  const [mode, setMode] = useState<"full" | "partial">("full");
  const [partialZar, setPartialZar] = useState("");
  const [note, setNote] = useState("");
  const [recordOnly, setRecordOnly] = useState(false);
  const [refundReference, setRefundReference] = useState("");
  const [proposalId, setProposalId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  if (!open) return null;

  async function submit() {
    setErr(null);
    setToast(null);
    setBusy(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        setErr("Not signed in.");
        return;
      }
      let amount_cents: number | undefined;
      if (mode === "partial") {
        const zar = Number(partialZar);
        if (!Number.isFinite(zar) || zar <= 0) {
          setErr("Enter a valid partial amount.");
          return;
        }
        amount_cents = Math.round(zar * 100);
        if (amount_cents > refundable) {
          setErr(`Amount exceeds refundable ${formatZar(refundable)}.`);
          return;
        }
      }

      const res = await fetch(`/api/admin/bookings/${encodeURIComponent(bookingId)}/refund`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          note: note.trim() || undefined,
          record_only: recordOnly,
          refund_reference: refundReference.trim() || undefined,
          amount_cents,
          proposal_id: proposalId.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        mode?: string;
        proposal_id?: string;
        refund_status?: string;
        amount_cents?: number;
        refundable_remaining_cents?: number;
      };
      if (!res.ok) {
        setErr(data.error ?? `Refund failed (${res.status})`);
        return;
      }
      if (data.mode === "proposed") {
        setProposalId(String(data.proposal_id ?? ""));
        setToast(
          `Refund proposed (${data.proposal_id}). A different admin must approve with this proposal id.`,
        );
        return;
      }
      setToast(
        `Refund recorded (${data.refund_status}). Remaining refundable: ${formatZar(
          Number(data.refundable_remaining_cents ?? 0),
        )}.`,
      );
      await onDone();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Refund failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal>
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <h2 className="text-lg font-semibold text-zinc-900">Refund payment</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Original paid {formatZar(paidCents)}
          {priorRefundedCents > 0 ? ` · prior refunds ${formatZar(priorRefundedCents)}` : ""}
          {" · "}
          max refundable {formatZar(refundable)}
          {refundStatus ? ` · status ${refundStatus}` : ""}
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          Card refunds usually appear in 5–10 business days depending on the customer&apos;s bank.
        </p>

        <div className="mt-4 space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              checked={mode === "full"}
              onChange={() => setMode("full")}
              disabled={refundable <= 0}
            />
            Full remaining ({formatZar(refundable)})
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" checked={mode === "partial"} onChange={() => setMode("partial")} />
            Partial
          </label>
          {mode === "partial" ? (
            <input
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              placeholder="Amount in ZAR"
              value={partialZar}
              onChange={(e) => setPartialZar(e.target.value)}
            />
          ) : null}
          <textarea
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            rows={2}
            placeholder="Refund reason (required for audit)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input type="checkbox" checked={recordOnly} onChange={(e) => setRecordOnly(e.target.checked)} />
            Record only (already refunded in payment dashboard)
          </label>
          {recordOnly ? (
            <input
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              placeholder="External refund reference (optional)"
              value={refundReference}
              onChange={(e) => setRefundReference(e.target.value)}
            />
          ) : null}
          <input
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            placeholder="Proposal id (maker–checker approve)"
            value={proposalId}
            onChange={(e) => setProposalId(e.target.value)}
          />
        </div>

        {err ? <p className="mt-3 text-sm text-red-700">{err}</p> : null}
        {toast ? <p className="mt-3 text-sm text-emerald-700">{toast}</p> : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-semibold"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            onClick={() => void submit()}
            disabled={busy || refundable <= 0 || !note.trim()}
          >
            {busy ? "Submitting…" : "Submit refund"}
          </button>
        </div>
      </div>
    </div>
  );
}
