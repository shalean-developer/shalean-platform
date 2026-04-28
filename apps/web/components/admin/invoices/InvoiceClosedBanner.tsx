import { formatDate } from "@/lib/admin/invoices/invoiceAdminFormatters";

export type InvoiceClosedBannerProps = {
  closedAtIso: string | null;
  via: "manual" | "paid" | null;
};

export function InvoiceClosedBanner(props: InvoiceClosedBannerProps) {
  if (!props.closedAtIso) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
        <p className="font-semibold">This billing month is closed</p>
        <p className="mt-1 text-xs text-amber-900/90 dark:text-amber-200/90">Adjustments and most edits are disabled.</p>
      </div>
    );
  }

  const viaLabel = props.via === "paid" ? "after payment" : props.via === "manual" ? "manual" : "closed";
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
      <p className="font-semibold">Invoice closed on {formatDate(props.closedAtIso)} ({viaLabel})</p>
      <p className="mt-1 text-xs text-amber-900/90 dark:text-amber-200/90">Adjustments are disabled for this month.</p>
    </div>
  );
}
