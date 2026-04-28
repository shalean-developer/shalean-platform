"use client";

import type { CustomerMonthlyInvoiceRow } from "@/lib/dashboard/monthlyInvoiceTypes";
import { buildCustomerInvoiceActivity } from "@/lib/dashboard/buildCustomerInvoiceActivity";

export function CustomerInvoiceTimeline({ invoice }: { invoice: CustomerMonthlyInvoiceRow }) {
  const lines = buildCustomerInvoiceActivity(invoice);

  return (
    <div>
      <ul className="space-y-5">
        {lines.map((s, i) => (
          <li key={i} className="flex gap-3">
            <span
              className={
                s.done
                  ? "mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-blue-600"
                  : "mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-zinc-300 dark:bg-zinc-600"
              }
              aria-hidden
            />
            <div className="min-w-0">
              <p className="font-medium text-zinc-900 dark:text-zinc-50">{s.title}</p>
              {s.detail ? <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{s.detail}</p> : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
