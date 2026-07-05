"use client";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SalesDocumentActionRow } from "@/components/admin/sales-documents/SalesDocumentRowActions";

export function SalesDocumentDeleteDialog({
  doc,
  open,
  busy,
  onOpenChange,
  onConfirm,
}: {
  doc: SalesDocumentActionRow | null;
  open: boolean;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  if (!doc) return null;

  const kind = doc.document_type === "invoice" ? "invoice" : "quote";

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-w-md rounded-2xl border-slate-200">
        <DialogHeader>
          <DialogTitle>Delete {kind}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-slate-600">
          Permanently delete {doc.customer_name}&apos;s {kind} ({doc.id.slice(0, 8).toUpperCase()})?
          This cannot be undone.
        </p>
        {doc.document_type === "quote" ? (
          <p className="text-sm text-amber-800">
            Any linked unpaid invoice and unpaid booking from that invoice will also be removed.
          </p>
        ) : (
          <p className="text-sm text-amber-800">
            Any unpaid booking linked to this invoice will also be removed.
          </p>
        )}
        <DialogFooter className="gap-2 sm:justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={() => onOpenChange(false)}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? "Deleting…" : "Delete"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
