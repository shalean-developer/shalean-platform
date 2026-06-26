"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { adminFetch } from "@/hooks/useAdminData";
import { SalesDocumentQuoteEditor } from "@/components/admin/sales-documents/SalesDocumentQuoteEditor";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trustDocPageUrl } from "@/lib/pay/trustPayPageUrl";
import type { SalesDocumentQuoteRequestDetails } from "@/lib/salesDocument/types";

type DocDetail = {
  id: string;
  document_type: string;
  status: string;
  source?: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  line_items: Array<{ description: string; quantity: number; unit_price_cents: number }>;
  total_cents: number;
  balance_cents: number;
  due_date: string | null;
  notes: string | null;
  request_details: SalesDocumentQuoteRequestDetails | null;
  public_token: string;
  paystack_reference: string | null;
  refund_reference: string | null;
  refunded_at: string | null;
  converted_from_id: string | null;
  sent_at: string | null;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  view_count: number;
};

const SERVICE_LABELS: Record<string, string> = {
  standard: "Standard cleaning",
  deep: "Deep cleaning",
  move_in_out: "Move in / move out",
  office: "Office cleaning",
  airbnb: "Airbnb / short-stay",
  other: "Other / custom",
};

const PROPERTY_LABELS: Record<string, string> = {
  apartment: "Apartment / flat",
  house: "House",
  office: "Office / commercial",
};

function formatZar(cents: number) {
  return `R ${(cents / 100).toLocaleString("en-ZA")}`;
}

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return null;
  return new Date(iso).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" });
}

export default function OfficeSalesDocumentDetailPage() {
  const params = useParams();
  const id = typeof params?.id === "string" ? params.id : "";
  const [doc, setDoc] = useState<DocDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<"success" | "error">("success");
  const [busy, setBusy] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundNote, setRefundNote] = useState("");
  const [refundRecordOnly, setRefundRecordOnly] = useState(false);
  const [refundReference, setRefundReference] = useState("");
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const [reconcileReference, setReconcileReference] = useState("");
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!id || !mountedRef.current) return;
    setLoading(true);
    try {
      const res = await adminFetch<{ document: DocDetail }>(`/api/admin/sales-documents/${id}`);
      if (!mountedRef.current) return;
      if (!res.ok || !res.data?.document) {
        setDoc(null);
        return;
      }
      setDoc(res.data.document);
    } catch {
      if (!mountedRef.current) return;
      setDoc(null);
    }
    if (mountedRef.current) setLoading(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runReconcilePayment(referenceInput: string) {
    setBusy(true);
    setMessage(null);
    try {
      const body: { reference?: string } = {};
      const ref = referenceInput.trim();
      if (ref) body.reference = ref;
      const res = await adminFetch<{ ok: boolean; already_paid?: boolean; reference?: string }>(
        `/api/admin/sales-documents/${id}/reconcile-payment`,
        { method: "POST", body: JSON.stringify(body) },
      );
      if (!res.ok) throw new Error(res.error ?? "Could not reconcile payment.");
      setMessageKind("success");
      setMessage(
        res.data?.already_paid
          ? "Invoice was already marked paid."
          : `Payment reconciled — invoice marked paid${res.data?.reference ? ` (ref ${res.data.reference})` : ""}.`,
      );
      setReconcileOpen(false);
      setReconcileReference("");
      await load();
    } catch (err) {
      setMessageKind("error");
      setMessage(err instanceof Error ? err.message : "Could not reconcile payment.");
    }
    setBusy(false);
  }

  async function runRefund(opts: {
    noteInput: string;
    recordOnly: boolean;
    refundReferenceInput: string;
  }) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await adminFetch<{
        ok: boolean;
        paystack_refunded?: boolean;
        recorded_only?: boolean;
        already_reversed_on_paystack?: boolean;
        refund_reference?: string | null;
      }>(`/api/admin/sales-documents/${id}/refund`, {
        method: "POST",
        body: JSON.stringify({
          note: opts.noteInput.trim() || undefined,
          record_only: opts.recordOnly,
          refund_reference: opts.refundReferenceInput.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error(res.error ?? "Refund failed.");
      setMessageKind("success");
      if (res.data?.recorded_only) {
        setMessage("Refund recorded in Shalean (Paystack dashboard refund).");
      } else if (res.data?.already_reversed_on_paystack) {
        setMessage("Invoice marked refunded — payment was already reversed on Paystack.");
      } else if (res.data?.paystack_refunded) {
        setMessage("Payment refunded via Paystack.");
      } else {
        setMessage("Refund recorded (no Paystack charge to reverse).");
      }
      setRefundOpen(false);
      setRefundNote("");
      setRefundRecordOnly(false);
      setRefundReference("");
      await load();
    } catch (err) {
      setMessageKind("error");
      setMessage(err instanceof Error ? err.message : "Refund failed.");
    }
    setBusy(false);
  }

  async function runAction(path: string, successLabel: string) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await adminFetch(path, { method: "POST", body: JSON.stringify({}) });
      if (!res.ok) throw new Error(res.error ?? "Action failed.");
      setMessageKind("success");
      setMessage(successLabel);
      await load();
    } catch (err) {
      setMessageKind("error");
      setMessage(err instanceof Error ? err.message : "Action failed.");
    }
    setBusy(false);
  }

  if (loading) return <div className="p-6 text-slate-500">Loading…</div>;
  if (!doc) return <div className="p-6 text-red-600">Document not found.</div>;

  const viewUrl = trustDocPageUrl(doc.id, doc.public_token);
  const rd = doc.request_details;
  const canSend =
    doc.status !== "paid" &&
    doc.status !== "refunded" &&
    doc.status !== "void" &&
    doc.status !== "requested" &&
    doc.total_cents > 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <Link href="/office/sales-documents" className="text-sm text-blue-600 hover:underline">← All quotes</Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 capitalize">
            {doc.document_type} · {doc.id.slice(0, 8).toUpperCase()}
          </h1>
          <p className="text-sm text-slate-500">{doc.customer_name} · {doc.customer_email}</p>
          {doc.customer_phone ? <p className="text-sm text-slate-500">{doc.customer_phone}</p> : null}
          <p className="mt-1 text-sm capitalize text-slate-600">
            Status: {doc.status === "requested" ? "New request" : doc.status}
            {doc.source === "customer_request" ? " · Website form" : ""}
          </p>
          {doc.refunded_at ? (
            <p className="mt-1 text-sm text-red-700">
              Refunded {formatDateTime(doc.refunded_at)}
              {doc.refund_reference ? ` · Ref ${doc.refund_reference}` : ""}
            </p>
          ) : null}
        </div>
        <p className="text-lg font-bold tabular-nums text-slate-900">
          {doc.status === "requested" ? "Pricing needed" : formatZar(doc.total_cents)}
        </p>
      </div>

      {doc.sent_at || doc.view_count > 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Customer link activity</h2>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            {doc.sent_at ? (
              <div>
                <dt className="text-xs text-slate-500">Sent to customer</dt>
                <dd className="font-medium">{formatDateTime(doc.sent_at)}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-xs text-slate-500">Times opened</dt>
              <dd className="font-medium tabular-nums">{doc.view_count}</dd>
            </div>
            {doc.first_viewed_at ? (
              <div>
                <dt className="text-xs text-slate-500">First opened</dt>
                <dd className="font-medium">{formatDateTime(doc.first_viewed_at)}</dd>
              </div>
            ) : doc.sent_at ? (
              <div>
                <dt className="text-xs text-slate-500">First opened</dt>
                <dd className="font-medium text-slate-400">Not yet</dd>
              </div>
            ) : null}
            {doc.last_viewed_at && doc.view_count > 1 ? (
              <div>
                <dt className="text-xs text-slate-500">Last opened</dt>
                <dd className="font-medium">{formatDateTime(doc.last_viewed_at)}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      ) : null}

      {rd ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <h2 className="text-xs font-semibold uppercase text-amber-800">Customer request details</h2>
          {rd.selected_items?.length ? (
            <ul className="mt-3 space-y-1 text-sm text-slate-800">
              {rd.selected_items.map((item, i) => (
                <li key={`${item.slug}-${i}`} className="font-medium">
                  {item.name}
                  {item.quantity > 1 ? ` × ${item.quantity}` : ""}
                </li>
              ))}
            </ul>
          ) : rd.service_type ? (
            <p className="mt-3 text-sm font-medium text-slate-900">
              {SERVICE_LABELS[rd.service_type] ?? rd.service_type}
            </p>
          ) : null}
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Property</dt>
              <dd className="font-medium text-slate-900">{PROPERTY_LABELS[rd.property_type] ?? rd.property_type}</dd>
            </div>
            {rd.bedrooms != null ? (
              <div>
                <dt className="text-slate-500">Bedrooms</dt>
                <dd className="font-medium text-slate-900">{rd.bedrooms}</dd>
              </div>
            ) : null}
            {rd.bathrooms != null ? (
              <div>
                <dt className="text-slate-500">Bathrooms</dt>
                <dd className="font-medium text-slate-900">{rd.bathrooms}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-slate-500">Area</dt>
              <dd className="font-medium text-slate-900">{rd.suburb}</dd>
            </div>
            {rd.preferred_date ? (
              <div>
                <dt className="text-slate-500">Preferred date</dt>
                <dd className="font-medium text-slate-900">{rd.preferred_date}</dd>
              </div>
            ) : null}
          </dl>
          {rd.message ? (
            <p className="mt-3 text-sm text-slate-700">
              <span className="font-medium text-slate-900">Notes: </span>{rd.message}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xs font-semibold uppercase text-slate-500">
          {doc.status === "requested" ? "Add pricing & line items" : "Line items"}
        </h2>
        <SalesDocumentQuoteEditor
          documentId={doc.id}
          status={doc.status}
          initialLines={doc.line_items}
          onSaved={() => void load()}
        />
        {doc.notes && !rd ? <p className="mt-4 text-sm text-slate-600">{doc.notes}</p> : null}
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={busy || !canSend}
          onClick={() => void runAction(
            `/api/admin/sales-documents/${id}/send`,
            doc.document_type === "invoice" ? "Invoice sent to customer." : "Quote sent to customer.",
          )}
          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {doc.document_type === "invoice" ? "Send invoice to customer" : "Send quote to customer"}
        </button>
        {doc.status === "requested" ? (
          <p className="text-sm text-amber-700">Save pricing first, then send the quote.</p>
        ) : null}
        {doc.document_type === "quote" && doc.status !== "requested" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void runAction(`/api/admin/sales-documents/${id}/convert`, "Converted to invoice.")}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            Convert to invoice
          </button>
        ) : null}
        {doc.document_type === "invoice" && doc.status !== "paid" && doc.status !== "refunded" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void runAction(`/api/admin/sales-documents/${id}/mark-paid`, "Marked paid.")}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            Mark paid (manual)
          </button>
        ) : null}
        {doc.document_type === "invoice" && doc.status !== "paid" && doc.status !== "refunded" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setReconcileReference(doc.paystack_reference ?? "");
              setReconcileOpen(true);
            }}
            className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
          >
            Reconcile Paystack payment
          </button>
        ) : null}
        {doc.document_type === "invoice" && doc.status === "paid" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setRefundNote("");
              setRefundRecordOnly(false);
              setRefundReference(doc.paystack_reference ?? "");
              setRefundOpen(true);
            }}
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
          >
            Refund payment
          </button>
        ) : null}
        {doc.status !== "requested" ? (
          <>
            <a
              href={`/api/admin/sales-documents/${id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Download PDF
            </a>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(viewUrl);
                setMessageKind("success");
                setMessage("Customer link copied.");
              }}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Copy customer link
            </button>
          </>
        ) : null}
      </div>

      {message ? (
        <p className={messageKind === "error" ? "text-sm text-red-700" : "text-sm text-emerald-700"}>{message}</p>
      ) : null}

      <Dialog
        open={refundOpen}
        onOpenChange={(open) => {
          if (!busy) {
            setRefundOpen(open);
            if (!open) {
              setRefundRecordOnly(false);
              setRefundReference("");
            }
          }
        }}
      >
        <DialogContent className="max-w-md rounded-2xl border-slate-200">
          <DialogHeader>
            <DialogTitle>Refund payment</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            {refundRecordOnly
              ? "Records the refund in Shalean only — use when you already refunded on the Paystack dashboard."
              : "Refunds via Paystack when a charge exists. Manual payments are recorded only."}
          </p>
          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800">
            <input
              type="checkbox"
              checked={refundRecordOnly}
              onChange={(e) => setRefundRecordOnly(e.target.checked)}
              disabled={busy}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">Already refunded on Paystack dashboard</span>
              <span className="mt-0.5 block text-slate-600">
                Only update Shalean — do not call Paystack again.
              </span>
            </span>
          </label>
          <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="refund-reference">
            Paystack reference <span className="font-normal text-slate-500">(optional)</span>
          </label>
          <input
            id="refund-reference"
            type="text"
            value={refundReference}
            onChange={(e) => setRefundReference(e.target.value)}
            disabled={busy}
            placeholder="sd_inv_… or transaction reference"
            className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50"
          />
          <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="refund-note">
            Refund reason <span className="font-normal text-slate-500">(optional)</span>
          </label>
          <textarea
            id="refund-note"
            rows={3}
            value={refundNote}
            onChange={(e) => setRefundNote(e.target.value)}
            disabled={busy}
            placeholder="e.g. Customer cancelled before service"
            className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50"
          />
          <DialogFooter className="gap-2 sm:justify-end">
            <button
              type="button"
              disabled={busy}
              onClick={() => setRefundOpen(false)}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void runRefund({
                  noteInput: refundNote,
                  recordOnly: refundRecordOnly,
                  refundReferenceInput: refundReference,
                })
              }
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {busy
                ? "Saving…"
                : refundRecordOnly
                  ? "Record refund in Shalean"
                  : "Confirm refund"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reconcileOpen} onOpenChange={(open) => !busy && setReconcileOpen(open)}>
        <DialogContent className="max-w-md rounded-2xl border-slate-200">
          <DialogHeader>
            <DialogTitle>Reconcile Paystack payment</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            Leave blank to auto-detect. If reconcile failed before, paste the reference from Paystack →
            Transactions.
          </p>
          <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="reconcile-reference">
            Paystack reference <span className="font-normal text-slate-500">(optional)</span>
          </label>
          <input
            id="reconcile-reference"
            type="text"
            value={reconcileReference}
            onChange={(e) => setReconcileReference(e.target.value)}
            disabled={busy}
            placeholder="sd_inv_…"
            className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50"
          />
          <DialogFooter className="gap-2 sm:justify-end">
            <button
              type="button"
              disabled={busy}
              onClick={() => setReconcileOpen(false)}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void runReconcilePayment(reconcileReference)}
              className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {busy ? "Reconciling…" : "Reconcile payment"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {doc.converted_from_id ? (
        <p className="text-sm text-slate-500">
          Converted from quote{" "}
          <Link href={`/office/sales-documents/${doc.converted_from_id}`} className="text-blue-600 hover:underline">
            {doc.converted_from_id.slice(0, 8).toUpperCase()}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
