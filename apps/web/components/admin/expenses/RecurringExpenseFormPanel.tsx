"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import SlideOverPanel from "@/components/admin/SlideOverPanel";
import { adminFetch } from "@/hooks/useAdminData";
import { showToast } from "@/components/ui/notifications";
import type { ExpenseCategoryRow, ExpensePaymentMethod } from "@/lib/admin/expenses/types";
import { EXPENSE_PAYMENT_METHOD_LABELS } from "@/lib/admin/expenses/types";
import type { RecurringExpenseFrequency } from "@/lib/admin/expenses/recurringExpenses";

type City = { id: string; name: string };
type Vendor = { id: string; name: string };
type Account = { id: string; name: string };

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

const PAYMENT_METHODS = Object.keys(EXPENSE_PAYMENT_METHOD_LABELS) as ExpensePaymentMethod[];

const FREQUENCIES: { value: RecurringExpenseFrequency; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];

const PRESETS = [
  "Office Rent",
  "Internet",
  "Website Hosting",
  "Domain",
  "Zoho",
  "Insurance",
  "OpenAI API",
  "SMS",
  "WhatsApp API",
  "Electricity",
];

function zarToCents(raw: string): number | null {
  const cleaned = raw.replace(/[R\s,]/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

export function RecurringExpenseFormPanel({ open, onClose, onSaved }: Props) {
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<ExpenseCategoryRow[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [amountZar, setAmountZar] = useState("");
  const [frequency, setFrequency] = useState<RecurringExpenseFrequency>("monthly");
  const [nextRunDate, setNextRunDate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<ExpensePaymentMethod>("bank_transfer");
  const [accountId, setAccountId] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [newVendorName, setNewVendorName] = useState("");
  const [branchId, setBranchId] = useState("");
  const [autoApprove, setAutoApprove] = useState(true);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    Promise.all([
      adminFetch<{ categories: ExpenseCategoryRow[] }>("/api/admin/expenses/categories"),
      adminFetch<{ vendors: Vendor[] }>("/api/admin/expenses/vendors"),
      adminFetch<{ accounts: Account[] }>("/api/admin/expenses/accounts"),
      fetch("/api/cities").then((r) => r.json()),
    ]).then(([cats, vends, accts, cityData]) => {
      if (cats.ok) setCategories(cats.data?.categories ?? []);
      if (vends.ok) setVendors(vends.data?.vendors ?? []);
      if (accts.ok) setAccounts(accts.data?.accounts ?? []);
      setCities((cityData.cities ?? []).filter((c: City & { is_active?: boolean }) => c.is_active !== false));
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setDescription("");
    setCategoryId("");
    setAmountZar("");
    setFrequency("monthly");
    setNextRunDate(new Date().toISOString().slice(0, 10));
    setPaymentMethod("bank_transfer");
    setAccountId("");
    setVendorId("");
    setNewVendorName("");
    setBranchId("");
    setAutoApprove(true);
    setNotes("");
  }, [open]);

  const groupedCategories = useMemo(() => {
    const map = new Map<string, ExpenseCategoryRow[]>();
    for (const c of categories) {
      const list = map.get(c.group_name) ?? [];
      list.push(c);
      map.set(c.group_name, list);
    }
    return [...map.entries()];
  }, [categories]);

  function applyPreset(label: string) {
    setDescription(label);
    const match = categories.find((c) => c.name.toLowerCase().includes(label.split(" ")[0]!.toLowerCase()));
    if (match) setCategoryId(match.id);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cents = zarToCents(amountZar);
    if (!cents) {
      showToast("Enter a valid amount.", "error");
      return;
    }
    if (!categoryId || !description.trim() || !branchId || !nextRunDate) {
      showToast("Fill in all required fields.", "error");
      return;
    }

    setSaving(true);
    try {
      const body = {
        description: description.trim(),
        category_id: categoryId,
        amount_cents: cents,
        frequency,
        next_run_date: nextRunDate,
        payment_method: paymentMethod,
        paid_from_account_id: accountId || null,
        vendor_id: vendorId || null,
        vendor_name: !vendorId && newVendorName.trim() ? newVendorName.trim() : undefined,
        branch_id: branchId,
        auto_approve: autoApprove,
        notes: notes.trim() || null,
      };

      const res = await adminFetch("/api/admin/recurring-expenses", { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) throw new Error(res.error ?? "Create failed.");
      showToast("Recurring expense created.", "success");
      onSaved();
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Save failed.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SlideOverPanel open={open} onClose={onClose} title="New recurring expense">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Quick presets</label>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => applyPreset(p)}
                className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 hover:border-blue-200 hover:bg-blue-50"
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Description *</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            placeholder="e.g. Office Rent"
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Category *</label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            required
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="">Select category…</option>
            {groupedCategories.map(([group, items]) => (
              <optgroup key={group} label={group}>
                {items.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Amount (ZAR) *</label>
            <input
              type="text"
              inputMode="decimal"
              value={amountZar}
              onChange={(e) => setAmountZar(e.target.value)}
              placeholder="0.00"
              required
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Frequency *</label>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as RecurringExpenseFrequency)}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            >
              {FREQUENCIES.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Next run date *</label>
          <input
            type="date"
            value={nextRunDate}
            onChange={(e) => setNextRunDate(e.target.value)}
            required
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Payment method</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as ExpensePaymentMethod)}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {EXPENSE_PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Paid from account</label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">—</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Vendor</label>
          <select
            value={vendorId}
            onChange={(e) => {
              setVendorId(e.target.value);
              if (e.target.value) setNewVendorName("");
            }}
            className="mb-2 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="">Select or add new…</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          {!vendorId ? (
            <input
              type="text"
              value={newVendorName}
              onChange={(e) => setNewVendorName(e.target.value)}
              placeholder="New vendor name"
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            />
          ) : null}
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Branch *</label>
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            required
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="">Select branch…</option>
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={autoApprove} onChange={(e) => setAutoApprove(e.target.checked)} />
          Auto-create as approved expense on each run
        </label>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
          />
        </div>

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-md bg-[#408df7] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#3578d4] disabled:opacity-50"
          >
            {saving ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Create recurring expense"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-200 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </SlideOverPanel>
  );
}
