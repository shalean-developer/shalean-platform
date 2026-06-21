"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CLEANER_APPLY_WORKING_DAY_CODES,
  CLEANER_APPLY_WORKING_DAY_LABELS,
  type CleanerWeekdayCode,
} from "@/lib/cleaner/cleanerApplicationFields";
import { getStoredReferral } from "@/lib/referrals/client";
import { CleanerApplyHeader } from "./CleanerApplyHeader";

const AVAILABILITY_SLOTS = ["Weekdays", "Weekends", "Mornings", "Afternoons"] as const;
const EXPERIENCE_OPTIONS = ["None", "1–2 years", "3+ years"] as const;

const fieldClass =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

function ApplyFormSkeleton() {
  return (
    <div
      className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
      aria-hidden
    >
      <div className="space-y-2">
        <div className="h-6 w-32 animate-pulse rounded-lg bg-slate-100" />
        <div className="h-4 w-56 animate-pulse rounded-lg bg-slate-100" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={i < 2 ? "sm:col-span-2 space-y-2" : "space-y-2"}>
            <div className="h-4 w-24 animate-pulse rounded bg-slate-100" />
            <div className="h-11 animate-pulse rounded-xl bg-slate-100" />
          </div>
        ))}
        <div className="sm:col-span-2 space-y-2">
          <div className="h-4 w-36 animate-pulse rounded bg-slate-100" />
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 w-24 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        </div>
      </div>
      <div className="h-12 animate-pulse rounded-xl bg-blue-100" />
    </div>
  );
}

export function CleanerApplyForm() {
  const [form, setForm] = useState({
    name: "",
    phone: "",
    cityId: "",
    location: "",
    experience: "None",
    availability: [] as string[],
    workingAreas: [] as string[],
    workingDays: [] as CleanerWeekdayCode[],
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [cities, setCities] = useState<Array<{ id: string; name: string; is_active: boolean }>>([]);
  const [serviceLocations, setServiceLocations] = useState<
    Array<{ id: string; name: string; city_id: string | null }>
  >([]);
  const [formReady, setFormReady] = useState(false);

  const cityWorkingAreas = useMemo(() => {
    if (!form.cityId) return [];
    return serviceLocations
      .filter((loc) => loc.city_id === form.cityId)
      .map((loc) => loc.name)
      .sort((a, b) => a.localeCompare(b));
  }, [form.cityId, serviceLocations]);

  useEffect(() => {
    setReferralCode(getStoredReferral("cleaner"));
    void Promise.all([
      fetch("/api/cities").then((r) => (r.ok ? r.json() : Promise.resolve({ cities: [] }))),
      fetch("/api/booking/service-locations?withActiveCleanersOnly=false").then((r) =>
        r.ok ? r.json() : Promise.resolve({ locations: [] }),
      ),
    ])
      .then(([citiesJson, locationsJson]) => {
        setCities(
          ((citiesJson as { cities?: Array<{ id: string; name: string; is_active: boolean }> }).cities ?? []).filter(
            (c) => c.is_active,
          ),
        );
        setServiceLocations(
          (locationsJson as { locations?: Array<{ id: string; name: string; city_id: string | null }> }).locations ??
            [],
        );
      })
      .catch(() => {
        setCities([]);
        setServiceLocations([]);
      });
    setFormReady(true);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (form.workingAreas.length === 0) {
      setMsg("Select at least one working area.");
      return;
    }
    if (form.workingDays.length === 0) {
      setMsg("Select at least one working day.");
      return;
    }
    setBusy(true);
    setMsg(null);
    setOk(false);
    const res = await fetch("/api/cleaner/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, referralCode }),
    });
    const json = (await res.json()) as { error?: string; message?: string };
    setBusy(false);
    if (!res.ok) {
      setMsg(
        json.message ??
          (json.error === "duplicate_application"
            ? "We already have an application for this phone number."
            : json.error === "already_cleaner"
              ? "This phone number is already linked to a cleaner account. Use cleaner login instead."
              : json.error ?? "Could not submit application."),
      );
      return;
    }
    setOk(true);
    setMsg(null);
    setForm({
      name: "",
      phone: "",
      cityId: "",
      location: "",
      experience: "None",
      availability: [],
      workingAreas: [],
      workingDays: [],
    });
  }

  function toggleAvailability(value: string) {
    setForm((prev) => ({
      ...prev,
      availability: prev.availability.includes(value)
        ? prev.availability.filter((v) => v !== value)
        : [...prev.availability, value],
    }));
  }

  function toggleWorkingArea(area: string) {
    setForm((prev) => ({
      ...prev,
      workingAreas: prev.workingAreas.includes(area)
        ? prev.workingAreas.filter((v) => v !== area)
        : [...prev.workingAreas, area],
    }));
  }

  function toggleWorkingDay(day: CleanerWeekdayCode) {
    setForm((prev) => ({
      ...prev,
      workingDays: prev.workingDays.includes(day)
        ? prev.workingDays.filter((v) => v !== day)
        : [...prev.workingDays, day],
    }));
  }

  return (
    <div className="min-h-dvh bg-gradient-to-b from-blue-50 via-white to-slate-50 text-slate-900">
      <CleanerApplyHeader showBackToInfo />

      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="text-center">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
            Cleaner application
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Fill in your details — we&apos;ll contact you on WhatsApp within a few business days.
          </p>
        </div>

        {ok ? (
          <div className="mt-8 rounded-2xl border border-blue-200 bg-white p-8 text-center shadow-sm">
            <CheckCircle2 className="mx-auto h-12 w-12 text-blue-600" aria-hidden />
            <h2 className="mt-4 text-xl font-bold text-slate-900">Application received</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Thanks for applying! Our team will review your details and contact you shortly via WhatsApp.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/"
                className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
              >
                Back to home
              </Link>
              <Link
                href="/cleaner/apply"
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                About working with Shalean
              </Link>
            </div>
          </div>
        ) : !formReady ? (
          <div className="mt-8">
            <ApplyFormSkeleton />
          </div>
        ) : (
          <form
            onSubmit={submit}
            suppressHydrationWarning
            className="mt-8 space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
          >
            <div>
              <h2 className="text-lg font-bold text-slate-900">Your details</h2>
              <p className="mt-1 text-sm text-slate-500">All fields marked with * are required.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="apply-name">
                  Full name *
                </label>
                <input
                  id="apply-name"
                  required
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Thandi Mokoena"
                  className={fieldClass}
                  autoComplete="name"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="apply-phone">
                  Phone / WhatsApp *
                </label>
                <input
                  id="apply-phone"
                  type="tel"
                  required
                  value={form.phone}
                  onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="e.g. 082 123 4567"
                  className={fieldClass}
                  autoComplete="tel"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="apply-city">
                  City *
                </label>
                <select
                  id="apply-city"
                  required
                  value={form.cityId}
                  onChange={(e) => {
                    const cityId = e.target.value;
                    setForm((p) => ({
                      ...p,
                      cityId,
                      workingAreas: p.workingAreas.filter((area) =>
                        serviceLocations.some((loc) => loc.city_id === cityId && loc.name === area),
                      ),
                    }));
                  }}
                  className={fieldClass}
                >
                  <option value="">Select city</option>
                  {cities.map((city) => (
                    <option key={city.id} value={city.id}>
                      {city.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="apply-location">
                  Area / suburb *
                </label>
                <div className="relative">
                  <MapPin
                    className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    aria-hidden
                  />
                  <input
                    id="apply-location"
                    required
                    value={form.location}
                    onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
                    placeholder="e.g. Sea Point"
                    className={cn(fieldClass, "pl-10")}
                  />
                </div>
              </div>

              <div className="sm:col-span-2">
                <span className="mb-2 block text-sm font-medium text-slate-700">Working areas *</span>
                <p className="mb-3 text-xs text-slate-500">
                  Suburbs where you are willing to take jobs. Select all that apply.
                </p>
                {!form.cityId ? (
                  <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                    Select a city first to choose working areas.
                  </p>
                ) : cityWorkingAreas.length === 0 ? (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    No suburbs are listed for this city yet. Contact us on WhatsApp if you still want to apply.
                  </p>
                ) : (
                  <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 p-3">
                    <div className="flex flex-wrap gap-2">
                      {cityWorkingAreas.map((area) => {
                        const selected = form.workingAreas.includes(area);
                        return (
                          <button
                            key={area}
                            type="button"
                            onClick={() => toggleWorkingArea(area)}
                            className={cn(
                              "rounded-xl border px-3 py-2 text-sm font-medium transition",
                              selected
                                ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                                : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50",
                            )}
                          >
                            {area}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="sm:col-span-2">
                <span className="mb-2 block text-sm font-medium text-slate-700">Working days *</span>
                <p className="mb-3 text-xs text-slate-500">Which days of the week can you work?</p>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                  {CLEANER_APPLY_WORKING_DAY_CODES.map((day) => {
                    const selected = form.workingDays.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleWorkingDay(day)}
                        className={cn(
                          "rounded-xl border px-2 py-3 text-sm font-medium transition",
                          selected
                            ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                            : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50",
                        )}
                      >
                        {CLEANER_APPLY_WORKING_DAY_LABELS[day]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="sm:col-span-2">
                <span className="mb-2 block text-sm font-medium text-slate-700">Cleaning experience</span>
                <div className="flex flex-wrap gap-2">
                  {EXPERIENCE_OPTIONS.map((option) => {
                    const selected = form.experience === option;
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setForm((p) => ({ ...p, experience: option }))}
                        className={cn(
                          "rounded-xl border px-4 py-2.5 text-sm font-medium transition",
                          selected
                            ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                            : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50",
                        )}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="sm:col-span-2">
                <span className="mb-2 block text-sm font-medium text-slate-700">Preferred times</span>
                <p className="mb-3 text-xs text-slate-500">Optional — mornings, weekends, etc.</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {AVAILABILITY_SLOTS.map((slot) => {
                    const selected = form.availability.includes(slot);
                    return (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => toggleAvailability(slot)}
                        className={cn(
                          "rounded-xl border px-3 py-3 text-sm font-medium transition",
                          selected
                            ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                            : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50",
                        )}
                      >
                        {slot}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {referralCode ? (
              <p className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                Referral code <span className="font-semibold">{referralCode}</span> will be applied to your
                application.
              </p>
            ) : null}

            {msg ? (
              <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{msg}</p>
            ) : null}

            <button
              type="submit"
              disabled={busy}
              className="inline-flex w-full min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {busy ? "Submitting…" : "Submit application"}
            </button>

            <p className="text-center text-xs leading-relaxed text-slate-500">
              By applying, you agree we may contact you via WhatsApp about your application and onboarding.
            </p>
          </form>
        )}
      </main>
    </div>
  );
}
