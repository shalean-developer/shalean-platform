"use client";

import { Loader2, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  open: boolean;
  teamName: string | null;
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export function OfficeTeamDeleteDialog({ open, teamName, busy = false, onOpenChange, onConfirm }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideClose className="max-w-md border-slate-200 p-0 dark:border-slate-800">
        <div className="border-b border-slate-100 px-6 py-5 dark:border-slate-800">
          <DialogHeader className="space-y-3 text-left">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-100 text-red-700">
              <Trash2 className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <DialogTitle className="text-xl text-slate-900 dark:text-slate-50">Delete team?</DialogTitle>
              <DialogDescription className="mt-1.5 text-slate-600 dark:text-slate-400">
                This removes the team and its roster links. Teams with active bookings cannot be deleted.
              </DialogDescription>
            </div>
          </DialogHeader>
        </div>

        {teamName ? (
          <div className="px-6 py-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/50">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{teamName}</p>
            </div>
          </div>
        ) : null}

        <DialogFooter className="gap-2 border-t border-slate-100 px-6 py-4 sm:justify-end dark:border-slate-800">
          <button
            type="button"
            disabled={busy}
            onClick={() => onOpenChange(false)}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !teamName}
            onClick={onConfirm}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
            {busy ? "Deleting…" : "Delete team"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
