"use client";

import { useEffect, useState } from "react";
import { getStoredReferral } from "@/lib/referrals/client";

export default function CleanerApplyPage() {
  const [form, setForm] = useState({
    name: "",
    phone: "",
    cityId: "",
    location: "",
    experience: "None",
    availability: [] as string[],
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [cities, setCities] = useState<Array<{ id: string; name: string; is_active: boolean }>>([]);

  useEffect(() => {
    setReferralCode(getStoredReferral("cleaner"));
    void fetch("/api/cities")
      .then((r) => (r.ok ? r.json() : Promise.resolve({ cities: [] })))
      .then((j: { cities?: Array<{ id: string; name: string; is_active: boolean }> }) => {
        setCities((j.cities ?? []).filter((c) => c.is_active));
      })
      .catch(() => setCities([]));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setOk(false);
    const res = await fetch("/api/cleaner/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, referralCode }),
    });
    const json = (await res.json()) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setMsg(json.error ?? "Could not submit application.");
      return;
    }
    setOk(true);
    setMsg("Application received ✅\nWe will contact you shortly via WhatsApp.");
    setForm({ name: "", phone: "", cityId: "", location: "", experience: "None", availability: [] });
  }

  function toggleAvailability(value: string) {
    setForm((prev) => ({
      ...prev,
      availability: prev.availability.includes(value)
        ? prev.availability.filter((v) => v !== value)
        : [...prev.availability, value],
    }));
  }

  return (
    <main className="mx-auto max-w-md space-y-6 px-4 py-6">
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Earn money as a cleaner</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          Choose your schedule. Get paid weekly. Work near you.
        </p>
        <ul className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-300">
          <li>• Flexible hours</li>
          <li>• Weekly payouts</li>
          <li>• No experience required</li>
        </ul>
      </section>

      <form onSubmit={submit} className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <input
          required
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          placeholder="Full name"
          className="h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
        <input
          required
          value={form.phone}
          onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
          placeholder="Phone number"
          className="h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
        <select
          required
          value={form.cityId}
          onChange={(e) => setForm((p) => ({ ...p, cityId: e.target.value }))}
          className="h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        >
          <option value="">Select city</option>
          {cities.map((city) => (
            <option key={city.id} value={city.id}>
              {city.name}
            </option>
          ))}
        </select>
        <input
          required
          value={form.location}
          onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
          placeholder="Area / Location"
          className="h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
        <select
          value={form.experience}
          onChange={(e) => setForm((p) => ({ ...p, experience: e.target.value }))}
          className="h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        >
          <option>None</option>
          <option>1–2 years</option>
          <option>3+ years</option>
        </select>
        <div className="space-y-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Availability</p>
          <div className="grid grid-cols-2 gap-2">
            {["Weekdays", "Weekends", "Mornings", "Afternoons"].map((slot) => (
              <label key={slot} className="inline-flex items-center gap-2 rounded-md bg-zinc-50 px-2 py-2 text-sm dark:bg-zinc-800/60">
                <input
                  type="checkbox"
                  checked={form.availability.includes(slot)}
                  onChange={() => toggleAvailability(slot)}
                />
                {slot}
              </label>
            ))}
          </div>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="min-h-12 w-full rounded-lg bg-emerald-600 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? "Submitting..." : "Apply to join"}
        </button>
        {msg ? (
          <p className={["whitespace-pre-line text-sm", ok ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"].join(" ")}>
            {msg}
          </p>
        ) : null}
      </form>
    </main>
  );
}
