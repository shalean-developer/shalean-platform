"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BulkRemoveActions({
  count,
  teamActive,
  removing,
  pendingConfirm,
  onBeginBulkRemove,
  onConfirmBulkRemove,
  onCancelBulkRemove,
}: {
  count: number;
  teamActive: boolean;
  removing: boolean;
  pendingConfirm: boolean;
  onBeginBulkRemove: () => void;
  onConfirmBulkRemove: () => void | Promise<void>;
  onCancelBulkRemove: () => void;
}) {
  if (count === 0) return null;

  return (
    <div className="sticky bottom-0 z-10 mt-3 border-t border-zinc-200 bg-white/95 py-3 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/95">
      {!pendingConfirm ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{count}</span> selected
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-lg border-rose-200 text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/40"
            disabled={!teamActive || removing}
            onClick={onBeginBulkRemove}
          >
            Remove selected
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 rounded-lg border border-rose-200 bg-rose-50/90 p-3 dark:border-rose-900/50 dark:bg-rose-950/40 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-medium text-rose-950 dark:text-rose-100">
            Remove {count} member{count === 1 ? "" : "s"} from this team?
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="destructive"
              className="rounded-lg"
              disabled={removing}
              onClick={() => void onConfirmBulkRemove()}
            >
              {removing ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                  Removing…
                </>
              ) : (
                "Confirm remove"
              )}
            </Button>
            <Button type="button" size="sm" variant="ghost" className="rounded-lg" disabled={removing} onClick={onCancelBulkRemove}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
