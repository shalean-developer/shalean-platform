"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { adminFetch } from "@/hooks/useAdminData";
import {
  AdminCustomerPicker,
  type AdminCustomerPickerValue,
} from "@/components/admin/AdminCustomerPicker";
import {
  SalesDocumentCatalogPicker,
  type CatalogLineInput,
} from "@/components/admin/sales-documents/SalesDocumentCatalogPicker";

type LineRow = { description: string; quantity: number; unit_price_cents: number };

function formatZar(cents: number) {
  return `R ${(cents / 100).toLocaleString("en-ZA")}`;
}

export default function OfficeSalesDocumentCreatePage() {
  const router = useRouter();
  const [documentType, setDocumentType] = useState<"quote" | "invoice">("quote");
  const [customer, setCustomer] = useState<AdminCustomerPickerValue>({
    customerId: null,
    customerName: "",
    customerEmail: "",
    customerPhone: "",
  });
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const totalCents = useMemo(
    () =>
      lines.reduce(
        (sum, l) => sum + Math.round(l.quantity * l.unit_price_cents),
        0,
      ),
    [lines],
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (lines.length === 0) {
      setError("Add at least one line item from the catalog or manually.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await adminFetch<{ ok: boolean; id: string }>("/api/admin/sales-documents", {
        method: "POST",
        body: JSON.stringify({
          document_type: documentType,
          customer_id: customer.customerId,
          customer_name: customer.customerName,
          customer_email: customer.customerEmail,
          customer_phone: customer.customerPhone || null,
          due_date: dueDate || null,
          notes: notes || null,
          line_items: lines.map((l) => ({
            description: l.description,
            quantity: l.quantity,
            unit_price_cents: Math.round(l.unit_price_cents),
          })),
        }),
      });
      if (!res.ok || !res.data?.id) {
        throw new Error(res.error ?? "Could not create document.");
      }
      router.push(`/office/sales-documents/${res.data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create document.");
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <Link href="/office/sales-documents" className="text-sm text-blue-600 hover:underline">
          ← Back
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">New quote or invoice</h1>
        <p className="mt-1 text-sm text-slate-500">
          Pick services and add-ons from your pricing catalog, or enter custom lines below.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <form
          onSubmit={(e) => void onSubmit(e)}
          className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" checked={documentType === "quote"} onChange={() => setDocumentType("quote")} />
              Quote
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" checked={documentType === "invoice"} onChange={() => setDocumentType("invoice")} />
              Invoice
            </label>
          </div>

          <AdminCustomerPicker value={customer} onChange={setCustomer} disabled={saving} />

          <label className="block text-sm">
            <span className="text-slate-600">Due date (optional)</span>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 sm:max-w-xs"
            />
          </label>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-700">Line items</p>
              {lines.length > 0 ? (
                <p className="text-sm font-semibold tabular-nums text-slate-900">
                  Total {formatZar(totalCents)}
                </p>
              ) : null}
            </div>
            <div className="mt-2 space-y-3">
              {lines.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-400">
                  Add lines from the catalog → or use &quot;Custom line&quot; below.
                </p>
              ) : (
                lines.map((line, i) => (
                  <div key={i} className="grid gap-2 sm:grid-cols-12">
                    <input
                      className="sm:col-span-6 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      placeholder="Description"
                      value={line.description}
                      onChange={(e) => {
                        const next = [...lines];
                        next[i] = { ...next[i], description: e.target.value };
                        setLines(next);
                      }}
                    />
                    <input
                      type="number"
                      min={1}
                      className="sm:col-span-2 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      value={line.quantity}
                      onChange={(e) => {
                        const next = [...lines];
                        next[i] = { ...next[i], quantity: Number(e.target.value) || 1 };
                        setLines(next);
                      }}
                    />
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      className="sm:col-span-3 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      placeholder="Price (ZAR)"
                      value={line.unit_price_cents / 100}
                      onChange={(e) => {
                        const next = [...lines];
                        next[i] = {
                          ...next[i],
                          unit_price_cents: Math.round(Number(e.target.value) * 100),
                        };
                        setLines(next);
                      }}
                    />
                    <button
                      type="button"
                      className="sm:col-span-1 text-sm text-red-600"
                      onClick={() => setLines(lines.filter((_, j) => j !== i))}
                    >
                      ×
                    </button>
                  </div>
                ))
              )}
            </div>
            <button
              type="button"
              className="mt-2 text-sm font-medium text-blue-600"
              onClick={() =>
                setLines([...lines, { description: "", quantity: 1, unit_price_cents: 0 }])
              }
            >
              + Custom line
            </button>
          </div>

          <label className="block text-sm">
            <span className="text-slate-600">Notes (optional)</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
            />
          </label>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? "Creating…" : "Create draft"}
          </button>
        </form>

        <SalesDocumentCatalogPicker onAddLine={addCatalogLine} className="lg:sticky lg:top-6 lg:self-start" />
      </div>
    </div>
  );
}
