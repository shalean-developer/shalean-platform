"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { Select } from "@/components/ui/select";
import { signOut } from "@/lib/auth/authClient";
import { cleanerAuthenticatedFetch } from "@/lib/cleaner/cleanerAuthenticatedFetch";
import { getCleanerAuthHeaders } from "@/lib/cleaner/cleanerClientHeaders";
import { accountHealthBadge, mapCleanerAccountHealthTier } from "@/lib/cleaner/mapCleanerAccountHealth";
import { payoutArrivalSummaryJohannesburg } from "@/lib/cleaner/earnings/nextPayoutFriday";
import { bankDisplayNameFromCode, SOUTH_AFRICAN_PAYSTACK_BANKS } from "@/lib/cleaner/southAfricanPaystackBanks";
import { formatZarFromCents } from "@/lib/cleaner/cleanerZarFormat";
import { CleanerDashboardInfoHint } from "@/components/cleaner-dashboard/CleanerDashboardInfoHint";
import type { CleanerProfileSummaryJson } from "@/lib/cleaner/cleanerProfileSummaryTypes";
import { CUSTOMER_SUPPORT_EMAIL } from "@/lib/site/customerSupport";

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

export default function CleanerProfilePage() {
  const router = useRouter();
  const [summary, setSummary] = useState<CleanerProfileSummaryJson | null>(null);
  const [payment, setPayment] = useState<PaymentDetailsJson["details"]>(null);

  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [bankOpen, setBankOpen] = useState(false);
  const [bankSaving, setBankSaving] = useState(false);
  const [bankFormError, setBankFormError] = useState<string | null>(null);
  const [bankSaveSuccess, setBankSaveSuccess] = useState(false);
  const [bankCode, setBankCode] = useState<string>(SOUTH_AFRICAN_PAYSTACK_BANKS[0]?.code ?? "");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [logoutBusy, setLogoutBusy] = useState(false);
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
      setErr(sumJson.error ?? "Could not load profile.");
      setSummary(null);
    } else {
      setErr(null);
      setSummary(sumJson);
    }

    if (payRes.ok && !payJson.error) {
      setPayment(payJson.details ?? null);
    } else {
      setPayment(null);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await refresh();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
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
    setBankCode(merged?.bankCode?.trim() || SOUTH_AFRICAN_PAYSTACK_BANKS[0]?.code || "");
    setAccountNumber("");
    setAccountName(String(merged?.accountName ?? "").trim());
    setBankOpen(true);
  };

  const submitBank = async () => {
    setBankSaving(true);
    setBankFormError(null);
    try {
      const headers = await getCleanerAuthHeaders();
      if (!headers) {
        setBankFormError("Not signed in.");
        setBankSaving(false);
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
        setBankSaving(false);
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

  const onLogout = async () => {
    setLogoutBusy(true);
    try {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("cleaner_id");
      }
      await signOut();
      router.replace("/cleaner/login?redirect=%2Fcleaner%2Fdashboard");
    } finally {
      setLogoutBusy(false);
    }
  };

  const statusLower = String(summary?.status ?? "").trim().toLowerCase();
  const tier = mapCleanerAccountHealthTier(summary?.status);
  const badge = accountHealthBadge(tier);
  const phone = String(summary?.phone ?? "").trim();
  const email = String(summary?.email ?? "").trim();
  const name = String(summary?.name ?? "").trim() || "—";
  const is_available = summary?.is_available === true;
  const has_failed_transfer = Boolean(summary?.has_failed_transfer);

  const displayPayment = mergePaymentFromSummary(payment, summary);
  const hasRecipient = Boolean(displayPayment?.hasRecipientCode);
  const bankLabel = bankDisplayNameFromCode(displayPayment?.bankCode ?? null);
  const payoutCardDestructive = !hasRecipient || has_failed_transfer;

  const showMissingBankAlert = !hasRecipient;
  const showGoOnline =
    tier === "active" && statusLower !== "busy" && !is_available && statusLower !== "available";

  const supportMailto = `mailto:${CUSTOMER_SUPPORT_EMAIL}?subject=${encodeURIComponent("Shalean cleaner — account help")}`;

  const nextPayoutDateLine = useMemo(() => {
    if (!summary) return "";
    const p = payoutArrivalSummaryJohannesburg(new Date());
    const ymd = p.payoutTargetFridayYmd;
    const d = new Date(`${ymd}T12:00:00+02:00`);
    return d.toLocaleDateString("en-ZA", {
      timeZone: "Africa/Johannesburg",
      weekday: "long",
      month: "short",
      day: "2-digit",
    });
  }, [summary]);

  return (
    <div className="mx-auto w-full max-w-lg space-y-4 bg-background px-4 pt-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2 h-11 rounded-xl px-3 text-muted-foreground">
        <Link href="/cleaner/dashboard">← Home</Link>
      </Button>
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">Profile</h1>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : err ? (
        <p className="text-sm text-destructive">{err}</p>
      ) : (
        <>
          {bankSaveSuccess ? (
            <Card className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/30">
              <div className="flex gap-3">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-semibold text-emerald-950 dark:text-emerald-50">Bank details saved</p>
                  <p className="text-sm text-emerald-900/90 dark:text-emerald-100/90">
                    You&apos;re set for weekly payouts.
                  </p>
                </div>
              </div>
            </Card>
          ) : null}

          {summary ? (
            <div className="space-y-2">
              {has_failed_transfer ? (
                <Card className="rounded-2xl border border-red-200 bg-red-50/80 p-4 dark:border-red-900/60 dark:bg-red-950/30">
                  <div className="flex gap-3">
                    <AlertTriangle className="mt-0.5 size-5 shrink-0 text-red-600 dark:text-red-400" aria-hidden />
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm font-semibold text-red-900 dark:text-red-100">Payout failed</p>
                      <p className="text-sm text-red-800/90 dark:text-red-200/90">Update your bank details.</p>
                      <Button type="button" size="sm" className="mt-2 w-full sm:w-auto" variant="destructive" onClick={openBankDialog}>
                        Fix now
                      </Button>
                    </div>
                  </div>
                </Card>
              ) : null}
              {showMissingBankAlert ? (
                <Card className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/50 dark:bg-amber-950/25">
                  <div className="flex gap-3">
                    <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">No payout account</p>
                      <p className="text-sm text-amber-900/85 dark:text-amber-200/85">Add bank details to get paid</p>
                      <Button type="button" size="sm" className="mt-2 w-full sm:w-auto" onClick={openBankDialog}>
                        Add bank details
                      </Button>
                    </div>
                  </div>
                </Card>
              ) : null}
            </div>
          ) : null}

          <Card className="rounded-2xl p-5 shadow-sm">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold tracking-tight text-foreground">{name}</h2>
              <div className="mt-2 flex items-center gap-2">
                <span
                  className={`size-2.5 shrink-0 rounded-full ${
                    badge.variant === "success"
                      ? "bg-emerald-500"
                      : badge.variant === "warning"
                        ? "bg-amber-500"
                        : "bg-red-600"
                  }`}
                  aria-hidden
                />
                <p className={`text-sm font-medium ${badge.lineClass}`}>{badge.label}</p>
              </div>
            </div>
            {showGoOnline ? (
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <p className="text-sm font-medium text-foreground">You&apos;re currently offline</p>
                <Button asChild size="sm" className="w-full shrink-0 rounded-xl sm:w-auto">
                  <Link href="/cleaner/dashboard">Go online</Link>
                </Button>
              </div>
            ) : null}
            <div className="mt-4 space-y-2 text-sm text-foreground">
              <p>{phone || "—"}</p>
              <p className="text-muted-foreground">{email || "—"}</p>
            </div>
          </Card>

          {summary ? (
            <Card className="rounded-2xl border border-border p-4 shadow-sm">
              <div className="flex items-center gap-1">
                <h3 className="font-medium text-foreground">Next payout</h3>
                <CleanerDashboardInfoHint
                  label="Next payout details"
                  text={`${summary.payout_schedule_headline}\n\n${summary.payout_schedule_sub}`}
                />
              </div>
              <p className="mt-2 text-sm font-semibold text-foreground">{nextPayoutDateLine}</p>
            </Card>
          ) : null}

          <Card
            className={`rounded-2xl p-4 shadow-sm ${
              payoutCardDestructive ? "border border-red-200 dark:border-red-900/50" : "border border-border"
            }`}
          >
            <h3 className="font-medium text-foreground">Payout details</h3>
            {hasRecipient && displayPayment ? (
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Bank</span>
                  <span className="text-right font-medium text-foreground">{bankLabel}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Account</span>
                  <span className="text-right font-medium text-foreground">
                    {displayPayment.accountNumberMasked ?? "—"}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Account name</span>
                  <span className="max-w-[55%] truncate text-right font-medium text-foreground">
                    {String(displayPayment.accountName ?? "").trim() || "—"}
                  </span>
                </div>
                {has_failed_transfer ? (
                  <p className="pt-1 text-sm text-red-600 dark:text-red-400">Last payout failed — confirm these details.</p>
                ) : (
                  <p className="pt-1 text-sm text-emerald-600 dark:text-emerald-400">Ready for payouts.</p>
                )}
              </div>
            ) : !hasRecipient ? (
              <p className="mt-2 text-sm font-medium text-red-600 dark:text-red-400">Bank account not added</p>
            ) : (
              <div className="mt-3 space-y-2 text-sm">
                <p className="text-muted-foreground">We couldn&apos;t show full bank details — use update to change your account.</p>
                {has_failed_transfer ? (
                  <p className="text-red-600 dark:text-red-400">Last payout failed — confirm your account below.</p>
                ) : (
                  <p className="text-emerald-600 dark:text-emerald-400">Ready for payouts.</p>
                )}
              </div>
            )}
            <Button type="button" className="mt-4 w-full rounded-xl" variant={hasRecipient ? "outline" : "default"} onClick={openBankDialog}>
              {hasRecipient ? "Update bank details" : "Add bank details"}
            </Button>
          </Card>

          <Card className="rounded-2xl p-4 shadow-sm">
            <h3 className="font-medium text-foreground">Verification</h3>
            <div className="mt-3 space-y-2 text-sm text-foreground">
              <p>
                Payout profile —{" "}
                <span
                  className={
                    hasRecipient ? "font-semibold text-emerald-600 dark:text-emerald-400" : "font-semibold text-amber-600 dark:text-amber-500"
                  }
                >
                  {hasRecipient ? "Verified" : "Pending"}
                </span>
              </p>
              <p>
                Profile —{" "}
                <span
                  className={
                    phone && email ? "font-semibold text-emerald-600 dark:text-emerald-400" : "font-semibold text-amber-600 dark:text-amber-500"
                  }
                >
                  {phone && email ? "Complete" : "Incomplete"}
                </span>
              </p>
            </div>
            {!hasRecipient || !phone || !email ? (
              <Button type="button" className="mt-4 w-full rounded-xl" variant="secondary" onClick={openBankDialog}>
                Complete setup
              </Button>
            ) : null}
          </Card>

          <Card className="rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">Total earned</p>
                <p className="text-lg font-semibold text-foreground">
                  {summary != null ? formatZarFromCents(summary.total_all_time_cents) : "—"}
                </p>
              </div>
              <Button asChild variant="ghost" className="shrink-0 rounded-xl">
                <Link href="/cleaner/earnings">View earnings</Link>
              </Button>
            </div>
          </Card>

          <Card className="rounded-2xl p-4 shadow-sm">
            <h3 className="font-medium text-foreground">Need help?</h3>
            <Button asChild variant="outline" className="mt-3 w-full rounded-xl">
              <a href={supportMailto}>Contact support</a>
            </Button>
          </Card>

          <Button
            type="button"
            variant="outline"
            className="w-full rounded-xl"
            disabled={logoutBusy}
            onClick={() => void onLogout()}
          >
            {logoutBusy ? "Signing out…" : "Log out"}
          </Button>
        </>
      )}

      <Dialog open={bankOpen} onOpenChange={setBankOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>{hasRecipient ? "Update bank details" : "Add bank details"}</DialogTitle>
            <DialogDescription>
              We create a Paystack transfer recipient in your name. Use the account that should receive payouts.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Select id="bank-code" label="Bank" value={bankCode} onChange={(e) => setBankCode(e.target.value)}>
                {SOUTH_AFRICAN_PAYSTACK_BANKS.map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </div>
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
            <Button type="button" className="rounded-xl" disabled={bankSaving} onClick={() => void submitBank()}>
              {bankSaving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
