"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { CashSurvivalDashboardPayload } from "@/lib/admin/expenses/loadCashSurvivalDashboard";

type EditableAccount = CashSurvivalDashboardPayload["accounts"][number];

const AUTO_SYNC_AFTER_MS = 15 * 60 * 1000;

export function CashAccountBalanceEditor({
  accounts,
  onSaved,
}: {
  accounts: EditableAccount[];
  onSaved: () => void;
}) {
  const editable = accounts.filter((a) => a.account_type === "bank" || a.account_type === "petty_cash");
  const bankAccounts = editable.filter((a) => a.account_type === "bank");
  const [values, setValues] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [syncingZoho, setSyncingZoho] = useState(false);
  const [canManage, setCanManage] = useState<boolean | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const autoSyncAttempted = useRef(false);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const account of editable) next[account.id] = (account.balance_cents / 100).toFixed(2);
    setValues(next);
  }, [accounts]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/admin/finance-accounts/zoho-sync", { method: "GET" })
      .then((response) => response.json())
      .then((body) => {
        if (!cancelled) setCanManage(body?.can_manage === true);
      })
      .catch(() => {
        if (!cancelled) setCanManage(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function syncFromZoho(automatic = false) {
    if (canManage !== true) return;
    setSyncingZoho(true);
    if (!automatic) setMessage(null);
    try {
      const response = await fetch("/api/admin/finance-accounts/zoho-sync", { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.ok) throw new Error(String(body?.error ?? "Zoho bank sync failed."));
      const balance = Number(body.balance_cents ?? 0) / 100;
      const feedDate = body.feed_last_refresh_date ? ` · feed ${body.feed_last_refresh_date}` : "";
      setMessage(`Bank balance synced from Zoho: R ${balance.toLocaleString("en-ZA", { minimumFractionDigits: 2 })}${feedDate}.`);
      onSaved();
    } catch (e) {
      const text = e instanceof Error ? e.message : "Zoho bank sync failed.";
      setMessage(`${text} You can still enter the bank balance manually below.`);
    } finally {
      setSyncingZoho(false);
    }
  }

  useEffect(() => {
    if (canManage !== true || autoSyncAttempted.current || !bankAccounts.length) return;
    const shouldSync = bankAccounts.some((account) => {
      if (!account.updated_at) return true;
      const ms = Date.parse(account.updated_at);
      return !Number.isFinite(ms) || ms < Date.now() - AUTO_SYNC_AFTER_MS;
    });
    if (!shouldSync) return;
    autoSyncAttempted.current = true;
    void syncFromZoho(true);
  }, [accounts, canManage]);

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
      setMessage(`${account.name} balance refreshed manually.`);
      onSaved();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to save balance.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-white/80 p-4 text-slate-900">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Actual cash balances</h3>
          <p className="text-xs text-slate-500">
            {canManage === true
              ? "Bank balance syncs automatically from the Zoho bank feed when older than 15 minutes. Manual entry remains available as fallback. Safe-to-spend stays unavailable when bank data is older than 48 hours."
              : "Bank balances are read-only for your role. Safe-to-spend stays unavailable when bank data is older than 48 hours."}
          </p>
        </div>
        {bankAccounts.length && canManage === true ? (
          <button
            type="button"
            onClick={() => void syncFromZoho(false)}
            disabled={syncingZoho}
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${syncingZoho ? "animate-spin" : ""}`} />
            Sync bank from Zoho
          </button>
        ) : null}
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
                  disabled={canManage !== true}
                  className="min-w-0 flex-1 py-2 text-sm outline-none disabled:bg-slate-50 disabled:text-slate-500"
                  aria-label={`${account.name} current balance`}
                />
              </div>
              {canManage === true ? (
                <button
                  type="button"
                  onClick={() => save(account)}
                  disabled={savingId === account.id}
                  className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  <RefreshCw className={`h-4 w-4 ${savingId === account.id ? "animate-spin" : ""}`} />
                  Manual save
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      {message ? <p className="mt-3 text-xs text-slate-600">{message}</p> : null}
    </div>
  );
}
