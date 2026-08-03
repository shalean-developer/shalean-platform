"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Policy = "legacy_july" | "current_v1";
type Customer = { email: string | null; name: string | null } | null;
type RecurringRow = { id: string; customer_id: string; status: string; frequency: string; start_date: string | null; end_date: string | null; price: number | string; earnings_policy: Policy; legacy_earnings_cents: number | null; earnings_policy_locked_at: string | null; customer: Customer };
type CustomerRow = { customer_id: string; earnings_policy: Policy; legacy_earnings_cents: number | null; applies_to_services: string[]; reason: string | null; customer: Customer };

const money = (cents: number | null) => cents == null ? "Not set" : `R${(cents / 100).toFixed(0)}`;

export default function EarningsPoliciesPage() {
  const [recurring, setRecurring] = useState<RecurringRow[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const response = await fetch("/api/admin/earnings-policies", { cache: "no-store" });
    const json = await response.json();
    if (!response.ok) setError(json.error ?? "Could not load earnings policies.");
    else { setRecurring(json.recurring ?? []); setCustomers(json.customers ?? []); }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const update = async (kind: "recurring" | "customer", id: string, policy: Policy, cents: number | null) => {
    const key = `${kind}:${id}`; setSaving(key); setError("");
    const response = await fetch("/api/admin/earnings-policies", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, id, earnings_policy: policy, legacy_earnings_rand: cents == null ? null : cents / 100 }) });
    const json = await response.json();
    if (!response.ok) setError(json.error ?? "Could not save policy."); else await load();
    setSaving("");
  };

  const filtered = useMemo(() => recurring.filter((r) => `${r.customer?.name ?? ""} ${r.customer?.email ?? ""} ${r.status} ${r.earnings_policy}`.toLowerCase().includes(search.toLowerCase())), [recurring, search]);
  const missing = recurring.filter((r) => r.earnings_policy === "legacy_july" && !r.legacy_earnings_cents).length;

  return <main className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
    <div><h1 className="text-3xl font-semibold">Earnings Policies</h1><p className="mt-2 text-sm text-gray-600">Manage legacy July locks and the current earnings policy. Deep and moving-cleaning rates remain R250 for cleaners and R270 for supervisors.</p></div>
    {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    <section className="grid gap-3 md:grid-cols-4">
      <Stat label="Recurring plans" value={String(recurring.length)} /><Stat label="Legacy July" value={String(recurring.filter(r => r.earnings_policy === "legacy_july").length)} /><Stat label="Current V1" value={String(recurring.filter(r => r.earnings_policy === "current_v1").length)} /><Stat label="Missing legacy rate" value={String(missing)} />
    </section>
    <section className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><h2 className="text-xl font-semibold">Recurring plans</h2><p className="text-sm text-gray-500">Changing a plan updates its future unpaid bookings.</p></div><input className="rounded-lg border px-3 py-2 text-sm" placeholder="Search customer or policy" value={search} onChange={e => setSearch(e.target.value)} /></div>
      {loading ? <p className="py-8 text-center text-gray-500">Loading…</p> : <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Customer</th><th className="p-2">Schedule</th><th className="p-2">Policy</th><th className="p-2">Per visit</th><th className="p-2">Status</th><th className="p-2">Action</th></tr></thead><tbody>{filtered.map(row => <EditableRow key={row.id} row={row} saving={saving === `recurring:${row.id}`} onSave={(policy, cents) => update("recurring", row.id, policy, cents)} />)}</tbody></table></div>}
    </section>
    <section className="rounded-xl border bg-white p-4 shadow-sm"><h2 className="text-xl font-semibold">Customer-specific Airbnb locks</h2><p className="mb-4 text-sm text-gray-500">These overrides apply to Airbnb bookings for the selected customer.</p><div className="space-y-3">{customers.map(row => <div key={row.customer_id} className="flex flex-col gap-3 rounded-lg border p-3 md:flex-row md:items-center md:justify-between"><div><div className="font-medium">{row.customer?.name || row.customer?.email || row.customer_id}</div><div className="text-xs text-gray-500">{row.customer?.email} · {row.reason}</div></div><div className="flex items-center gap-3"><span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">Legacy July</span><span className="font-semibold">{money(row.legacy_earnings_cents)}</span><button className="rounded-lg border px-3 py-2 text-sm" disabled={saving === `customer:${row.customer_id}`} onClick={() => { const amount = window.prompt("Legacy Airbnb earning in rand", String((row.legacy_earnings_cents ?? 25000) / 100)); if (amount) void update("customer", row.customer_id, "legacy_july", Math.round(Number(amount) * 100)); }}>{saving === `customer:${row.customer_id}` ? "Saving…" : "Edit"}</button></div></div>)}</div></section>
  </main>;
}

function Stat({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border bg-white p-4 shadow-sm"><div className="text-sm text-gray-500">{label}</div><div className="mt-1 text-2xl font-semibold">{value}</div></div>; }

function EditableRow({ row, saving, onSave }: { row: RecurringRow; saving: boolean; onSave: (policy: Policy, cents: number | null) => void }) {
  const [policy, setPolicy] = useState<Policy>(row.earnings_policy);
  const [amount, setAmount] = useState(row.legacy_earnings_cents == null ? "" : String(row.legacy_earnings_cents / 100));
  useEffect(() => { setPolicy(row.earnings_policy); setAmount(row.legacy_earnings_cents == null ? "" : String(row.legacy_earnings_cents / 100)); }, [row]);
  return <tr className="border-b align-top"><td className="p-2"><div className="font-medium">{row.customer?.name || row.customer?.email || row.customer_id}</div><div className="text-xs text-gray-500">{row.customer?.email}</div></td><td className="p-2">{row.frequency}<div className="text-xs text-gray-500">From {row.start_date ?? "—"}</div></td><td className="p-2"><select className="rounded border px-2 py-1" value={policy} onChange={e => setPolicy(e.target.value as Policy)}><option value="legacy_july">Legacy July</option><option value="current_v1">Current V1</option></select></td><td className="p-2">{policy === "legacy_july" ? <div className="flex items-center gap-1"><span>R</span><input className="w-20 rounded border px-2 py-1" type="number" min="1" value={amount} onChange={e => setAmount(e.target.value)} /></div> : <span className="text-gray-500">60% policy</span>}</td><td className="p-2 capitalize">{row.status}</td><td className="p-2"><button className="rounded-lg bg-black px-3 py-2 text-white disabled:opacity-50" disabled={saving || (policy === "legacy_july" && Number(amount) <= 0)} onClick={() => onSave(policy, policy === "legacy_july" ? Math.round(Number(amount) * 100) : null)}>{saving ? "Saving…" : "Save"}</button></td></tr>;
}
