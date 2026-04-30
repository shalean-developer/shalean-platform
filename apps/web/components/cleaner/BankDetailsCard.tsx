"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cleanerAuthenticatedFetch } from "@/lib/cleaner/cleanerAuthenticatedFetch";
import { getCleanerAuthHeaders } from "@/lib/cleaner/cleanerClientHeaders";
import { bankDisplayNameFromCode } from "@/lib/cleaner/southAfricanPaystackBanks";

type PaymentDetails = {
  bankCode: string | null;
  accountName: string | null;
  accountNumberMasked: string | null;
  hasRecipientCode: boolean;
};

export function BankDetailsCard() {
  const [details, setDetails] = useState<PaymentDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = await getCleanerAuthHeaders();
      if (!headers) {
        setDetails(null);
        return;
      }
      const res = await cleanerAuthenticatedFetch("/api/cleaner/payment-details", { headers });
      const json = (await res.json().catch(() => ({}))) as { details?: PaymentDetails | null; error?: string };
      if (!res.ok) {
        setError(json.error ?? "Could not load bank details.");
        setDetails(null);
        return;
      }
      setDetails(json.details ?? null);
    } catch {
      setError("Network error.");
      setDetails(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const bankLabel = bankDisplayNameFromCode(details?.bankCode);
  const hasDetails = Boolean(details?.accountNumberMasked || details?.bankCode);
  const oneLine =
    hasDetails && details?.accountNumberMasked
      ? `${bankLabel} ${details.accountNumberMasked}`
      : hasDetails
        ? bankLabel
        : null;

  return (
    <div className="rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/80">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Payout method</p>
      <div className="mt-1 space-y-3">
        {error ? <p className="text-sm text-rose-700 dark:text-rose-300">{error}</p> : null}
        {loading ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : !hasDetails ? (
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">No bank details on file yet.</p>
        ) : (
          <>
            <p className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{oneLine}</p>
            {!details?.hasRecipientCode ? (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
                We&apos;re still verifying this account with the bank.
              </p>
            ) : null}
          </>
        )}
        <Button asChild variant="outline" className="h-11 w-full text-base font-semibold">
          <Link href="/cleaner/settings/payment">{hasDetails ? "Update details" : "Add bank details"}</Link>
        </Button>
      </div>
    </div>
  );
}
