"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { CashSurvivalDashboardPayload } from "@/lib/admin/expenses/loadCashSurvivalDashboard";

type EditableAccount = CashSurvivalDashboardPayload["accounts"][number];

export function CashAccountBalanceEditor({
  accounts,
  onSaved,
}: {
  accounts: EditableAccount[];
  onSaved: () => void;
}) {
  const editable = accounts.filter((a) => a.account_type === "bank" || a.account_type === "petty_cash");
  const [values, setValues] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const account of editable) next[account.id] = (account.balance_cents / 100).toFixed(2);
    setValues(next);
  }, [accounts]);

  if (!editable.length) return null;

  async function save(account: EditableAccount) {
    const zar = Number(values[account.id]);
    if (!Number.isFinite(zar) || zar < 0) {
      setMessage("Enter a valid non-negative balance.");
      return;
    }
    setSavingId(account.id);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/finance-accounts/balance", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ account_id: account.id, balance_cents: Math.round(zar * 100) }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(body?.error ?? "Failed to save balance."));
      setMessage(`${account.name} balance refreshed.`);
      onSaved();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to save balance.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-white/80 p-4 text-slate-900">
      <div className="mb-3">
        <h3 className="text-sm font-semibold">Refresh actual cash balances</h3>
        <p className="text-xs text-slate-500">Enter the current available bank/petty-cash balance. Safe-to-spend remains unavailable when bank data is older than 48 hours.</p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {editable.map((account) => (
          <div key={account.id} className="rounded-md border border-slate-200 p-3">
            <div className="mb-2 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{account.name}</p>
                <p className="text-xs text-slate-500">
                  {account.stale ? "Stale" : "Current"} · {account.updated_at ? new Date(account.updated_at).toLocaleString("en-ZA") : "Never updated"}
                </p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${account.stale ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
                {account.account_type === "petty_cash" ? "Petty cash" : "Bank"}
              </span>
            </div>
            <div className="flex gap-2">
              <div className="flex flex-1 items-center rounded-md border border-slate-300 bg-white px-3">
                <span className="mr-2 text-sm text-slate-500">R</span>
                <input
                  inputMode="decimal"
                  value={values[account.id] ?? ""}
                  onChange={(e) => setValues((current) => ({ ...current, [account.id]: e.target.value }))}
                  className="min-w-0 flex-1 py-2 text-sm outline-none"
                  aria-label={`${account.name} current balance`}
                />
              </div>
              <button
                type="button"
                onClick={() => save(account)}
                disabled={savingId === account.id}
                className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${savingId === account.id ? "animate-spin" : ""}`} />
                Save
              </button>
            </div>
          </div>
        ))}
      </div>
      {message ? <p className="mt-3 text-xs text-slate-600">{message}</p> : null}
    </div>
  );
}
