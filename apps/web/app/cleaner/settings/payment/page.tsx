"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cleanerAuthenticatedFetch } from "@/lib/cleaner/cleanerAuthenticatedFetch";
import { getCleanerAuthHeaders } from "@/lib/cleaner/cleanerClientHeaders";
import { nextPayoutMondayShort } from "@/lib/cleaner/cleanerPayoutCopy";

type PaymentDetails = {
  bankCode: string | null;
  accountName: string | null;
  accountNumberMasked: string | null;
  hasRecipientCode: boolean;
  updatedAt: string | null;
};

type PaymentDetailsResponse = {
  details: PaymentDetails | null;
  error?: string;
};

const banks = [
  { code: "632005", name: "ABSA Bank" },
  { code: "470010", name: "Capitec Bank" },
  { code: "250655", name: "First National Bank" },
  { code: "580105", name: "Investec Bank" },
  { code: "198765", name: "Nedbank" },
  { code: "051001", name: "Standard Bank" },
  { code: "678910", name: "TymeBank" },
];

async function readJson(res: Response): Promise<PaymentDetailsResponse> {
  return (await res.json().catch(() => ({ error: "Unexpected server response." }))) as PaymentDetailsResponse;
}

function updatedLabel(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

function parseEarningsActivity(json: unknown): boolean {
  if (!json || typeof json !== "object") return false;
  const o = json as { rows?: unknown[]; summary?: Record<string, unknown> };
  if (Array.isArray(o.rows) && o.rows.length > 0) return true;
  const s = o.summary;
  if (!s || typeof s !== "object") return false;
  const p = Number(s.pending_cents) || 0;
  const e = Number(s.eligible_cents) || 0;
  const d = Number(s.paid_cents) || 0;
  return p + e + d > 0;
}

export default function CleanerPaymentSettingsPage() {
  const router = useRouter();
  const [details, setDetails] = useState<PaymentDetails | null>(null);
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [showNextPayoutHint, setShowNextPayoutHint] = useState(false);

  const load = useCallback(async () => {
    const headers = await getCleanerAuthHeaders();
    if (!headers) {
      router.replace("/cleaner/login");
      return;
    }

    try {
      const [res, earningsRes] = await Promise.all([
        cleanerAuthenticatedFetch("/api/cleaner/payment-details", { headers }),
        cleanerAuthenticatedFetch("/api/cleaner/earnings", { headers }).catch(() => null),
      ]);

      const json = await readJson(res);
      if (!res.ok) {
        setError(json.error ?? "Could not load payment details.");
        return;
      }
      setDetails(json.details);
      setBankCode(json.details?.bankCode ?? "");
      setAccountName(json.details?.accountName ?? "");
      setError(null);

      if (earningsRes?.ok) {
        const earnJson = (await earningsRes.json().catch(() => null)) as unknown;
        setShowNextPayoutHint(parseEarningsActivity(earnJson));
      } else {
        setShowNextPayoutHint(false);
      }
    } catch {
      setError("Network error while loading payment details.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const headers = await getCleanerAuthHeaders();
    if (!headers) {
      router.replace("/cleaner/login");
      return;
    }

    setSaving(true);
    setError(null);
    setJustSaved(false);

    try {
      const res = await cleanerAuthenticatedFetch("/api/cleaner/payment-details", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ bankCode, accountNumber, accountName }),
      });
      const json = await readJson(res);
      if (!res.ok) {
        setError(json.error ?? "Could not save payment details.");
        return;
      }
      setDetails(json.details);
      setBankCode(json.details?.bankCode ?? bankCode);
      setAccountName(json.details?.accountName ?? accountName);
      setAccountNumber("");
      setJustSaved(true);
    } catch {
      setError("Network error while saving payment details.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-md space-y-6 px-4 pb-8 pt-6">
        <div className="h-7 w-48 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-4 w-full max-w-sm animate-pulse rounded bg-zinc-200/80 dark:bg-zinc-800/80" />
        <div className="space-y-4 pt-4">
          <div className="h-12 animate-pulse rounded-xl bg-zinc-200/80 dark:bg-zinc-800/80" />
          <div className="h-12 animate-pulse rounded-xl bg-zinc-200/80 dark:bg-zinc-800/80" />
          <div className="h-12 animate-pulse rounded-xl bg-zinc-200/80 dark:bg-zinc-800/80" />
        </div>
      </main>
    );
  }

  const lastUpdated = updatedLabel(details?.updatedAt ?? null);

  return (
    <main className="mx-auto max-w-md px-4 pb-[max(5rem,env(safe-area-inset-bottom))] pt-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Payment details</h1>
        <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Add your bank account to receive weekly payouts
        </p>
      </header>

      <div className="mt-8 space-y-8">
        {justSaved ? (
          <section className="rounded-2xl bg-emerald-50/95 px-4 py-3.5 dark:bg-emerald-950/30" role="status">
            <p className="font-semibold text-emerald-950 dark:text-emerald-50">✅ Payment details saved</p>
            <p className="mt-1 text-sm text-emerald-900 dark:text-emerald-100/90">You&apos;ll receive payouts every week.</p>
          </section>
        ) : details?.hasRecipientCode ? (
          <section className="rounded-2xl bg-emerald-50/90 px-4 py-3.5 text-sm text-emerald-950 dark:bg-emerald-950/25 dark:text-emerald-100">
            <p className="font-semibold">You&apos;re set for payouts</p>
            <p className="mt-1 text-emerald-900/90 dark:text-emerald-100/85">
              Account on file: {details.accountNumberMasked ?? "saved"}
              {lastUpdated ? ` · updated ${lastUpdated}` : ""}
            </p>
          </section>
        ) : (
          <section className="rounded-2xl bg-amber-50/95 px-4 py-3.5 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-50">
            <p className="font-semibold">⚠️ Add your bank details to get paid</p>
            <p className="mt-1 text-amber-900/95 dark:text-amber-100/85">
              You won&apos;t receive payouts until this is completed.
            </p>
          </section>
        )}

        {error ? (
          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-100">
            {error}
          </p>
        ) : null}

        <form onSubmit={onSubmit} className="space-y-6">
          {showNextPayoutHint ? (
            <p className="text-center text-sm font-medium text-zinc-600 dark:text-zinc-400">{nextPayoutMondayShort()}</p>
          ) : null}

          <div className="space-y-5">
            <Select label="Bank" value={bankCode} onChange={(event) => setBankCode(event.target.value)} required>
              <option value="">Select your bank</option>
              {banks.map((bank) => (
                <option key={bank.code} value={bank.code}>
                  {bank.name}
                </option>
              ))}
            </Select>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Account number</span>
              <Input
                value={accountNumber}
                onChange={(event) => setAccountNumber(event.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                autoComplete="off"
                placeholder={details?.accountNumberMasked ? "Enter full number to update" : "e.g. 1234567890"}
                minLength={6}
                maxLength={20}
                required
                className="h-12 rounded-xl border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-950"
              />
              {details?.accountNumberMasked ? (
                <span className="text-xs leading-snug text-zinc-500 dark:text-zinc-400">
                  Saved as {details.accountNumberMasked}. Enter the full account number only if you need to change it.
                </span>
              ) : null}
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Account holder</span>
              <Input
                value={accountName}
                onChange={(event) => setAccountName(event.target.value)}
                autoComplete="name"
                placeholder="Your full name"
                minLength={2}
                maxLength={120}
                required
                className="h-12 rounded-xl border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
          </div>

          <p className="flex items-start gap-2 text-sm leading-snug text-zinc-600 dark:text-zinc-400">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500 dark:text-zinc-500" aria-hidden />
            <span>Your bank details are encrypted and securely stored.</span>
          </p>

          <div className="sticky bottom-0 -mx-4 border-t border-zinc-100 bg-zinc-50/95 px-4 pb-2 pt-3 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/90 md:static md:mx-0 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
            <Button
              type="submit"
              disabled={saving}
              className="h-12 w-full rounded-xl bg-blue-600 text-base font-semibold text-white shadow-sm hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              {saving ? "Saving…" : "Save & receive payouts"}
            </Button>
          </div>
        </form>
      </div>
    </main>
  );
}
