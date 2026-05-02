"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { BadgeVariant } from "@/components/ui/badge";
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
import { bankDisplayNameFromCode, SOUTH_AFRICAN_PAYSTACK_BANKS } from "@/lib/cleaner/southAfricanPaystackBanks";
import { formatZarFromCents } from "@/lib/cleaner/cleanerZarFormat";

type MeCleaner = {
  full_name?: string | null;
  phone?: string | null;
  phone_number?: string | null;
  email?: string | null;
  status?: string | null;
  is_available?: boolean | null;
};

type MeJson = {
  cleaner?: MeCleaner | null;
  error?: string;
};

type PaymentDetailsJson = {
  details?: {
    bankCode?: string | null;
    accountName?: string | null;
    accountNumberMasked?: string | null;
    hasRecipientCode?: boolean;
  } | null;
  error?: string;
};

type EarningsJson = {
  total_all_time?: number;
  has_failed_transfer?: boolean;
  paymentDetails?: {
    readyForPayout?: boolean;
    missingBankDetails?: boolean;
  };
  error?: string;
};

function deriveAccountBadge(status: string | null | undefined): {
  variant: BadgeVariant;
  label: string;
  lineClass: string;
} {
  const s = String(status ?? "").trim().toLowerCase();
  if (/(blocked|suspended|banned|disabled)/.test(s)) {
    return {
      variant: "destructive",
      label: "Action required",
      lineClass: "text-red-600 dark:text-red-400",
    };
  }
  if (s.includes("pending")) {
    return {
      variant: "warning",
      label: "Pending verification",
      lineClass: "text-amber-600 dark:text-amber-500",
    };
  }
  return {
    variant: "success",
    label: "Active cleaner",
    lineClass: "text-emerald-600 dark:text-emerald-400",
  };
}

function availabilityHint(c: MeCleaner | null): string {
  if (!c) return "";
  const st = String(c.status ?? "").trim().toLowerCase();
  if (/(blocked|suspended|banned|disabled)/.test(st)) return "Your account needs attention from Shalean.";
  if (st === "busy") return "You are marked busy (on a job).";
  if (c.is_available === true || st === "available") return "Availability is on — you can receive offers.";
  return "Availability is off — turn it on from the home dashboard when you are ready to work.";
}

export default function CleanerProfilePage() {
  const router = useRouter();
  const [me, setMe] = useState<MeCleaner | null>(null);
  const [payment, setPayment] = useState<PaymentDetailsJson["details"]>(null);
  const [earnings, setEarnings] = useState<{
    totalAllTimeCents: number;
    hasFailedTransfer: boolean;
    missingBank: boolean;
    /** True when earnings API reports a saved payout recipient (fallback if payment-details GET fails). */
    payoutReady: boolean;
  } | null>(null);

  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [bankOpen, setBankOpen] = useState(false);
  const [bankSaving, setBankSaving] = useState(false);
  const [bankFormError, setBankFormError] = useState<string | null>(null);
  const [bankCode, setBankCode] = useState<string>(SOUTH_AFRICAN_PAYSTACK_BANKS[0]?.code ?? "");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [logoutBusy, setLogoutBusy] = useState(false);

  const refresh = useCallback(async () => {
    const headers = await getCleanerAuthHeaders();
    if (!headers) {
      setErr("Not signed in.");
      setMe(null);
      setPayment(null);
      setEarnings(null);
      setLoading(false);
      return;
    }

    const [meRes, payRes, earnRes] = await Promise.all([
      cleanerAuthenticatedFetch("/api/cleaner/me", { headers }),
      cleanerAuthenticatedFetch("/api/cleaner/payment-details", { headers }),
      cleanerAuthenticatedFetch("/api/cleaner/earnings", { headers }),
    ]);

    const meJson = (await meRes.json().catch(() => ({}))) as MeJson;
    const payJson = (await payRes.json().catch(() => ({}))) as PaymentDetailsJson;
    const earnJson = (await earnRes.json().catch(() => ({}))) as EarningsJson;

    if (!meRes.ok || !meJson.cleaner) {
      setErr(meJson.error ?? "Could not load profile.");
      setMe(null);
    } else {
      setErr(null);
      setMe(meJson.cleaner);
    }

    if (payRes.ok && !payJson.error) {
      setPayment(payJson.details ?? null);
    } else {
      setPayment(null);
    }

    if (earnRes.ok && !earnJson.error) {
      const missingBank = Boolean(earnJson.paymentDetails?.missingBankDetails);
      setEarnings({
        totalAllTimeCents: Math.max(0, Math.round(Number(earnJson.total_all_time) || 0)),
        hasFailedTransfer: Boolean(earnJson.has_failed_transfer),
        missingBank,
        payoutReady: !missingBank,
      });
    } else {
      setEarnings(null);
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

  const openBankDialog = () => {
    setBankFormError(null);
    setBankCode(payment?.bankCode?.trim() || SOUTH_AFRICAN_PAYSTACK_BANKS[0]?.code || "");
    setAccountNumber("");
    setAccountName(String(payment?.accountName ?? "").trim());
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

  const phone = String(me?.phone_number ?? me?.phone ?? "").trim();
  const email = String(me?.email ?? "").trim();
  const name = String(me?.full_name ?? "").trim() || "—";
  const badge = deriveAccountBadge(me?.status);
  const hasRecipient = Boolean(payment?.hasRecipientCode) || Boolean(earnings?.payoutReady);
  const bankLabel = bankDisplayNameFromCode(payment?.bankCode ?? null);
  const payoutCardDestructive = !hasRecipient || Boolean(earnings?.hasFailedTransfer);

  return (
    <div className="mx-auto min-h-[100dvh] w-full max-w-lg space-y-4 bg-background px-4 pb-28 pt-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2 h-11 rounded-xl px-3 text-muted-foreground">
        <Link href="/cleaner/dashboard">← Home</Link>
      </Button>
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">Account, payouts, and trust at a glance.</p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : err ? (
        <p className="text-sm text-destructive">{err}</p>
      ) : (
        <>
          {!loading && earnings && (earnings.hasFailedTransfer || earnings.missingBank) ? (
            <div className="space-y-2">
              {earnings.hasFailedTransfer ? (
                <Card className="rounded-2xl border border-red-200 bg-red-50/80 p-4 dark:border-red-900/60 dark:bg-red-950/30">
                  <div className="flex gap-3">
                    <AlertTriangle className="mt-0.5 size-5 shrink-0 text-red-600 dark:text-red-400" aria-hidden />
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm font-semibold text-red-900 dark:text-red-100">Payout failed</p>
                      <p className="text-sm text-red-800/90 dark:text-red-200/90">
                        A transfer to your bank did not go through. Update your details or contact Shalean if the problem
                        continues.
                      </p>
                      <Button type="button" size="sm" className="mt-2 w-full sm:w-auto" variant="destructive" onClick={openBankDialog}>
                        Fix now
                      </Button>
                    </div>
                  </div>
                </Card>
              ) : null}
              {earnings.missingBank && !earnings.hasFailedTransfer ? (
                <Card className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/50 dark:bg-amber-950/25">
                  <div className="flex gap-3">
                    <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">No payout account yet</p>
                      <p className="text-sm text-amber-900/85 dark:text-amber-200/85">
                        Add a bank account so weekly payouts can reach you.
                      </p>
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
            <p className="mt-3 text-xs text-muted-foreground">{availabilityHint(me)}</p>
            <div className="mt-4 space-y-2 text-sm text-foreground">
              <p>{phone || "—"}</p>
              <p className="text-muted-foreground">{email || "—"}</p>
            </div>
          </Card>

          <Card
            className={`rounded-2xl p-4 shadow-sm ${
              payoutCardDestructive
                ? "border border-red-200 dark:border-red-900/50"
                : "border border-border"
            }`}
          >
            <h3 className="font-medium text-foreground">Payout details</h3>
            {hasRecipient ? (
              payment ? (
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Bank</span>
                    <span className="text-right font-medium text-foreground">{bankLabel}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Account</span>
                    <span className="text-right font-medium text-foreground">
                      {payment?.accountNumberMasked ?? "—"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Account name</span>
                    <span className="max-w-[55%] truncate text-right font-medium text-foreground">
                      {String(payment?.accountName ?? "").trim() || "—"}
                    </span>
                  </div>
                  {earnings?.hasFailedTransfer ? (
                    <p className="pt-1 text-sm text-red-600 dark:text-red-400">Last payout failed — confirm these details.</p>
                  ) : (
                    <p className="pt-1 text-sm text-emerald-600 dark:text-emerald-400">Ready for payouts.</p>
                  )}
                </div>
              ) : (
                <div className="mt-3 space-y-2 text-sm">
                  <p className="text-muted-foreground">
                    A payout account is on file. Full bank details could not be loaded — you can still replace your account
                    below if needed.
                  </p>
                  {earnings?.hasFailedTransfer ? (
                    <p className="text-red-600 dark:text-red-400">Last payout failed — confirm your account below.</p>
                  ) : (
                    <p className="text-emerald-600 dark:text-emerald-400">Ready for payouts.</p>
                  )}
                </div>
              )
            ) : (
              <>
                <p className="mt-2 text-sm text-red-600 dark:text-red-400">Bank account: not added</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Add your South African bank account so Paystack can pay you.
                </p>
              </>
            )}
            <Button type="button" className="mt-4 w-full rounded-xl" variant={hasRecipient ? "outline" : "default"} onClick={openBankDialog}>
              {hasRecipient ? "Update bank details" : "Add bank details"}
            </Button>
          </Card>

          <Card className="rounded-2xl p-4 shadow-sm">
            <h3 className="font-medium text-foreground">Verification</h3>
            <p className="mt-2 text-xs text-muted-foreground">
              Document checks are run by the Shalean team. Below reflects what the app knows today.
            </p>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Payout profile (Paystack)</span>
                <span className={hasRecipient ? "font-medium text-emerald-600 dark:text-emerald-400" : "font-medium text-amber-600 dark:text-amber-500"}>
                  {hasRecipient ? "Verified" : "Pending"}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Profile on file</span>
                <span
                  className={
                    phone && email ? "font-medium text-emerald-600 dark:text-emerald-400" : "font-medium text-amber-600 dark:text-amber-500"
                  }
                >
                  {phone && email ? "Complete" : "Incomplete"}
                </span>
              </div>
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
                <p className="text-sm text-muted-foreground">Total earned (all time)</p>
                <p className="text-lg font-semibold text-foreground">
                  {earnings != null ? formatZarFromCents(earnings.totalAllTimeCents) : "—"}
                </p>
              </div>
              <Button asChild variant="ghost" className="shrink-0 rounded-xl">
                <Link href="/cleaner/earnings">View earnings</Link>
              </Button>
            </div>
          </Card>

          <Card className="rounded-2xl p-4 shadow-sm">
            <h3 className="font-medium text-foreground">Settings</h3>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/cleaner/dashboard" className="font-medium text-blue-600 underline-offset-4 hover:underline dark:text-blue-400">
                  Home dashboard
                </Link>{" "}
                — change availability and see jobs.
              </li>
              <li>Phone, email, password, and notifications are managed with Shalean support for now.</li>
            </ul>
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
              <Select
                id="bank-code"
                label="Bank"
                value={bankCode}
                onChange={(e) => setBankCode(e.target.value)}
              >
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
