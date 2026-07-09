"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Clock, Gift } from "lucide-react";
import { getDashboardAccessToken } from "@/lib/dashboard/dashboardFetch";
import { cn } from "@/lib/utils";

export type CreditHistoryItem = {
  id: string;
  amountZar: number;
  balanceAfterZar: number;
  type: string;
  note: string | null;
  createdAt: string;
};

function typeLabel(type: string): { label: string; icon: typeof Gift; positive: boolean } {
  switch (type) {
    case "earn":
      return { label: "Earned", icon: Gift, positive: true };
    case "spend":
      return { label: "Used at checkout", icon: ArrowUpRight, positive: false };
    case "reverse":
      return { label: "Reversed", icon: ArrowDownLeft, positive: false };
    case "expire":
      return { label: "Expired", icon: Clock, positive: false };
    case "admin_adjust":
      return { label: "Adjustment", icon: Gift, positive: true };
    default:
      return { label: type, icon: Gift, positive: true };
  }
}

export function ReferralCreditHistory() {
  const [items, setItems] = useState<CreditHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const token = await getDashboardAccessToken();
    if (!token) {
      setError("Sign in to view credit history.");
      setLoading(false);
      return;
    }
    const res = await fetch("/api/referrals/credit/history", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json()) as { transactions?: CreditHistoryItem[]; error?: string };
    if (!res.ok) {
      setError(json.error ?? "Could not load credit history.");
      setItems([]);
    } else {
      setItems(json.transactions ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <div className="h-32 animate-pulse rounded-2xl bg-gray-100" />;
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        {error}{" "}
        <button type="button" className="font-semibold underline" onClick={() => void load()}>
          Retry
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white px-5 py-8 text-center shadow-sm">
        <Gift className="mx-auto h-8 w-8 text-gray-300" />
        <p className="mt-2 text-sm font-medium text-gray-900">No credit activity yet</p>
        <p className="mt-1 text-sm text-gray-500">Referrals and checkout usage will appear here.</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-gray-50 rounded-2xl border border-gray-100 bg-white shadow-sm">
      {items.map((tx) => {
        const meta = typeLabel(tx.type);
        const Icon = meta.icon;
        const displayAmount = Math.abs(tx.amountZar);
        return (
          <li key={tx.id} className="flex items-start gap-3 px-5 py-4">
            <div
              className={cn(
                "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                meta.positive ? "bg-emerald-100 text-emerald-600" : "bg-gray-100 text-gray-600",
              )}
            >
              <Icon className="h-4 w-4" strokeWidth={1.75} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-gray-900">{meta.label}</p>
                <p
                  className={cn(
                    "text-sm font-semibold tabular-nums",
                    meta.positive && tx.amountZar > 0 ? "text-emerald-700" : "text-gray-700",
                  )}
                >
                  {tx.amountZar >= 0 ? "+" : "−"}R {displayAmount.toLocaleString("en-ZA")}
                </p>
              </div>
              {tx.note ? <p className="mt-0.5 text-xs text-gray-500">{tx.note}</p> : null}
              <p className="mt-1 text-xs text-gray-400">
                {new Date(tx.createdAt).toLocaleString("en-ZA")} · Balance R{" "}
                {tx.balanceAfterZar.toLocaleString("en-ZA")}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
