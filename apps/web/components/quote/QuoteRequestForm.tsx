"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";
import { QuoteRequestCatalogPicker } from "@/components/quote/QuoteRequestCatalogPicker";
import type { QuoteCatalogSelection } from "@/lib/quote/types";
import { getAcquisitionPayloadFields } from "@/lib/analytics/acquisitionContext";

const PROPERTY_OPTIONS = [
  { value: "apartment", label: "Apartment / flat" },
  { value: "house", label: "House" },
  { value: "office", label: "Office / commercial" },
];

type FormState = {
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  property_type: string;
  suburb: string;
  preferred_date: string;
  message: string;
};

const initialForm: FormState = {
  customer_name: "",
  customer_email: "",
  customer_phone: "",
  property_type: "apartment",
  suburb: "",
  preferred_date: "",
  message: "",
};

const fieldClass =
  "w-full min-h-12 rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 sm:text-sm";

export function QuoteRequestForm() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [selected, setSelected] = useState<QuoteCatalogSelection[]>([]);
  const [bedrooms, setBedrooms] = useState(2);
  const [bathrooms, setBathrooms] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const hasService = selected.some((item) => item.kind === "service");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!hasService) {
      setError("Please select a service.");
      return;
    }

    setBusy(true);
    setError(null);
    setOk(false);

    try {
      const res = await fetch("/api/public/quote-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          bedrooms,
          bathrooms,
          preferred_date: form.preferred_date || null,
          selected_items: selected,
          ...getAcquisitionPayloadFields(),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(
          json.error === "invalid_email"
            ? "Please enter a valid email address."
            : json.error === "phone_required"
              ? "Please enter your phone number."
              : json.error === "suburb_required"
                ? "Please tell us which suburb or area you are in."
                : json.error === "selection_required"
                  ? "Please select at least one service."
                  : json.error === "invalid_selection"
                    ? "That service selection is no longer available. Reload the services and try again."
                  : "We could not submit your request. Please try again or call us.",
        );
        return;
      }
      setOk(true);
      setForm(initialForm);
      setSelected([]);
      setBedrooms(2);
      setBathrooms(1);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (ok) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center shadow-sm">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" aria-hidden />
        <h2 className="mt-4 text-xl font-bold text-slate-900">Request received</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Our team will review your details and email you a personalised quote shortly. For urgent jobs,
          call{" "}
          <a href="tel:0871535250" className="font-semibold text-blue-700 hover:underline">
            087 153 5250
          </a>
          .
        </p>
        <Link
          href="/book"
          className="mt-6 inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Book instantly instead
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
      suppressHydrationWarning
    >
      <QuoteRequestCatalogPicker
        selected={selected}
        onChange={setSelected}
        bedrooms={bedrooms}
        bathrooms={bathrooms}
        onBedroomsChange={setBedrooms}
        onBathroomsChange={setBathrooms}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="quote-name">
            Full name
          </label>
          <input
            id="quote-name"
            required
            className={fieldClass}
            value={form.customer_name}
            onChange={(e) => setForm((p) => ({ ...p, customer_name: e.target.value }))}
            suppressHydrationWarning
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="quote-email">
            Email
          </label>
          <input
            id="quote-email"
            type="email"
            required
            className={fieldClass}
            value={form.customer_email}
            onChange={(e) => setForm((p) => ({ ...p, customer_email: e.target.value }))}
            suppressHydrationWarning
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="quote-phone">
            Phone / WhatsApp
          </label>
          <input
            id="quote-phone"
            type="tel"
            required
            className={fieldClass}
            value={form.customer_phone}
            onChange={(e) => setForm((p) => ({ ...p, customer_phone: e.target.value }))}
            suppressHydrationWarning
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="quote-property">
            Property type
          </label>
          <select
            id="quote-property"
            className={fieldClass}
            value={form.property_type}
            onChange={(e) => setForm((p) => ({ ...p, property_type: e.target.value }))}
            suppressHydrationWarning
          >
            {PROPERTY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="quote-suburb">
            Suburb / area in Cape Town
          </label>
          <input
            id="quote-suburb"
            required
            placeholder="e.g. Sea Point, Claremont, Durbanville"
            className={fieldClass}
            value={form.suburb}
            onChange={(e) => setForm((p) => ({ ...p, suburb: e.target.value }))}
            suppressHydrationWarning
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="quote-date">
            Preferred date (optional)
          </label>
          <input
            id="quote-date"
            type="date"
            className={fieldClass}
            value={form.preferred_date}
            onChange={(e) => setForm((p) => ({ ...p, preferred_date: e.target.value }))}
            suppressHydrationWarning
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="quote-message">
            Anything else we should know?
          </label>
          <textarea
            id="quote-message"
            rows={4}
            className={fieldClass}
            placeholder="Pets, parking, access instructions, special requests…"
            value={form.message}
            onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))}
            suppressHydrationWarning
          />
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <button
        type="submit"
        disabled={busy}
        className="inline-flex w-full min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60 sm:w-auto"
        suppressHydrationWarning
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        {busy ? "Sending…" : "Get free quote"}
      </button>
      <p className="text-xs text-slate-500">
        No payment required. We&apos;ll email your quote — you can accept and pay online when ready.
      </p>
    </form>
  );
}
