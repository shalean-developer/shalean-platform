"use client";

import { useEffect, useState } from "react";
import { adminFetch } from "@/hooks/useAdminData";
import {
  SalesDocumentCatalogPicker,
  type CatalogLineInput,
} from "@/components/admin/sales-documents/SalesDocumentCatalogPicker";
import {
  salesDocumentIsEditableWithoutPayment,
  type SalesDocumentType,
} from "@/lib/salesDocument/types";

type LineRow = { description: string; quantity: number; unit_price_cents: number };

function formatZar(cents: number) {
  return `R ${(cents / 100).toLocaleString("en-ZA")}`;
}

export function SalesDocumentQuoteEditor({
  documentId,
  documentType,
  status,
  amountPaidCents,
  initialLines,
  onSaved,
}: {
  documentId: string;
  documentType: SalesDocumentType;
  status: string;
  amountPaidCents: number;
  initialLines: LineRow[];
  onSaved: () => void;
}) {
  const editable = salesDocumentIsEditableWithoutPayment({
    document_type: documentType,
    status,
    amount_paid_cents: amountPaidCents,
  });
  const [lines, setLines] = useState<LineRow[]>(initialLines);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLines(initialLines);
  }, [initialLines]);

  const totalCents = lines.reduce(
    (sum, l) => sum + Math.round(l.quantity * l.unit_price_cents),
    0,
  );

  function addCatalogLine(line: CatalogLineInput) {
    setLines((prev) => [
      ...prev,
      {
        description: line.description,
        quantity: line.quantity ?? 1,
        unit_price_cents: line.unit_price_cents,
      },
    ]);
  }

  async function save() {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const res = await adminFetch(`/api/admin/sales-documents/${documentId}`, {
        method: "PATCH",
        body: JSON.stringify({ line_items: lines }),
      });
      if (!res.ok) throw new Error(res.error ?? "Save failed.");
      setMessage(status === "requested" ? "Pricing saved — ready to send quote." : "Saved.");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    }
    setBusy(false);
  }

  if (!editable) {
    return (
      <ul className="mt-3 space-y-2 text-sm">
        {lines.map((li, i) => (
          <li key={i} className="flex justify-between gap-4">
            <span>{li.description}</span>
            <span className="tabular-nums text-slate-600">
              {li.quantity} × {formatZar(li.unit_price_cents)}
            </span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="space-y-4">
      <SalesDocumentCatalogPicker onAddLine={addCatalogLine} />
      <ul className="space-y-3">
        {lines.map((line, idx) => (
          <li key={idx} className="grid gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3 sm:grid-cols-12">
            <input
              className="sm:col-span-5 rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={line.description}
              onChange={(e) =>
                setLines((prev) =>
                  prev.map((l, i) => (i === idx ? { ...l, description: e.target.value } : l)),
                )
              }
            />
            <input
              type="number"
              min={1}
              className="sm:col-span-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={line.quantity}
              onChange={(e) =>
                setLines((prev) =>
                  prev.map((l, i) =>
                    i === idx ? { ...l, quantity: Math.max(1, Number(e.target.value) || 1) } : l,
                  ),
                )
              }
            />
            <input
              type="number"
              min={0}
              step={0.01}
              className="sm:col-span-3 rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={(line.unit_price_cents / 100).toFixed(2)}
              onChange={(e) =>
                setLines((prev) =>
                  prev.map((l, i) =>
                    i === idx
                      ? { ...l, unit_price_cents: Math.round(Number(e.target.value) * 100) || 0 }
                      : l,
                  ),
                )
              }
            />
            <button
              type="button"
              className="sm:col-span-2 text-sm text-red-600 hover:underline"
              onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="text-sm font-medium text-blue-600 hover:underline"
        onClick={() =>
          setLines((prev) => [...prev, { description: "", quantity: 1, unit_price_cents: 0 }])
        }
      >
        + Add line manually
      </button>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <p className="text-sm font-semibold text-slate-900">Total: {formatZar(totalCents)}</p>
        <button
          type="button"
          disabled={busy || lines.length === 0}
          onClick={() => void save()}
          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? "Saving…" : status === "requested" ? "Save pricing" : "Save changes"}
        </button>
      </div>
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
