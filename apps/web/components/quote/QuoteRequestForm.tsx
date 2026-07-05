"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { QuoteRequestCatalogPicker } from "@/components/quote/QuoteRequestCatalogPicker";
import { QuoteRequestExtrasPicker } from "@/components/quote/QuoteRequestExtrasPicker";
import { QuoteRequestStepIndicator, type QuoteStep } from "@/components/quote/QuoteRequestStepIndicator";
import {
  buildQuoteSelectedItems,
  extrasForSelectedService,
  primaryServiceLabel,
  quoteServiceShowsExtras,
} from "@/lib/quote/quoteSelection";
import { useQuotePricingCatalog } from "@/components/quote/useQuotePricingCatalog";
import { cn } from "@/lib/utils";

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

function QuoteSummaryBar({
  serviceLabel,
  propertyLabel,
  suburb,
  bedrooms,
  bathrooms,
  showHomeSize,
  extraCount,
}: {
  serviceLabel: string | null;
  propertyLabel: string;
  suburb: string;
  bedrooms: number;
  bathrooms: number;
  showHomeSize: boolean;
  extraCount: number;
}) {
  const parts = [
    serviceLabel,
    showHomeSize ? `${bedrooms} bed, ${bathrooms} bath` : null,
    propertyLabel,
    suburb.trim() || null,
    extraCount > 0 ? `${extraCount} extra${extraCount === 1 ? "" : "s"}` : null,
  ].filter(Boolean);

  if (parts.length === 0) return null;

  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm text-slate-700">
      <span className="font-medium text-slate-900">Your quote: </span>
      {parts.join(" · ")}
    </div>
  );
}

export function QuoteRequestForm() {
  const { services, extras, loading, error: catalogError } = useQuotePricingCatalog();

  const [step, setStep] = useState<QuoteStep>(1);
  const [form, setForm] = useState<FormState>(initialForm);
  const [primaryServiceSlug, setPrimaryServiceSlug] = useState<string | null>(null);
  const [selectedExtraSlugs, setSelectedExtraSlugs] = useState<string[]>([]);
  const [bedrooms, setBedrooms] = useState(2);
  const [bathrooms, setBathrooms] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const showHomeSize = form.property_type !== "office";
  const propertyLabel =
    PROPERTY_OPTIONS.find((o) => o.value === form.property_type)?.label ?? form.property_type;
  const serviceLabel = primaryServiceLabel(primaryServiceSlug, services);
  const availableExtras = useMemo(
    () => extrasForSelectedService(primaryServiceSlug, services),
    [primaryServiceSlug, services],
  );
  const showExtras = quoteServiceShowsExtras(primaryServiceSlug);

  function handlePrimaryServiceChange(slug: string) {
    setPrimaryServiceSlug(slug);
    if (!quoteServiceShowsExtras(slug)) {
      setSelectedExtraSlugs([]);
      return;
    }
    const allowed = new Set(extrasForSelectedService(slug, services).map((extra) => extra.slug));
    setSelectedExtraSlugs((current) => current.filter((slug) => allowed.has(slug)));
  }

  const selectedItems = useMemo(
    () =>
      buildQuoteSelectedItems({
        primaryServiceSlug,
        services,
        selectedExtraSlugs,
        extras,
        bedrooms,
        bathrooms,
        includeHomeSize: showHomeSize,
      }),
    [
      primaryServiceSlug,
      services,
      selectedExtraSlugs,
      extras,
      bedrooms,
      bathrooms,
      showHomeSize,
    ],
  );

  function validateStep(current: QuoteStep): string | null {
    if (current === 1) {
      if (!primaryServiceSlug) return "Please select a cleaning type to continue.";
      return null;
    }
    if (current === 2) {
      if (!form.suburb.trim()) return "Please tell us which suburb or area you are in.";
      return null;
    }
    return null;
  }

  function goNext() {
    const stepError = validateStep(step);
    if (stepError) {
      setError(stepError);
      return;
    }
    setError(null);
    if (step < 3) setStep((step + 1) as QuoteStep);
  }

  function goBack() {
    setError(null);
    if (step > 1) setStep((step - 1) as QuoteStep);
  }

  function goToStep(target: QuoteStep) {
    setError(null);
    setStep(target);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (step !== 3) {
      goNext();
      return;
    }

    if (selectedItems.length === 0) {
      setError("Please select a cleaning type.");
      setStep(1);
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
          bedrooms: showHomeSize ? bedrooms : null,
          bathrooms: showHomeSize ? bathrooms : null,
          preferred_date: form.preferred_date || null,
          selected_items: selectedItems,
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
                  ? "Please select a cleaning type."
                  : "We could not submit your request. Please try again or call us.",
        );
        return;
      }
      setOk(true);
      setForm(initialForm);
      setPrimaryServiceSlug(null);
      setSelectedExtraSlugs([]);
      setBedrooms(2);
      setBathrooms(1);
      setStep(1);
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
      className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
    >
      <QuoteRequestStepIndicator currentStep={step} onStepClick={goToStep} />

      {step >= 2 ? (
        <QuoteSummaryBar
          serviceLabel={serviceLabel}
          propertyLabel={propertyLabel}
          suburb={form.suburb}
          bedrooms={bedrooms}
          bathrooms={bathrooms}
          showHomeSize={showHomeSize}
          extraCount={selectedExtraSlugs.length}
        />
      ) : null}

      {step === 1 ? (
        <QuoteRequestCatalogPicker
          services={services}
          loading={loading}
          error={catalogError}
          primaryServiceSlug={primaryServiceSlug}
          onPrimaryServiceChange={handlePrimaryServiceChange}
        />
      ) : null}

      {step === 2 ? (
        <div className="space-y-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">About your place</h2>
            <p className="mt-1 text-sm text-slate-500">This helps us size and route your quote.</p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="quote-property">
              Property type
            </label>
            <select
              id="quote-property"
              className={fieldClass}
              value={form.property_type}
              onChange={(e) => setForm((p) => ({ ...p, property_type: e.target.value }))}
            >
              {PROPERTY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {showHomeSize ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="quote-beds">
                  Bedrooms
                </label>
                <input
                  id="quote-beds"
                  type="number"
                  min={0}
                  max={20}
                  className={fieldClass}
                  value={bedrooms}
                  onChange={(e) => setBedrooms(Math.max(0, Number(e.target.value) || 0))}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="quote-baths">
                  Bathrooms
                </label>
                <input
                  id="quote-baths"
                  type="number"
                  min={0}
                  max={20}
                  className={fieldClass}
                  value={bathrooms}
                  onChange={(e) => setBathrooms(Math.max(0, Number(e.target.value) || 0))}
                />
              </div>
            </div>
          ) : null}

          {showExtras ? (
            <QuoteRequestExtrasPicker
              extras={availableExtras}
              selectedExtraSlugs={selectedExtraSlugs}
              onSelectedExtraSlugsChange={setSelectedExtraSlugs}
              serviceName={serviceLabel ?? undefined}
            />
          ) : null}

          <div>
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
            />
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <h2 className="text-base font-semibold text-slate-900">Your contact details</h2>
            <p className="mt-1 text-sm text-slate-500">We&apos;ll email your personalised quote here.</p>
          </div>

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
            />
          </div>
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        {step > 1 ? (
          <button
            type="button"
            onClick={goBack}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back
          </button>
        ) : (
          <div className="hidden sm:block" aria-hidden />
        )}

        <button
          type="submit"
          disabled={busy || (step === 1 && loading)}
          className={cn(
            "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60",
            step === 1 && "sm:ml-auto",
          )}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {busy ? (
            "Sending…"
          ) : step < 3 ? (
            <>
              Continue
              <ArrowRight className="h-4 w-4" aria-hidden />
            </>
          ) : (
            "Get free quote"
          )}
        </button>
      </div>

      {step === 3 ? (
        <p className="text-xs text-slate-500">
          No payment required. We&apos;ll email your quote — you can accept and pay online when ready.
        </p>
      ) : null}
    </form>
  );
}
