"use client";

import { useState } from "react";
import { Pause, Play, Plus, RefreshCw, Repeat, XCircle } from "lucide-react";
import {
  OfficeZohoPageHeader,
  OfficeZohoPrimaryButton,
  OfficeZohoSecondaryButton,
  OfficeZohoTableShell,
} from "@/components/admin/office/OfficeZohoChrome";
import { RecurringExpenseFormPanel } from "@/components/admin/expenses/RecurringExpenseFormPanel";
import { useAdminData, adminFetch } from "@/hooks/useAdminData";
import { confirm, showToast } from "@/components/ui/notifications";
import { cn } from "@/lib/utils";

type RecurringItem = {
  id: string;
  description: string;
  amount_cents: number;
  frequency: string;
  next_run_date: string;
  last_generated_at: string | null;
  status: string;
  auto_approve: boolean;
  expense_categories?: { name: string; group_name: string } | null;
  expense_vendors?: { name: string } | null;
  cities?: { name: string } | null;
};

function formatZar(cents: number): string {
  return `R ${Math.round(cents / 100).toLocaleString("en-ZA")}`;
}

const STATUS_CLS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  paused: "bg-amber-100 text-amber-700",
  cancelled: "bg-slate-100 text-slate-600",
};

export default function RecurringExpensesPage() {
  const [formOpen, setFormOpen] = useState(false);
  const { data, loading, error, refetch } = useAdminData<{ items: RecurringItem[] }>(
    "/api/admin/recurring-expenses",
  );
  const items = data?.items ?? [];

  async function setStatus(id: string, status: string) {
    const res = await adminFetch(`/api/admin/recurring-expenses/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      showToast("Failed to update recurring expense.", "error");
      return;
    }
    showToast(`Recurring expense ${status}.`, "success");
    refetch();
  }

  async function cancelItem(id: string) {
    if (!(await confirm({ title: "Cancel this recurring expense?", variant: "destructive" }))) return;
    await setStatus(id, "cancelled");
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <OfficeZohoPageHeader
        title="Recurring expenses"
        subtitle="Automated rent, hosting, subscriptions, and other fixed costs"
        live
        actions={
          <>
            <OfficeZohoSecondaryButton onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" /> Refresh
            </OfficeZohoSecondaryButton>
            <OfficeZohoPrimaryButton onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4" /> Add recurring
            </OfficeZohoPrimaryButton>
          </>
        }
      />

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <OfficeZohoTableShell>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Branch</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3">Frequency</th>
              <th className="px-4 py-3">Next run</th>
              <th className="px-4 py-3">Last generated</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                  <Repeat className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                  No recurring expenses yet. Common items: Office Rent, Internet, Hosting, Zoho, Insurance.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-b border-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{item.description}</td>
                  <td className="px-4 py-3 text-slate-600">{item.expense_categories?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{item.cities?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">{formatZar(item.amount_cents)}</td>
                  <td className="px-4 py-3 capitalize text-slate-600">{item.frequency}</td>
                  <td className="px-4 py-3 text-slate-600">{item.next_run_date}</td>
                  <td className="px-4 py-3 text-slate-500">{item.last_generated_at?.slice(0, 10) ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_CLS[item.status] ?? STATUS_CLS.active)}>
                      {item.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {item.status === "active" ? (
                        <button type="button" onClick={() => setStatus(item.id, "paused")} className="rounded p-1 text-amber-600 hover:bg-amber-50" title="Pause">
                          <Pause className="h-4 w-4" />
                        </button>
                      ) : item.status === "paused" ? (
                        <button type="button" onClick={() => setStatus(item.id, "active")} className="rounded p-1 text-emerald-600 hover:bg-emerald-50" title="Resume">
                          <Play className="h-4 w-4" />
                        </button>
                      ) : null}
                      {item.status !== "cancelled" ? (
                        <button type="button" onClick={() => cancelItem(item.id)} className="rounded p-1 text-red-600 hover:bg-red-50" title="Cancel">
                          <XCircle className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </OfficeZohoTableShell>

      <RecurringExpenseFormPanel
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => refetch()}
      />
    </div>
  );
}
