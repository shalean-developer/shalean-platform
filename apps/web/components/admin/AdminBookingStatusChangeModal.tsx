"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  ADMIN_BOOKING_STATUS_OPTIONS,
  adminBookingStatusLabel,
} from "@/lib/admin/adminBookingStatusOptions";

export type AdminBookingStatusChangeModalProps = {
  open: boolean;
  currentStatus: string;
  initialStatus?: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: (status: string, reason: string) => void;
};

export function AdminBookingStatusChangeModal({
  open,
  currentStatus,
  initialStatus,
  busy,
  onClose,
  onConfirm,
}: AdminBookingStatusChangeModalProps) {
  const [nextStatus, setNextStatus] = useState(initialStatus ?? currentStatus);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) return;
    setNextStatus(initialStatus ?? currentStatus);
    setReason("");
  }, [open, currentStatus, initialStatus]);

  if (!open) return null;

  const reasonOk = reason.trim().length >= 3;
  const statusChanged = nextStatus.trim().toLowerCase() !== currentStatus.trim().toLowerCase();
  const canSubmit = reasonOk && statusChanged && !busy;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl">
        <h3 className="text-lg font-semibold text-zinc-900">Change booking status</h3>
        <p className="mt-2 text-sm text-zinc-600">
          Current status: <strong className="font-medium text-zinc-800">{adminBookingStatusLabel(currentStatus)}</strong>.
          A reason is required and is stored in the audit log.
        </p>
        <div className="mt-4 space-y-3">
          <label className="block text-sm font-medium text-zinc-800">
            New status
            <select
              value={nextStatus}
              onChange={(e) => setNextStatus(e.target.value)}
              disabled={busy}
              className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
            >
              {ADMIN_BOOKING_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-zinc-800">
            Reason (required)
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              disabled={busy}
              placeholder="e.g. Customer requested cancellation after service was marked complete in error"
              className="mt-1 w-full resize-y rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
          </label>
          {!statusChanged ? (
            <p className="text-xs text-amber-800">Choose a different status to continue.</p>
          ) : null}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(nextStatus, reason.trim())}
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-60"
          >
            {busy ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Saving…
              </>
            ) : (
              "Update status"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
