"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { adminFetch } from "@/hooks/useAdminData";
import { SalesDocumentQuoteEditor } from "@/components/admin/sales-documents/SalesDocumentQuoteEditor";
import { SalesDocumentDetailsEditor } from "@/components/admin/sales-documents/SalesDocumentDetailsEditor";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trustDocPageUrl } from "@/lib/pay/trustPayPageUrl";
import type { SalesDocumentQuoteRequestDetails } from "@/lib/salesDocument/types";
import { salesDocumentIsDeletable, salesDocumentIsEditableWithoutPayment } from "@/lib/salesDocument/types";
import { formatZohoOrderReference } from "@/lib/zoho/zohoOrderReference";

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
  amount_paid_cents: number;
  due_date: string | null;
  notes: string | null;
  request_details: SalesDocumentQuoteRequestDetails | null;
  public_token: string;
  paystack_reference: string | null;
  refund_reference: string | null;
  refunded_at: string | null;
  converted_from_id: string | null;
  linked_invoice_id?: string | null;
  sent_at: string | null;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  view_count: number;
  zoho_estimate_id?: string | null;
  zoho_estimate_number?: string | null;
  zoho_invoice_id?: string | null;
  zoho_invoice_number?: string | null;
};

type CrmOpportunity = {
  id: string;
  crm_stage: "lead" | "qualified" | "quote" | "follow_up" | "won" | "lost" | null;
  crm_next_follow_up_at: string | null;
  crm_lost_reason: string | null;
  lead_source: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
};

type CrmActivity = { id: string; activity_type: string; body: string | null; created_at: string };

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
  const router = useRouter();
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
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [crm, setCrm] = useState<CrmOpportunity | null>(null);
  const [activities, setActivities] = useState<CrmActivity[]>([]);
  const [crmStage, setCrmStage] = useState("lead");
  const [followUp, setFollowUp] = useState("");
  const [lostReason, setLostReason] = useState("");
  const [activityType, setActivityType] = useState("note");
  const [activityBody, setActivityBody] = useState("");
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
      const [res, crmRes] = await Promise.all([
        adminFetch<{ document: DocDetail }>(`/api/admin/sales-documents/${id}`),
        adminFetch<{ opportunity: CrmOpportunity; activities: CrmActivity[] }>(`/api/admin/sales-documents/${id}/crm`),
      ]);
      if (!mountedRef.current) return;
      if (!res.ok || !res.data?.document) {
        setDoc(null);
        return;
      }
      setDoc(res.data.document);
      if (crmRes.ok && crmRes.data?.opportunity) {
        const opportunity = crmRes.data.opportunity;
        setCrm(opportunity);
        setActivities(crmRes.data.activities ?? []);
        setCrmStage(opportunity.crm_stage ?? "lead");
        setFollowUp(opportunity.crm_next_follow_up_at?.slice(0, 16) ?? "");
        setLostReason(opportunity.crm_lost_reason ?? "");
      }
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

  async function runDelete() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await adminFetch<{ ok?: boolean; error?: string }>(
        `/api/admin/sales-documents/${id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const err = res.error ?? res.data?.error ?? "Delete failed.";
        if (err === "linked_paid_booking") {
          throw new Error("Cannot delete — a paid booking is linked to this invoice.");
        }
        if (err === "not_deletable") {
          throw new Error("Cannot delete — document is paid or locked.");
        }
        throw new Error(err);
      }
      router.push("/office/sales-documents");
    } catch (err) {
      setMessageKind("error");
      setMessage(err instanceof Error ? err.message : "Delete failed.");
      setDeleteOpen(false);
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

  async function saveCrm() {
    setBusy(true);
    setMessage(null);
    const res = await adminFetch(`/api/admin/sales-documents/${id}/crm`, {
      method: "PATCH",
      body: JSON.stringify({ stage: crmStage, next_follow_up_at: followUp || null, lost_reason: lostReason }),
    });
    setMessageKind(res.ok ? "success" : "error");
    setMessage(res.ok ? "Sales opportunity updated." : res.error ?? "Could not update opportunity.");
    if (res.ok) await load();
    setBusy(false);
  }

  async function addActivity() {
    if (!activityBody.trim()) return;
    setBusy(true);
    const res = await adminFetch(`/api/admin/sales-documents/${id}/crm`, {
      method: "POST",
      body: JSON.stringify({ activity_type: activityType, body: activityBody }),
    });
    setMessageKind(res.ok ? "success" : "error");
    setMessage(res.ok ? "Activity added." : res.error ?? "Could not add activity.");
    if (res.ok) {
      setActivityBody("");
      await load();
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
  const canEditLines = salesDocumentIsEditableWithoutPayment({
    document_type: doc.document_type === "invoice" ? "invoice" : "quote",
    status: doc.status,
    amount_paid_cents: doc.amount_paid_cents ?? 0,
  });
  const docTypeLabel = doc.document_type === "invoice" ? "Invoice" : "Quote";
  const canDelete = salesDocumentIsDeletable({
    document_type: doc.document_type === "invoice" ? "invoice" : "quote",
    status: doc.status,
    amount_paid_cents: doc.amount_paid_cents ?? 0,
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <Link href="/office/sales-documents" className="text-sm text-blue-600 hover:underline">← All quotes</Link>

      {canEditLines ? (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <p className="font-semibold">Editing enabled — not yet paid</p>
          <p className="mt-1 text-blue-800">
            Update customer details and line items below. Changes sync to Zoho on save.
            {doc.linked_invoice_id ? (
              <>
                {" "}
                Linked invoice{" "}
                <Link
                  href={`/office/sales-documents/${doc.linked_invoice_id}`}
                  className="font-medium underline hover:text-blue-950"
                >
                  {doc.linked_invoice_id.slice(0, 8).toUpperCase()}
                </Link>{" "}
                is updated automatically when you edit this quote.
              </>
            ) : null}
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {canEditLines ? `Edit ${docTypeLabel.toLowerCase()}` : docTypeLabel}
            {doc.document_type === "quote" && doc.zoho_estimate_number
              ? ` · ${doc.zoho_estimate_number}`
              : doc.document_type === "invoice" && doc.zoho_invoice_number
                ? ` · ${doc.zoho_invoice_number}`
                : ` · ${doc.id.slice(0, 8).toUpperCase()}`}
          </h1>
          {!canEditLines ? (
            <>
              <p className="text-sm text-slate-500">{doc.customer_name} · {doc.customer_email}</p>
              {doc.customer_phone ? <p className="text-sm text-slate-500">{doc.customer_phone}</p> : null}
            </>
          ) : null}
          <p className="mt-1 text-sm text-slate-500">
            Shalean order: {formatZohoOrderReference(doc.id, "sales")}
          </p>
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
        <div className="flex flex-col items-end gap-2">
          <p className="text-lg font-bold tabular-nums text-slate-900">
            {doc.status === "requested" ? "Pricing needed" : formatZar(doc.total_cents)}
          </p>
          {canDelete ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => setDeleteOpen(true)}
              className="text-sm font-semibold text-red-600 hover:underline disabled:opacity-50"
            >
              Delete {docTypeLabel.toLowerCase()}
            </button>
          ) : null}
        </div>
      </div>

      {crm ? (
        <section className="rounded-2xl border border-blue-200 bg-blue-50/50 p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-900">Sales opportunity</h2>
              <p className="text-xs text-slate-500">One timeline across this quote, its invoice and canonical booking.</p>
            </div>
            <p className="text-xs font-medium text-slate-600">Source: {crm.lead_source ?? "unknown"}</p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-slate-600">Stage
              <select value={crmStage} onChange={(event) => setCrmStage(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal">
                <option value="lead">Lead</option><option value="qualified">Qualified</option><option value="quote">Quote</option><option value="follow_up">Follow-up</option><option value="won">Won</option><option value="lost">Lost</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600">Next follow-up
              <input type="datetime-local" value={followUp} onChange={(event) => setFollowUp(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal" />
            </label>
          </div>
          {crmStage === "lost" ? <label className="mt-3 block text-xs font-semibold text-slate-600">Lost reason
            <input value={lostReason} onChange={(event) => setLostReason(event.target.value)} placeholder="Required when marking lost" className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal" />
          </label> : null}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">{[crm.utm_source, crm.utm_medium, crm.utm_campaign].filter(Boolean).join(" · ") || "No campaign parameters captured"}</p>
            <button type="button" disabled={busy} onClick={() => void saveCrm()} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Save opportunity</button>
          </div>
          <div className="mt-5 border-t border-blue-100 pt-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <select value={activityType} onChange={(event) => setActivityType(event.target.value)} aria-label="Activity type" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"><option value="note">Note</option><option value="call">Call</option><option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="follow_up">Follow-up</option></select>
              <input value={activityBody} onChange={(event) => setActivityBody(event.target.value)} placeholder="Record an update…" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" />
              <button type="button" disabled={busy || !activityBody.trim()} onClick={() => void addActivity()} className="rounded-xl border border-blue-300 bg-white px-4 py-2 text-sm font-semibold text-blue-700 disabled:opacity-50">Add</button>
            </div>
            <ol className="mt-4 space-y-2">
              {activities.length ? activities.map((activity) => <li key={activity.id} className="rounded-xl bg-white px-3 py-2 text-sm"><span className="font-semibold capitalize text-slate-700">{activity.activity_type.replace("_", " ")}</span><span className="ml-2 text-xs text-slate-400">{formatDateTime(activity.created_at)}</span><p className="mt-1 text-slate-600">{activity.body}</p></li>) : <li className="text-sm text-slate-500">No activity recorded yet.</li>}
            </ol>
          </div>
        </section>
      ) : null}

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
          {canEditLines ? "Customer details" : "Customer"}
        </h2>
        <SalesDocumentDetailsEditor
          documentId={doc.id}
          documentType={doc.document_type === "invoice" ? "invoice" : "quote"}
          status={doc.status}
          amountPaidCents={doc.amount_paid_cents ?? 0}
          initialName={doc.customer_name}
          initialEmail={doc.customer_email}
          initialPhone={doc.customer_phone}
          initialDueDate={doc.due_date}
          initialNotes={doc.notes}
          onSaved={() => void load()}
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xs font-semibold uppercase text-slate-500">
          {doc.status === "requested"
            ? "Add pricing & line items"
            : canEditLines
              ? "Edit line items"
              : "Line items"}
        </h2>
        <SalesDocumentQuoteEditor
          documentId={doc.id}
          documentType={doc.document_type === "invoice" ? "invoice" : "quote"}
          status={doc.status}
          amountPaidCents={doc.amount_paid_cents ?? 0}
          initialLines={doc.line_items}
          onSaved={() => void load()}
        />
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
        {canDelete ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => setDeleteOpen(true)}
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
          >
            Delete {docTypeLabel.toLowerCase()}
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

      <Dialog open={deleteOpen} onOpenChange={(open) => !busy && setDeleteOpen(open)}>
        <DialogContent className="max-w-md rounded-2xl border-slate-200">
          <DialogHeader>
            <DialogTitle>Delete {docTypeLabel.toLowerCase()}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            Permanently delete {doc.customer_name}&apos;s {docTypeLabel.toLowerCase()} (
            {doc.id.slice(0, 8).toUpperCase()})? This cannot be undone.
          </p>
          {doc.document_type === "quote" && doc.linked_invoice_id ? (
            <p className="mt-2 text-sm text-amber-800">
              The linked unpaid invoice ({doc.linked_invoice_id.slice(0, 8).toUpperCase()}) and any
              unpaid booking created from it will also be removed.
            </p>
          ) : null}
          {doc.document_type === "invoice" ? (
            <p className="mt-2 text-sm text-amber-800">
              Any unpaid booking linked to this invoice will also be removed. The source quote will
              revert to sent status if applicable.
            </p>
          ) : null}
          <DialogFooter className="gap-2 sm:justify-end">
            <button
              type="button"
              disabled={busy}
              onClick={() => setDeleteOpen(false)}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void runDelete()}
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {busy ? "Deleting…" : `Delete ${docTypeLabel.toLowerCase()}`}
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
