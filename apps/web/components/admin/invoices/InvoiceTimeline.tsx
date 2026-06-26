import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { InvoiceTimelineRow } from "@/lib/admin/invoices/invoiceTimelinePresentation";

export function InvoiceTimeline({ rows, featured = true }: { rows: InvoiceTimelineRow[]; featured?: boolean }) {
  return (
    <Card
      className={cn(
        featured &&
          "border-blue-200 shadow-md ring-1 ring-blue-100 dark:border-blue-900/50 dark:ring-blue-950/40",
      )}
    >
      <CardHeader className={cn(featured && "pb-2")}>
        <CardTitle className={cn(featured && "text-xl tracking-tight sm:text-2xl")}>Invoice timeline</CardTitle>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Full event history for this invoice (ops & support).</p>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No timeline entries yet.</p>
        ) : (
          <ul className="space-y-4">
            {rows.map((row) => (
              <li key={row.id} className="flex gap-3 border-b border-zinc-100 pb-4 last:border-b-0 last:pb-0 dark:border-zinc-800">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800/80 sm:h-10 sm:w-10"
                  aria-hidden
                >
                  <row.Icon className="h-4 w-4 text-zinc-700 dark:text-zinc-200" />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 sm:text-xs">
                    {row.left}
                  </div>
                  <p className="break-words text-sm leading-relaxed text-zinc-800 dark:text-zinc-100">{row.right}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
