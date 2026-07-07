"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CleanerBankSearchCombobox } from "@/components/cleaner-profile/CleanerBankSearchCombobox";
import { cleanerAuthenticatedFetch } from "@/lib/cleaner/cleanerAuthenticatedFetch";
import { getCleanerAuthHeaders } from "@/lib/cleaner/cleanerClientHeaders";
import { payoutArrivalSummaryJohannesburg } from "@/lib/cleaner/earnings/nextPayoutFriday";
import { bankDisplayNameFromCode } from "@/lib/cleaner/southAfricanPaystackBanks";
import type { CleanerProfileSummaryJson } from "@/lib/cleaner/cleanerProfileSummaryTypes";

type PaymentDetailsJson = {
  details?: {
    bankCode?: string | null;
    accountName?: string | null;
    accountNumberMasked?: string | null;
    hasRecipientCode?: boolean;
  } | null;
  error?: string;
};

type MergedPayment = {
  hasRecipientCode: boolean;
  bankCode?: string | null;
  accountNumberMasked?: string | null;
  accountName?: string | null;
};

function mergePaymentFromSummary(
  payment: PaymentDetailsJson["details"] | null,
  summary: CleanerProfileSummaryJson | null,
): MergedPayment | null {
  if (payment?.hasRecipientCode) {
    return {
      hasRecipientCode: true,
      bankCode: payment.bankCode,
      accountNumberMasked: payment.accountNumberMasked,
      accountName: payment.accountName,
    };
  }
  if (summary?.has_payment_method) {
    return {
      hasRecipientCode: true,
      bankCode: summary.bank_code ?? null,
      accountNumberMasked: summary.account_number_masked ?? null,
      accountName: summary.account_name ?? null,
    };
  }
  return null;
}

export function CleanerPayoutSettingsPanel() {
  const [summary, setSummary] = useState<CleanerProfileSummaryJson | null>(null);
  const [payment, setPayment] = useState<PaymentDetailsJson["details"]>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [bankOpen, setBankOpen] = useState(false);
  const [bankSaving, setBankSaving] = useState(false);
  const [bankFormError, setBankFormError] = useState<string | null>(null);
  const [bankSaveSuccess, setBankSaveSuccess] = useState(false);
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const bankSuccessTimerRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    const headers = await getCleanerAuthHeaders();
    if (!headers) {
      setErr("Not signed in.");
      setSummary(null);
      setPayment(null);
      setLoading(false);
      return;
    }

    const [sumRes, payRes] = await Promise.all([
      cleanerAuthenticatedFetch("/api/cleaner/profile-summary", { headers }),
      cleanerAuthenticatedFetch("/api/cleaner/payment-details", { headers }),
    ]);

    const sumJson = (await sumRes.json().catch(() => ({}))) as CleanerProfileSummaryJson & { error?: string };
    const payJson = (await payRes.json().catch(() => ({}))) as PaymentDetailsJson;

    if (!sumRes.ok) {
      setErr(sumJson.error ?? "Could not load payout details.");
      setSummary(null);
    } else {
      setErr(null);
      setSummary(sumJson);
    }

    setPayment(payRes.ok && !payJson.error ? (payJson.details ?? null) : null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!bankSaveSuccess) return;
    if (bankSuccessTimerRef.current != null) window.clearTimeout(bankSuccessTimerRef.current);
    bankSuccessTimerRef.current = window.setTimeout(() => {
      bankSuccessTimerRef.current = null;
      setBankSaveSuccess(false);
    }, 10_000);
    return () => {
      if (bankSuccessTimerRef.current != null) {
        window.clearTimeout(bankSuccessTimerRef.current);
        bankSuccessTimerRef.current = null;
      }
    };
  }, [bankSaveSuccess]);

  const openBankDialog = () => {
    setBankSaveSuccess(false);
    setBankFormError(null);
    const merged = mergePaymentFromSummary(payment, summary);
    setBankCode(merged?.bankCode?.trim() || "");
    setAccountNumber("");
    setAccountName(String(merged?.accountName ?? "").trim());
    setBankOpen(true);
  };

  const submitBank = async () => {
    setBankSaving(true);
    setBankFormError(null);
    try {
      if (!bankCode.trim()) {
        setBankFormError("Please select your bank.");
        return;
      }
      const headers = await getCleanerAuthHeaders();
      if (!headers) {
        setBankFormError("Not signed in.");
        return;
      }
      const res = await cleanerAuthenticatedFetch("/api/cleaner/payment-details", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          accountNumber: accountNumber.replace(/\s+/g, "").trim(),
          bankCode: bankCode.trim(),
          accountName: accountName.replace(/\s+/g, " ").trim(),
        }),
      });
      const j = (await res.json().catch(() => ({}))) as PaymentDetailsJson & { error?: string };
      if (!res.ok) {
        setBankFormError(j.error ?? "Could not save bank details.");
        return;
      }
      setPayment(j.details ?? null);
      setBankOpen(false);
      setBankSaveSuccess(true);
      await refresh();
    } finally {
      setBankSaving(false);
    }
  };

  const displayPayment = mergePaymentFromSummary(payment, summary);
  const hasRecipient = Boolean(displayPayment?.hasRecipientCode);
  const hasFailedTransfer = Boolean(summary?.has_failed_transfer);
  const bankLabel = bankDisplayNameFromCode(displayPayment?.bankCode ?? null);

  const nextPayoutDateLine = useMemo(() => {
    if (!summary) return "";
    const p = payoutArrivalSummaryJohannesburg(new Date());
    const d = new Date(`${p.payoutTargetFridayYmd}T12:00:00+02:00`);
    return d.toLocaleDateString("en-ZA", {
      timeZone: "Africa/Johannesburg",
      weekday: "long",
      month: "short",
      day: "2-digit",
    });
  }, [summary]);

  if (loading) {
    return <div className="h-40 animate-pulse rounded-2xl bg-gray-200" />;
  }

  if (err) {
    return <p className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</p>;
  }

  return (
    <>
      {bankSaveSuccess ? (
        <div className="flex items-start gap-3 rounded-2xl border border-green-100 bg-green-50 px-4 py-3">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-green-600" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-green-900">Bank details saved</p>
            <p className="text-sm text-green-800">You&apos;re set for weekly payouts.</p>
          </div>
        </div>
      ) : null}

      {hasFailedTransfer ? (
        <div className="flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50 px-4 py-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-red-600" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-red-900">Payout failed</p>
            <p className="text-sm text-red-800">Update your bank details to receive your next payout.</p>
          </div>
        </div>
      ) : null}

      {!hasRecipient ? (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-700" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-amber-950">No payout account</p>
            <p className="text-sm text-amber-900">Add bank details to get paid.</p>
          </div>
        </div>
      ) : null}

      {summary ? (
        <div className="rounded-2xl border border-gray-100 bg-white px-4 py-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Next payout</p>
          <p className="mt-1 text-sm font-semibold text-slate-800">{nextPayoutDateLine}</p>
          <p className="mt-1 text-xs text-slate-400">{summary.payout_schedule_sub}</p>
        </div>
      ) : null}

      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        <div className="px-4 pt-3.5 pb-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Payout account</p>
        </div>
        {hasRecipient && displayPayment ? (
          <div className="divide-y divide-gray-50">
            <div className="flex justify-between gap-3 px-4 py-3 text-sm">
              <span className="text-slate-400">Bank</span>
              <span className="font-medium text-slate-800">{bankLabel}</span>
            </div>
            <div className="flex justify-between gap-3 px-4 py-3 text-sm">
              <span className="text-slate-400">Account</span>
              <span className="font-medium text-slate-800">{displayPayment.accountNumberMasked ?? "—"}</span>
            </div>
            <div className="flex justify-between gap-3 px-4 py-3 text-sm">
              <span className="text-slate-400">Account name</span>
              <span className="max-w-[55%] truncate text-right font-medium text-slate-800">
                {String(displayPayment.accountName ?? "").trim() || "—"}
              </span>
            </div>
          </div>
        ) : (
          <p className="px-4 pb-3 text-sm text-red-600">Bank account not added</p>
        )}
        <div className="border-t border-gray-50 px-4 py-3">
          <button
            type="button"
            onClick={openBankDialog}
            className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
          >
            {hasRecipient ? "Update bank details" : "Add bank details"}
          </button>
        </div>
      </div>

      <Dialog open={bankOpen} onOpenChange={setBankOpen}>
        <DialogContent className="max-w-md overflow-visible rounded-2xl">
          <DialogHeader>
            <DialogTitle>{hasRecipient ? "Update bank details" : "Add bank details"}</DialogTitle>
            <DialogDescription>
              We create a Paystack transfer recipient in your name. Use the account that should receive payouts.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <CleanerBankSearchCombobox active={bankOpen} value={bankCode} onChange={setBankCode} disabled={bankSaving} />
            <div className="space-y-2">
              <Label htmlFor="acct-num">Account number</Label>
              <Input
                id="acct-num"
                inputMode="numeric"
                autoComplete="off"
                className="rounded-xl"
                placeholder="Digits only"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="acct-name">Account holder name</Label>
              <Input
                id="acct-name"
                className="rounded-xl"
                placeholder="As it appears on the bank account"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
              />
            </div>
            {bankFormError ? <p className="text-sm text-destructive">{bankFormError}</p> : null}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => setBankOpen(false)} disabled={bankSaving}>
              Cancel
            </Button>
            <Button
              type="button"
              className="rounded-xl"
              disabled={bankSaving || !bankCode.trim()}
              onClick={() => void submitBank()}
            >
              {bankSaving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
