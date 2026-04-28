"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cleanerAuthenticatedFetch } from "@/lib/cleaner/cleanerAuthenticatedFetch";
import { getCleanerAuthHeaders } from "@/lib/cleaner/cleanerClientHeaders";

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

export default function CleanerPaymentSettingsPage() {
  const router = useRouter();
  const [details, setDetails] = useState<PaymentDetails | null>(null);
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    const headers = await getCleanerAuthHeaders();
    if (!headers) {
      router.replace("/cleaner/login");
      return;
    }

    try {
      const res = await cleanerAuthenticatedFetch("/api/cleaner/payment-details", { headers });
      const json = await readJson(res);
      if (!res.ok) {
        setError(json.error ?? "Could not load payment details.");
        return;
      }
      setDetails(json.details);
      setBankCode(json.details?.bankCode ?? "");
      setAccountName(json.details?.accountName ?? "");
      setError(null);
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
    setSuccess(null);

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
      setSuccess("Payment details saved. Your payout recipient is ready.");
    } catch {
      setError("Network error while saving payment details.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-8">
        <div className="h-8 w-56 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-72 animate-pulse rounded-2xl bg-zinc-200/80 dark:bg-zinc-800/80" />
      </main>
    );
  }

  const lastUpdated = updatedLabel(details?.updatedAt ?? null);

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Cleaner settings</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Payment details</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Save the bank account where your weekly cleaner payouts should be sent.
        </p>
      </header>

      {details?.hasRecipientCode ? (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100">
          <p className="font-semibold">Ready for payout</p>
          <p className="mt-1">
            Current account: {details.accountNumberMasked ?? "saved"}
            {lastUpdated ? ` · updated ${lastUpdated}` : ""}
          </p>
        </section>
      ) : (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
          <p className="font-semibold">Missing bank details</p>
          <p className="mt-1">Add your account details before payouts can be sent.</p>
        </section>
      )}

      {error ? (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-100">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100">
          {success}
        </p>
      ) : null}

      <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
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
            placeholder={details?.accountNumberMasked ?? "Enter account number"}
            minLength={6}
            maxLength={20}
            required
          />
          {details?.accountNumberMasked ? (
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              For security, we only show the saved account as {details.accountNumberMasked}. Re-enter the full account number to update.
            </span>
          ) : null}
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Account holder name</span>
          <Input
            value={accountName}
            onChange={(event) => setAccountName(event.target.value)}
            autoComplete="name"
            placeholder="Name on bank account"
            minLength={2}
            maxLength={120}
            required
          />
        </label>

        <Button type="submit" disabled={saving} className="w-full">
          {saving ? "Saving..." : "Save payment details"}
        </Button>
      </form>
    </main>
  );
}
