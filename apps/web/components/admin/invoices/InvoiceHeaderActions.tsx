"use client";

import { useRef, useState } from "react";

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
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency, formatDate } from "@/lib/admin/invoices/invoiceAdminFormatters";
import {
  adjustmentCategoryLabel,
  parseAdjustmentCategory,
  type AdjustmentCategory,
} from "@/lib/monthlyInvoice/adjustmentCategory";

const ADJ_PRESETS: { label: string; category: AdjustmentCategory }[] = [
  { label: "Missed visit", category: "missed_visit" },
  { label: "Extra service", category: "extra_service" },
  { label: "Discount", category: "discount" },
];

export type InvoiceHeaderActionsProps = {
  invoiceId: string;
  status: string;
  isClosed: boolean;
  paymentLink: string | null;
  sentAt: string | null;
  currencyCode: string;
  totalAmountCents: number;
  amountPaidCents: number;
  balanceCents: number;
  bookingCountToSettle: number;
  getAccessToken: () => Promise<string | null>;
  onDone: () => Promise<void>;
};

async function authFetch(getToken: () => Promise<string | null>, url: string, init?: RequestInit) {
  const token = await getToken();
  if (!token) throw new Error("Not signed in.");
  const baseHeaders: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  const extra = init?.headers;
  if (extra) {
    if (extra instanceof Headers) {
      extra.forEach((v, k) => {
        baseHeaders[k] = v;
      });
    } else if (Array.isArray(extra)) {
      for (const [k, v] of extra) baseHeaders[k] = v;
    } else {
      Object.assign(baseHeaders, extra as Record<string, string>);
    }
  }
  return fetch(url, {
    ...init,
    headers: baseHeaders,
  });
}

async function readJsonError(res: Response): Promise<string> {
  const j = (await res.json().catch(() => ({}))) as { error?: string };
  return j.error ?? `Request failed (${res.status})`;
}

export function InvoiceHeaderActions(props: InvoiceHeaderActionsProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const actionLock = useRef(false);

  const [adjOpen, setAdjOpen] = useState(false);
  const [adjRand, setAdjRand] = useState("");
  const [adjReason, setAdjReason] = useState("");
  const [adjCategory, setAdjCategory] = useState<AdjustmentCategory>("other");
  const [adjErr, setAdjErr] = useState<string | null>(null);

  const [confirmPaidOpen, setConfirmPaidOpen] = useState(false);
  const [paidConfirmText, setPaidConfirmText] = useState("");
  const [paidNote, setPaidNote] = useState("");
  const [paidErr, setPaidErr] = useState<string | null>(null);

  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const [closeErr, setCloseErr] = useState<string | null>(null);

  const [resendOpen, setResendOpen] = useState(false);
  const [resendChannel, setResendChannel] = useState<"email" | "whatsapp">("email");
  const [resendErr, setResendErr] = useState<string | null>(null);

  const st = props.status.toLowerCase();
  const canAdjust = !props.isClosed && ["draft", "sent", "partially_paid", "overdue"].includes(st);
  const hasLink = Boolean(props.paymentLink?.trim());
  const canResendEmail = hasLink && ["sent", "partially_paid", "overdue"].includes(st);
  const canMarkPaid = !props.isClosed && ["sent", "partially_paid", "overdue"].includes(st);
  const canHardClose = !props.isClosed && ["draft", "sent", "partially_paid", "overdue", "paid"].includes(st);

  const settleAmount = Math.max(0, props.balanceCents);
  const bookingLabel = props.bookingCountToSettle === 1 ? "booking" : "bookings";

  const adjPreviewCents = (() => {
    const raw = adjRand.trim().replace(",", ".");
    const zar = Number(raw);
    if (!Number.isFinite(zar) || zar === 0) return null;
    return { delta: Math.round(zar * 100), next: props.totalAmountCents + Math.round(zar * 100) };
  })();

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setToast(null);
    try {
      await fn();
      setToast({ text: "Done." });
      await props.onDone();
    } catch (e) {
      setToast({ text: e instanceof Error ? e.message : "Action failed.", error: true });
    } finally {
      setBusy(null);
    }
  }

  async function copyLink() {
    const url = props.paymentLink?.trim();
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setToast({ text: "Payment link copied." });
  }

  async function resendSubmit() {
    if (actionLock.current) return;
    actionLock.current = true;
    setResendErr(null);
    setBusy("resend");
    const idempotencyKey = crypto.randomUUID();
    try {
      const res = await authFetch(
        props.getAccessToken,
        `/api/admin/invoices/${encodeURIComponent(props.invoiceId)}/resend-email`,
        {
          method: "POST",
          body: JSON.stringify({ channel: resendChannel }),
          headers: { "Idempotency-Key": idempotencyKey },
        },
      );
      if (!res.ok) {
        setResendErr(await readJsonError(res));
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { channel?: string };
      const ch = String(data.channel ?? "email").toLowerCase();
      setToast({ text: ch === "whatsapp" ? "Invoice sent via WhatsApp." : "Invoice email sent." });
      setResendOpen(false);
      await props.onDone();
    } catch (e) {
      setResendErr(e instanceof Error ? e.message : "Resend failed.");
    } finally {
      setBusy(null);
      actionLock.current = false;
    }
  }

  async function markPaidSubmit() {
    if (actionLock.current) return;
    actionLock.current = true;
    setPaidErr(null);
    if (paidConfirmText.trim() !== "PAID") {
      setPaidErr("typed_confirm_invalid — type PAID exactly (all caps).");
      actionLock.current = false;
      return;
    }
    setBusy("mark_paid");
    const idempotencyKey = crypto.randomUUID();
    try {
      const res = await authFetch(
        props.getAccessToken,
        `/api/admin/invoices/${encodeURIComponent(props.invoiceId)}/mark-paid`,
        {
          method: "POST",
          body: JSON.stringify({ typedConfirm: paidConfirmText.trim(), note: paidNote.trim() || undefined }),
          headers: { "Idempotency-Key": idempotencyKey },
        },
      );
      if (!res.ok) {
        setPaidErr(await readJsonError(res));
        return;
      }
      setToast({ text: "Invoice marked paid." });
      setConfirmPaidOpen(false);
      setPaidConfirmText("");
      setPaidNote("");
      await props.onDone();
    } catch (e) {
      setPaidErr(e instanceof Error ? e.message : "Could not mark paid.");
    } finally {
      setBusy(null);
      actionLock.current = false;
    }
  }

  async function hardCloseSubmit() {
    if (actionLock.current) return;
    actionLock.current = true;
    setCloseErr(null);
    setBusy("hard_close");
    const idempotencyKey = crypto.randomUUID();
    try {
      const res = await authFetch(props.getAccessToken, `/api/admin/invoices/${encodeURIComponent(props.invoiceId)}/hard-close`, {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
      });
      if (!res.ok) {
        setCloseErr(await readJsonError(res));
        return;
      }
      setToast({ text: "Month hard-closed." });
      setConfirmCloseOpen(false);
      await props.onDone();
    } catch (e) {
      setCloseErr(e instanceof Error ? e.message : "Hard close failed.");
    } finally {
      setBusy(null);
      actionLock.current = false;
    }
  }

  async function submitAdjustment() {
    if (actionLock.current) return;
    actionLock.current = true;
    setAdjErr(null);
    const raw = adjRand.trim().replace(",", ".");
    const zar = Number(raw);
    if (!Number.isFinite(zar) || zar === 0) {
      setAdjErr("Enter a non-zero amount in RAND (e.g. 150 or -75.50).");
      actionLock.current = false;
      return;
    }
    const amountCents = Math.round(zar * 100);
    const reason = adjReason.trim();
    if (!reason) {
      setAdjErr("Reason is required.");
      actionLock.current = false;
      return;
    }

    setBusy("adjustment");
    const idempotencyKey = crypto.randomUUID();
    try {
      const res = await authFetch(
        props.getAccessToken,
        `/api/admin/invoices/${encodeURIComponent(props.invoiceId)}/adjustments`,
        {
          method: "POST",
          body: JSON.stringify({ amountCents, reason, category: adjCategory }),
          headers: { "Idempotency-Key": idempotencyKey },
        },
      );
      if (!res.ok) {
        setAdjErr(await readJsonError(res));
        return;
      }
      setToast({ text: "Adjustment saved." });
      setAdjOpen(false);
      setAdjRand("");
      setAdjReason("");
      setAdjCategory("other");
      await props.onDone();
    } catch (e) {
      setAdjErr(e instanceof Error ? e.message : "Adjustment failed.");
    } finally {
      setBusy(null);
      actionLock.current = false;
    }
  }

  const resendDisabledReason = !hasLink
    ? "No payment link on file. Initialize Paystack for this invoice first."
    : !["sent", "partially_paid", "overdue"].includes(st)
      ? "Resend is only available for sent / partially paid / overdue invoices."
      : null;

  const addAdjustmentTitle = props.isClosed
    ? "Invoice is closed; add to next month"
    : !canAdjust
      ? "Adjustments are not available for this invoice status."
      : undefined;

  return (
    <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
      <span title={addAdjustmentTitle}>
        <Button type="button" variant="outline" size="sm" disabled={!canAdjust || busy !== null} onClick={() => setAdjOpen(true)}>
          Add adjustment
        </Button>
      </span>
      <span title={resendDisabledReason ?? undefined}>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={!canResendEmail || busy !== null}
          onClick={() => {
            setResendErr(null);
            setResendChannel("email");
            setResendOpen(true);
          }}
        >
          Resend invoice
        </Button>
      </span>
      <Button type="button" variant="outline" size="sm" disabled={!hasLink || busy !== null} onClick={() => void copyLink()}>
        Copy payment link
      </Button>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        disabled={!canMarkPaid || busy !== null}
        onClick={() => {
          setPaidErr(null);
          setPaidConfirmText("");
          setPaidNote("");
          setConfirmPaidOpen(true);
        }}
      >
        Mark paid
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!canHardClose || busy !== null}
        onClick={() => {
          setCloseErr(null);
          setConfirmCloseOpen(true);
        }}
      >
        Hard close
      </Button>
      {busy ? <span className="self-center text-xs text-zinc-500">{busy}…</span> : null}
      {toast ? (
        <span
          className={`self-center text-xs ${toast.error ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-300"}`}
        >
          {toast.text}
        </span>
      ) : null}

      <Dialog
        open={adjOpen}
        onOpenChange={(open) => {
          setAdjOpen(open);
          if (!open) {
            setAdjRand("");
            setAdjReason("");
            setAdjErr(null);
            setAdjCategory("other");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add adjustment</DialogTitle>
            <DialogDescription>
              Amount in South African Rand (ZAR). Use negative values for credits. Post-send adjustments update the open invoice
              immediately when allowed.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="flex flex-wrap gap-2">
              {ADJ_PRESETS.map((p) => (
                <Button
                  key={p.label}
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={busy !== null}
                  onClick={() => {
                    setAdjCategory(p.category);
                    setAdjReason((prev) => {
                      const t = prev.trim();
                      if (!t) return p.label;
                      if (t.includes(p.label)) return t;
                      return `${t}; ${p.label}`;
                    });
                  }}
                >
                  {p.label}
                </Button>
              ))}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="adj-cat">Category</Label>
              <select
                id="adj-cat"
                disabled={busy !== null}
                className="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 py-1 text-sm shadow-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                value={adjCategory}
                onChange={(e) => setAdjCategory(parseAdjustmentCategory(e.target.value))}
              >
                {(["missed_visit", "extra_service", "discount", "other"] as const).map((c) => (
                  <option key={c} value={c}>
                    {adjustmentCategoryLabel(c)}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="adj-zar">Amount (ZAR)</Label>
              <Input
                id="adj-zar"
                inputMode="decimal"
                placeholder="e.g. 150 or -75.50"
                value={adjRand}
                disabled={busy !== null}
                onChange={(e) => setAdjRand(e.target.value)}
              />
            </div>
            {adjPreviewCents ? (
              <p className="text-sm text-zinc-700 dark:text-zinc-200">
                New invoice total:{" "}
                <span className="font-medium tabular-nums">{formatCurrency(props.totalAmountCents, props.currencyCode)}</span>
                <span className="text-zinc-400"> → </span>
                <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                  {formatCurrency(adjPreviewCents.next, props.currencyCode)}
                </span>
                <span
                  className={`ml-2 font-medium tabular-nums ${
                    adjPreviewCents.delta >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"
                  }`}
                >
                  ({adjPreviewCents.delta >= 0 ? "+" : "−"}
                  {formatCurrency(Math.abs(adjPreviewCents.delta), props.currencyCode)})
                </span>
              </p>
            ) : null}
            <div className="grid gap-1.5">
              <Label htmlFor="adj-reason">Reason</Label>
              <Textarea id="adj-reason" rows={3} value={adjReason} disabled={busy !== null} onChange={(e) => setAdjReason(e.target.value)} />
            </div>
            {adjErr ? <p className="text-sm text-red-600 dark:text-red-400">{adjErr}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAdjOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={busy !== null} onClick={() => void submitAdjustment()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmPaidOpen} onOpenChange={setConfirmPaidOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark invoice paid?</DialogTitle>
            <DialogDescription>
              This records full settlement without Paystack: marks the invoice paid, settles linked bookings, and freezes payout lines.
              Only use after you have verified the money (e.g. EFT).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 rounded-lg border border-red-200 bg-red-50/80 p-3 text-sm text-red-950 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-100">
            <p>
              <span className="font-semibold">This will settle </span>
              <span className="tabular-nums font-bold">{formatCurrency(settleAmount, props.currencyCode)}</span>
              <span className="font-semibold"> and mark </span>
              <span className="font-bold">{props.bookingCountToSettle}</span>
              <span className="font-semibold"> {bookingLabel} eligible for payout.</span>
            </p>
            <p className="text-xs opacity-90">
              Current balance due: <span className="tabular-nums font-medium">{formatCurrency(props.balanceCents, props.currencyCode)}</span>
              {" · "}
              Total: <span className="tabular-nums">{formatCurrency(props.totalAmountCents, props.currencyCode)}</span>
              {" · "}
              Already paid: <span className="tabular-nums">{formatCurrency(props.amountPaidCents, props.currencyCode)}</span>
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="paid-confirm">Type PAID to confirm</Label>
            <Input
              id="paid-confirm"
              autoComplete="off"
              placeholder="PAID"
              value={paidConfirmText}
              disabled={busy !== null}
              onChange={(e) => setPaidConfirmText(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="paid-note">Note (optional, stored on timeline)</Label>
            <Textarea
              id="paid-note"
              rows={2}
              placeholder="e.g. EFT ref ABC123"
              value={paidNote}
              disabled={busy !== null}
              onChange={(e) => setPaidNote(e.target.value)}
            />
          </div>
          {paidErr ? <p className="text-sm text-red-600 dark:text-red-400">{paidErr}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmPaidOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" disabled={busy !== null} onClick={() => void markPaidSubmit()}>
              Confirm mark paid
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmCloseOpen} onOpenChange={setConfirmCloseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hard-close this month?</DialogTitle>
            <DialogDescription>
              No further invoice adjustments will be allowed for this customer and billing month. Corrections must go to a future month.
            </DialogDescription>
          </DialogHeader>
          {closeErr ? <p className="text-sm text-red-600 dark:text-red-400">{closeErr}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmCloseOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="secondary" disabled={busy !== null} onClick={() => void hardCloseSubmit()}>
              Hard close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resendOpen} onOpenChange={setResendOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send invoice again</DialogTitle>
            <DialogDescription>Choose a channel. WhatsApp uses Meta Cloud API (plain text) to the phone on the customer account.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Last invoice email sent: {props.sentAt ? formatDate(props.sentAt) : "—"}
            </p>
            <div className="flex flex-col gap-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="resend-ch"
                  disabled={busy !== null}
                  checked={resendChannel === "email"}
                  onChange={() => setResendChannel("email")}
                />
                Email (Resend)
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="resend-ch"
                  disabled={busy !== null}
                  checked={resendChannel === "whatsapp"}
                  onChange={() => setResendChannel("whatsapp")}
                />
                WhatsApp (Meta Cloud API)
              </label>
            </div>
            {resendErr ? <p className="text-sm text-red-600 dark:text-red-400">{resendErr}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setResendOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={busy !== null} onClick={() => void resendSubmit()}>
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
