"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { FloatingSelect, type FloatingSelectOption } from "@/components/ui/floating-select";
import { updateCleanerProfile } from "@/lib/admin/dashboard";
import { cn } from "@/lib/utils";

export type OfficeCleanerEditTarget = {
  id: string;
  full_name: string | null;
  phone: string | null;
  status: string | null;
  is_available: boolean | null;
  availability_start: string | null;
  availability_end: string | null;
};

type CleanerStatus = "available" | "busy" | "offline";

type FormState = {
  fullName: string;
  phone: string;
  status: CleanerStatus;
  availabilityStart: string;
  availabilityEnd: string;
};

const STATUS_OPTIONS: FloatingSelectOption[] = [
  { value: "available", label: "Available — can receive jobs" },
  { value: "busy", label: "On a job — busy today" },
  { value: "offline", label: "Offline — not receiving jobs" },
];

function normalizeStatus(raw: string | null, isAvailable: boolean | null): CleanerStatus {
  if (isAvailable === false) return "offline";
  const st = String(raw ?? "").toLowerCase();
  if (st === "busy" || st === "offline") return st;
  return "available";
}

function timeInputValue(raw: string | null, fallback: string): string {
  const t = String(raw ?? "").trim();
  if (!t) return fallback;
  return t.slice(0, 5);
}

function formatTimeLabel(hm: string): string {
  const [hStr, mStr] = hm.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hm;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function buildTimeOptions(startHour = 6, endHour = 21): FloatingSelectOption[] {
  const out: FloatingSelectOption[] = [];
  for (let h = startHour; h <= endHour; h++) {
    for (const m of [0, 30]) {
      if (h === endHour && m > 0) break;
      const value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      out.push({ value, label: formatTimeLabel(value) });
    }
  }
  return out;
}

const BASE_TIME_OPTIONS = buildTimeOptions();

function timeOptionsIncluding(value: string): FloatingSelectOption[] {
  if (!value || BASE_TIME_OPTIONS.some((o) => o.value === value)) return BASE_TIME_OPTIONS;
  return [{ value, label: formatTimeLabel(value) }, ...BASE_TIME_OPTIONS];
}

function buildForm(cleaner: OfficeCleanerEditTarget): FormState {
  return {
    fullName: cleaner.full_name ?? "",
    phone: cleaner.phone ?? "",
    status: normalizeStatus(cleaner.status, cleaner.is_available),
    availabilityStart: timeInputValue(cleaner.availability_start, "08:00"),
    availabilityEnd: timeInputValue(cleaner.availability_end, "17:00"),
  };
}

function isAvailableForStatus(status: CleanerStatus): boolean {
  return status !== "offline";
}

const fieldClass =
  "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-300 focus:outline-none";

const selectLabelClass = "text-xs font-semibold uppercase tracking-wide text-slate-500";
const selectTriggerClass = "h-10 rounded-xl border-slate-200 text-sm shadow-none hover:border-blue-300 hover:shadow-sm";

export function OfficeCleanerEditPanel({
  cleaner,
  onSaved,
  onCancel,
}: {
  cleaner: OfficeCleanerEditTarget;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => buildForm(cleaner));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const startOptions = useMemo(() => timeOptionsIncluding(form.availabilityStart), [form.availabilityStart]);
  const endOptions = useMemo(() => timeOptionsIncluding(form.availabilityEnd), [form.availabilityEnd]);

  useEffect(() => {
    setForm(buildForm(cleaner));
    setError(null);
    setSuccess(null);
  }, [cleaner]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const fullName = form.fullName.trim();
    const phone = form.phone.trim();
    if (!fullName) {
      setError("Full name is required.");
      return;
    }
    if (!phone) {
      setError("Phone number is required.");
      return;
    }

    setBusy(true);
    try {
      await updateCleanerProfile(cleaner.id, {
        full_name: fullName,
        phone,
        availability_start: form.availabilityStart || null,
        availability_end: form.availabilityEnd || null,
        is_available: isAvailableForStatus(form.status),
        status: form.status,
      });
      setSuccess("Cleaner updated.");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update cleaner.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-800">Edit cleaner</h3>
          <p className="mt-1 text-xs text-slate-500">Name, phone, status, and usual working hours.</p>
        </div>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-semibold text-slate-500 hover:text-slate-700"
          >
            Cancel
          </button>
        ) : null}
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 space-y-4">
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Full name
          <input
            type="text"
            value={form.fullName}
            onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
            className={fieldClass}
            autoComplete="name"
          />
        </label>

        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Phone
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            className={fieldClass}
            autoComplete="tel"
          />
        </label>

        <FloatingSelect
          label="Workload status"
          value={form.status}
          onChange={(next) => setForm((f) => ({ ...f, status: next as CleanerStatus }))}
          options={STATUS_OPTIONS}
          labelClassName={selectLabelClass}
          triggerClassName={selectTriggerClass}
          className="space-y-1"
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <FloatingSelect
            label="Day starts"
            value={form.availabilityStart}
            onChange={(next) => setForm((f) => ({ ...f, availabilityStart: next }))}
            options={startOptions}
            labelClassName={selectLabelClass}
            triggerClassName={selectTriggerClass}
            className="space-y-1"
          />
          <FloatingSelect
            label="Day ends"
            value={form.availabilityEnd}
            onChange={(next) => setForm((f) => ({ ...f, availabilityEnd: next }))}
            options={endOptions}
            labelClassName={selectLabelClass}
            triggerClassName={selectTriggerClass}
            className="space-y-1"
          />
        </div>

        <p className="text-xs leading-relaxed text-slate-500">
          Areas, weekly calendar, email, and password: select the cleaner on the{" "}
          <Link href="/office/cleaners" className="font-semibold text-blue-600 hover:underline">
            cleaners list
          </Link>{" "}
          and use the details panel.
        </p>

        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}
        {success ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {success}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className={cn(
            "inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60",
          )}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {busy ? "Saving…" : "Save changes"}
        </button>
      </form>
    </section>
  );
}
