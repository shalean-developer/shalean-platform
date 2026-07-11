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
import { formatCurrency, formatDate, parseZarInput } from "@/lib/admin/invoices/invoiceAdminFormatters";
import {
  formatInvoiceBookingOptionLabel,
  type InvoiceBookingOption,
} from "@/lib/admin/invoices/invoiceBookingSelectOptions";
import {
  adjustmentCategoryLabel,
  INVOICE_ADJUSTMENT_CATEGORIES,
  parseAdjustmentCategory,
  type AdjustmentCategory,
} from "@/lib/monthlyInvoice/adjustmentCategory";

const ADJ_PRESETS: { label: string; category: AdjustmentCategory }[] = [
  { label: "Missed visit", category: "missed_visit" },
  { label: "Extra service", category: "extra_service" },
  { label: "Cleaning detergents", category: "cleaning_detergents" },
  { label: "Discount", category: "discount" },
];

export type InvoiceHeaderActionsProps = {
  invoiceId: string;
  status: string;
  isClosed: boolean;
  paymentLink: string | null;
  paystackReference: string | null;
  sentAt: string | null;
  hasInvoicePdf: boolean;
  currencyCode: string;
  totalAmountCents: number;
  amountPaidCents: number;
  balanceCents: number;
  bookingCountToSettle: number;
  /** Payment due date YYYY-MM-DD */
  dueDate?: string | null;
  /** Document/billing date YYYY-MM-DD (defaults to 1st of month when unset) */
  invoiceDate?: string | null;
  /** Billing month YYYY-MM — used to default invoice date */
  billingMonth?: string | null;
  refundedAt?: string | null;
  refundReference?: string | null;
  invoiceBookings?: InvoiceBookingOption[];
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
  const [adjBookingId, setAdjBookingId] = useState("");
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

  const [refundOpen, setRefundOpen] = useState(false);
  const [refundNote, setRefundNote] = useState("");
  const [refundRecordOnly, setRefundRecordOnly] = useState(false);
  const [refundReference, setRefundReference] = useState("");
  const [refundErr, setRefundErr] = useState<string | null>(null);

  const [syncOpen, setSyncOpen] = useState(false);
  const [syncReference, setSyncReference] = useState("");
  const [syncErr, setSyncErr] = useState<string | null>(null);

  const [confirmSendOpen, setConfirmSendOpen] = useState(false);
  const [sendErr, setSendErr] = useState<string | null>(null);

  const [datesOpen, setDatesOpen] = useState(false);
  const [editInvoiceDate, setEditInvoiceDate] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [datesErr, setDatesErr] = useState<string | null>(null);

  const st = props.status.toLowerCase();
  const canAdjust = !props.isClosed && ["draft", "sent", "partially_paid", "overdue"].includes(st);
  const canEditDates = !props.isClosed;
  const hasLink = Boolean(props.paymentLink?.trim());
  const canResendEmail = hasLink && ["sent", "partially_paid", "overdue"].includes(st);
  const canMarkPaid = !props.isClosed && ["sent", "partially_paid", "overdue"].includes(st);
  const canSyncPayment =
    !props.isClosed && ["sent", "partially_paid", "overdue"].includes(st) && Boolean(props.paystackReference?.trim());
  const canRefund = !props.isClosed && st === "paid";
  const canHardClose = !props.isClosed && ["draft", "sent", "partially_paid", "overdue", "paid"].includes(st);
  const canSendInvoice = !props.isClosed && st === "draft";

  const defaultInvoiceDate =
    (props.invoiceDate && /^\d{4}-\d{2}-\d{2}$/.test(props.invoiceDate) ? props.invoiceDate : null) ??
    (props.billingMonth && /^\d{4}-\d{2}$/.test(props.billingMonth) ? `${props.billingMonth}-01` : "");
  const defaultDueDate =
    props.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(props.dueDate) ? props.dueDate : defaultInvoiceDate;

  const settleAmount = Math.max(0, props.balanceCents);
  const bookingLabel = props.bookingCountToSettle === 1 ? "booking" : "bookings";
  const invoicePdfHref = `/api/admin/invoices/${encodeURIComponent(props.invoiceId)}/pdf`;

  const pdfAttachmentNote = props.hasInvoicePdf ? (
    <p className="text-xs">
      <span className="font-semibold">PDF attachment:</span> ready —{" "}
      <a href={invoicePdfHref} target="_blank" rel="noopener noreferrer" className="font-medium underline">
        preview Download PDF
      </a>{" "}
      to confirm line items before sending.
    </p>
  ) : (
    <p className="text-xs">
      <span className="font-semibold">PDF attachment:</span> not synced yet. Use{" "}
      <span className="font-medium">Refresh Zoho PDF</span>, then preview with{" "}
      <span className="font-medium">Download PDF</span> before you send.
    </p>
  );

  const adjPreviewCents = (() => {
    const zar = parseZarInput(adjRand);
    if (zar === null) return null;
    return { delta: Math.round(zar * 100), next: props.totalAmountCents + Math.round(zar * 100) };
  })();

  async function copyLink() {
    const url = props.paymentLink?.trim();
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setToast({ text: "Payment link copied." });
  }

  async function sendInvoiceSubmit() {
    if (actionLock.current) return;
    actionLock.current = true;
    setSendErr(null);
    setBusy("send");
    const idempotencyKey = crypto.randomUUID();
    try {
      const res = await authFetch(
        props.getAccessToken,
        `/api/admin/invoices/${encodeURIComponent(props.invoiceId)}/send`,
        {
          method: "POST",
          body: JSON.stringify({ forceEarlySend: true }),
          headers: { "Idempotency-Key": idempotencyKey },
        },
      );
      if (!res.ok) {
        setSendErr(await readJsonError(res));
        return;
      }
      setToast({ text: "Invoice sent to customer by email." });
      setConfirmSendOpen(false);
      await props.onDone();
    } catch (e) {
      setSendErr(e instanceof Error ? e.message : "Send failed.");
    } finally {
      setBusy(null);
      actionLock.current = false;
    }
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

  async function syncPaymentSubmit(referenceInput: string) {
    if (actionLock.current) return;
    actionLock.current = true;
    setSyncErr(null);
    setBusy("sync_payment");
    setToast(null);
    const idempotencyKey = crypto.randomUUID();
    try {
      const ref = referenceInput.trim();
      const res = await authFetch(
        props.getAccessToken,
        `/api/admin/invoices/${encodeURIComponent(props.invoiceId)}/sync-payment`,
        {
          method: "POST",
          body: JSON.stringify(ref ? { reference: ref } : {}),
          headers: { "Idempotency-Key": idempotencyKey },
        },
      );
      if (!res.ok) {
        setSyncErr(await readJsonError(res));
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { settled?: string; reference?: string };
      const settled = String(data.settled ?? "full");
      setToast({
        text:
          settled === "already_paid" || settled === "duplicate_charge"
            ? "Invoice was already recorded as paid."
            : settled === "partial"
              ? "Partial payment synced from Paystack."
              : `Online payment synced — invoice marked paid${data.reference ? ` (ref ${data.reference})` : ""}.`,
      });
      setSyncOpen(false);
      setSyncReference("");
      await props.onDone();
    } catch (e) {
      setSyncErr(e instanceof Error ? e.message : "Sync failed.");
    } finally {
      setBusy(null);
      actionLock.current = false;
    }
  }

  async function refundSubmit() {
    if (actionLock.current) return;
    actionLock.current = true;
    setRefundErr(null);
    setBusy("refund");
    try {
      const res = await authFetch(
        props.getAccessToken,
        `/api/admin/invoices/${encodeURIComponent(props.invoiceId)}/refund`,
        {
          method: "POST",
          body: JSON.stringify({
            note: refundNote.trim() || undefined,
            record_only: refundRecordOnly,
            refund_reference: refundReference.trim() || undefined,
          }),
        },
      );
      if (!res.ok) {
        setRefundErr(await readJsonError(res));
        return;
      }
      const data = (await res.json().catch(() => ({}))) as {
        paystack_refunded?: boolean;
        recorded_only?: boolean;
        payout_eligible_bookings?: number;
      };
      let text = "Refund recorded.";
      if (data.recorded_only) text = "Refund recorded in Shalean (Paystack dashboard refund).";
      else if (data.paystack_refunded) text = "Payment refunded via Paystack.";
      if ((data.payout_eligible_bookings ?? 0) > 0) {
        text += ` Note: ${data.payout_eligible_bookings} booking(s) had eligible payouts — review cleaner batches.`;
      }
      setToast({ text });
      setRefundOpen(false);
      setRefundNote("");
      setRefundRecordOnly(false);
      setRefundReference("");
      await props.onDone();
    } catch (e) {
      setRefundErr(e instanceof Error ? e.message : "Refund failed.");
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
    const zar = parseZarInput(adjRand);
    if (zar === null) {
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
          body: JSON.stringify({
            amountCents,
            reason,
            category: adjCategory,
            ...(adjBookingId ? { bookingId: adjBookingId } : {}),
          }),
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
      setAdjBookingId("");
      await props.onDone();
    } catch (e) {
      setAdjErr(e instanceof Error ? e.message : "Adjustment failed.");
    } finally {
      setBusy(null);
      actionLock.current = false;
    }
  }

  async function submitBillingDates() {
    if (actionLock.current) return;
    setDatesErr(null);
    const invoiceDate = editInvoiceDate.trim().slice(0, 10);
    const dueDate = editDueDate.trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate) || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      setDatesErr("Enter valid invoice and due dates (YYYY-MM-DD).");
      return;
    }
    actionLock.current = true;
    setBusy("dates");
    try {
      const res = await authFetch(props.getAccessToken, `/api/admin/invoices/${encodeURIComponent(props.invoiceId)}`, {
        method: "PATCH",
        body: JSON.stringify({ invoiceDate, dueDate }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        zohoSynced?: boolean;
        zohoError?: string;
      };
      if (!res.ok) throw new Error(j.error ?? `Request failed (${res.status})`);
      const zohoNote = j.zohoSynced
        ? " Zoho dates updated."
        : j.zohoError
          ? ` Saved in Shalean; Zoho update failed (${j.zohoError}).`
          : "";
      setToast({ text: `Billing dates updated.${zohoNote}` });
      setDatesOpen(false);
      await props.onDone();
    } catch (e) {
      setDatesErr(e instanceof Error ? e.message : "Failed to update dates.");
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
    <div className="grid w-full min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap lg:justify-end">
      <span title={addAdjustmentTitle} className="w-full sm:contents">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full justify-center sm:w-auto"
          disabled={!canAdjust || busy !== null}
          onClick={() => setAdjOpen(true)}
        >
          Add adjustment
        </Button>
      </span>
      {canEditDates ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full justify-center sm:w-auto"
          disabled={busy !== null}
          onClick={() => {
            setDatesErr(null);
            setEditInvoiceDate(defaultInvoiceDate);
            setEditDueDate(defaultDueDate);
            setDatesOpen(true);
          }}
        >
          Edit billing dates
        </Button>
      ) : null}
      {canSendInvoice ? (
        <Button
          type="button"
          variant="default"
          size="sm"
          className="w-full justify-center sm:w-auto"
          disabled={busy !== null}
          onClick={() => {
            setSendErr(null);
            setConfirmSendOpen(true);
          }}
        >
          Send invoice
        </Button>
      ) : null}
      <span title={resendDisabledReason ?? undefined} className="w-full sm:contents">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="w-full justify-center sm:w-auto"
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
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full justify-center sm:w-auto"
        disabled={!hasLink || busy !== null}
        onClick={() => void copyLink()}
      >
        Copy payment link
      </Button>
      {canSyncPayment ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="w-full justify-center sm:w-auto"
          disabled={busy !== null}
          onClick={() => {
            setSyncErr(null);
            setSyncReference(props.paystackReference?.trim() ?? "");
            setSyncOpen(true);
          }}
        >
          Sync Paystack payment
        </Button>
      ) : null}
      <Button
        type="button"
        variant="destructive"
        size="sm"
        className="w-full justify-center sm:w-auto"
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
      {canRefund ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full justify-center sm:w-auto"
          disabled={busy !== null}
          onClick={() => {
            setRefundErr(null);
            setRefundNote("");
            setRefundRecordOnly(false);
            setRefundReference("");
            setRefundOpen(true);
          }}
        >
          Refund
        </Button>
      ) : null}
      {props.refundedAt ? (
        <span className="col-span-full text-xs text-red-700 dark:text-red-300">
          Refunded {formatDate(props.refundedAt)}
          {props.refundReference ? ` · ${props.refundReference}` : ""}
        </span>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full justify-center sm:w-auto"
        disabled={!canHardClose || busy !== null}
        onClick={() => {
          setCloseErr(null);
          setConfirmCloseOpen(true);
        }}
      >
        Hard close
      </Button>
      {busy ? <span className="col-span-full text-xs text-zinc-500">{busy}…</span> : null}
      {toast ? (
        <span
          className={`col-span-full text-xs ${toast.error ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-300"}`}
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
            setAdjBookingId("");
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
                {INVOICE_ADJUSTMENT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {adjustmentCategoryLabel(c)}
                  </option>
                ))}
              </select>
            </div>
            {props.invoiceBookings && props.invoiceBookings.length > 0 ? (
              <div className="grid gap-1.5">
                <Label htmlFor="adj-booking">Applies to (optional)</Label>
                <select
                  id="adj-booking"
                  disabled={busy !== null}
                  className="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 py-1 text-sm shadow-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  value={adjBookingId}
                  onChange={(e) => setAdjBookingId(e.target.value)}
                >
                  <option value="">Whole invoice</option>
                  {props.invoiceBookings.map((b) => (
                    <option key={b.id} value={b.id}>
                      {formatInvoiceBookingOptionLabel(b, props.currencyCode)}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="grid gap-1.5">
              <Label htmlFor="adj-zar">Amount (ZAR)</Label>
              <Input
                id="adj-zar"
                inputMode="decimal"
                placeholder="e.g. 150, -75.50, or -1 170.00"
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

      <Dialog
        open={datesOpen}
        onOpenChange={(open) => {
          setDatesOpen(open);
          if (!open) setDatesErr(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit billing dates</DialogTitle>
            <DialogDescription>
              Change the invoice document date (shown in Zoho) and the payment due date. For example, if the customer
              pays on the 10th, set both dates to the 10th of the billing month.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-1">
            <div className="grid gap-1.5">
              <Label htmlFor="invoice-date">Invoice / billing date</Label>
              <Input
                id="invoice-date"
                type="date"
                value={editInvoiceDate}
                disabled={busy !== null}
                onChange={(e) => setEditInvoiceDate(e.target.value)}
              />
              <p className="text-xs text-zinc-500">Document date on the invoice (defaults to the 1st of the month).</p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="due-date">Due date</Label>
              <Input
                id="due-date"
                type="date"
                value={editDueDate}
                disabled={busy !== null}
                onChange={(e) => setEditDueDate(e.target.value)}
              />
              <p className="text-xs text-zinc-500">When payment is expected. Overdue flags use this date.</p>
            </div>
            {datesErr ? <p className="text-sm text-red-600 dark:text-red-400">{datesErr}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDatesOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={busy !== null} onClick={() => void submitBillingDates()}>
              {busy === "dates" ? "Saving…" : "Save dates"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmSendOpen} onOpenChange={setConfirmSendOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send invoice to customer?</DialogTitle>
            <DialogDescription>
              This finalizes the draft, creates a Paystack payment link, marks the invoice as sent, and emails the customer.
              You can send before the last visit in the month if needed.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 rounded-lg border border-blue-200 bg-blue-50/80 p-3 text-sm text-blue-950 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-100">
            <p>
              <span className="font-semibold">Amount due: </span>
              <span className="tabular-nums font-bold">{formatCurrency(props.balanceCents, props.currencyCode)}</span>
            </p>
            <p className="text-xs opacity-90">
              After sending, line items are frozen and further booking edits on this invoice are restricted. Use{" "}
              <span className="font-medium">Resend invoice</span> if the customer needs the email again.
            </p>
            {pdfAttachmentNote}
          </div>
          {sendErr ? <p className="text-sm text-red-600 dark:text-red-400">{sendErr}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmSendOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={busy !== null} onClick={() => void sendInvoiceSubmit()}>
              Send email
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

      <Dialog open={syncOpen} onOpenChange={(open) => !busy && setSyncOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sync payment from Paystack</DialogTitle>
            <DialogDescription>
              Looks up a successful charge on Paystack and marks this invoice paid. Leave the reference blank to
              auto-detect (stored ref, metadata, recent transactions). If you see &quot;Transaction reference not
              found&quot;, paste the reference from Paystack → Transactions.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="sync-reference">Paystack reference (optional)</Label>
            <Input
              id="sync-reference"
              placeholder={props.paystackReference?.trim() ?? "e.g. mi_inv_… or Paystack ref"}
              value={syncReference}
              disabled={busy !== null}
              onChange={(e) => setSyncReference(e.target.value)}
            />
            {props.paystackReference?.trim() ? (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Stored on invoice: <span className="font-mono">{props.paystackReference.trim()}</span>
              </p>
            ) : null}
          </div>
          {syncErr ? <p className="text-sm text-red-600 dark:text-red-400">{syncErr}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSyncOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={busy !== null} onClick={() => void syncPaymentSubmit(syncReference)}>
              Sync payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={refundOpen} onOpenChange={setRefundOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refund this invoice?</DialogTitle>
            <DialogDescription>
              {refundRecordOnly
                ? "Records the refund in Shalean only — use when you already refunded on the Paystack dashboard."
                : "Issues a Paystack refund when a charge reference exists, then marks the invoice refunded and reopens linked bookings for billing."}
            </DialogDescription>
          </DialogHeader>
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={refundRecordOnly}
              disabled={busy !== null}
              onChange={(e) => setRefundRecordOnly(e.target.checked)}
              className="mt-1"
            />
            <span>
              <span className="font-medium">Already refunded on Paystack dashboard</span>
              <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">
                Skips the Paystack API and only updates Shalean.
              </span>
            </span>
          </label>
          <div className="grid gap-1.5">
            <Label htmlFor="refund-reference">Paystack refund reference (optional)</Label>
            <Input
              id="refund-reference"
              placeholder="From Paystack dashboard"
              value={refundReference}
              disabled={busy !== null}
              onChange={(e) => setRefundReference(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="refund-note">Note (optional)</Label>
            <Textarea
              id="refund-note"
              rows={2}
              value={refundNote}
              disabled={busy !== null}
              onChange={(e) => setRefundNote(e.target.value)}
            />
          </div>
          {refundErr ? <p className="text-sm text-red-600 dark:text-red-400">{refundErr}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRefundOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" disabled={busy !== null} onClick={() => void refundSubmit()}>
              {refundRecordOnly ? "Record refund in Shalean" : "Confirm refund"}
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
              {resendChannel === "email" ? (
                <div className="ml-6 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-300">
                  {props.hasInvoicePdf ? (
                    <>
                      PDF will be attached.{" "}
                      <a href={invoicePdfHref} target="_blank" rel="noopener noreferrer" className="font-medium underline">
                        Preview PDF
                      </a>
                    </>
                  ) : (
                    <>No Zoho PDF on file — email will send without a PDF attachment.</>
                  )}
                </div>
              ) : null}
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
