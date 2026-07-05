"use client";

import { useEffect, useState } from "react";
import { adminFetch } from "@/hooks/useAdminData";
import {
  salesDocumentIsEditableWithoutPayment,
  type SalesDocumentType,
} from "@/lib/salesDocument/types";

export function SalesDocumentDetailsEditor({
  documentId,
  documentType,
  status,
  amountPaidCents,
  initialName,
  initialEmail,
  initialPhone,
  initialDueDate,
  initialNotes,
  onSaved,
}: {
  documentId: string;
  documentType: SalesDocumentType;
  status: string;
  amountPaidCents: number;
  initialName: string;
  initialEmail: string;
  initialPhone: string | null;
  initialDueDate: string | null;
  initialNotes: string | null;
  onSaved: () => void;
}) {
  const editable = salesDocumentIsEditableWithoutPayment({
    document_type: documentType,
    status,
    amount_paid_cents: amountPaidCents,
  });
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [dueDate, setDueDate] = useState(initialDueDate ?? "");
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(initialName);
    setEmail(initialEmail);
    setPhone(initialPhone ?? "");
    setDueDate(initialDueDate ?? "");
    setNotes(initialNotes ?? "");
  }, [initialName, initialEmail, initialPhone, initialDueDate, initialNotes]);

  async function save() {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const res = await adminFetch(`/api/admin/sales-documents/${documentId}`, {
        method: "PATCH",
        body: JSON.stringify({
          customer_name: name.trim(),
          customer_email: email.trim(),
          customer_phone: phone.trim() || null,
          due_date: dueDate.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      if (!res.ok) throw new Error(res.error ?? "Save failed.");
      setMessage("Customer details saved.");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    }
    setBusy(false);
  }

  if (!editable) {
    return (
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-slate-500">Customer</dt>
          <dd className="font-medium text-slate-900">{initialName}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Email</dt>
          <dd className="font-medium text-slate-900">{initialEmail}</dd>
        </div>
        {initialPhone ? (
          <div>
            <dt className="text-slate-500">Phone</dt>
            <dd className="font-medium text-slate-900">{initialPhone}</dd>
          </div>
        ) : null}
        {initialDueDate ? (
          <div>
            <dt className="text-slate-500">Due date</dt>
            <dd className="font-medium text-slate-900">{initialDueDate}</dd>
          </div>
        ) : null}
        {initialNotes ? (
          <div className="sm:col-span-2">
            <dt className="text-slate-500">Notes</dt>
            <dd className="font-medium text-slate-900">{initialNotes}</dd>
          </div>
        ) : null}
      </dl>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Customer name</span>
          <input
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Email</span>
          <input
            type="email"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Phone</span>
          <input
            type="tel"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Due date</span>
          <input
            type="date"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="font-medium text-slate-700">Internal notes</span>
          <textarea
            rows={3}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy || name.trim().length < 2 || !email.trim()}
          onClick={() => void save()}
          className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save customer details"}
        </button>
        {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>
    </div>
  );
}
