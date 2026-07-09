"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Upload, X } from "lucide-react";
import SlideOverPanel from "@/components/admin/SlideOverPanel";
import { adminFetch } from "@/hooks/useAdminData";
import { showToast } from "@/components/ui/notifications";
import type { ExpenseCategoryRow, ExpenseListItem, ExpensePaymentMethod } from "@/lib/admin/expenses/types";
import { EXPENSE_PAYMENT_METHOD_LABELS } from "@/lib/admin/expenses/types";

type City = { id: string; name: string };
type Vendor = { id: string; name: string };
type Account = { id: string; name: string };

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editItem?: ExpenseListItem | null;
};

const PAYMENT_METHODS = Object.keys(EXPENSE_PAYMENT_METHOD_LABELS) as ExpensePaymentMethod[];

function zarToCents(raw: string): number | null {
  const cleaned = raw.replace(/[R\s,]/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

export function ExpenseFormPanel({ open, onClose, onSaved, editItem }: Props) {
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [categories, setCategories] = useState<ExpenseCategoryRow[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const [expenseDate, setExpenseDate] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [amountZar, setAmountZar] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<ExpensePaymentMethod>("bank_transfer");
  const [accountId, setAccountId] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [newVendorName, setNewVendorName] = useState("");
  const [branchId, setBranchId] = useState("");
  const [bookingId, setBookingId] = useState("");
  const [notes, setNotes] = useState("");
  const [receiptPath, setReceiptPath] = useState<string | null>(null);
  const [receiptMime, setReceiptMime] = useState<string | null>(null);

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
    if (editItem) {
      setExpenseDate(editItem.expense_date);
      setCategoryId(editItem.category_id);
      setDescription(editItem.description);
      setAmountZar(String(editItem.amount_cents / 100));
      setPaymentMethod(editItem.payment_method);
      setAccountId(editItem.paid_from_account_id ?? "");
      setVendorId(editItem.vendor_id ?? "");
      setBranchId(editItem.branch_id);
      setBookingId(editItem.booking_id ?? "");
      setNotes(editItem.notes ?? "");
      setReceiptPath(editItem.receipt_path);
      setReceiptMime(editItem.receipt_mime);
    } else {
      setExpenseDate(new Date().toISOString().slice(0, 10));
      setCategoryId("");
      setDescription("");
      setAmountZar("");
      setPaymentMethod("bank_transfer");
      setAccountId("");
      setVendorId("");
      setNewVendorName("");
      setBranchId("");
      setBookingId("");
      setNotes("");
      setReceiptPath(null);
      setReceiptMime(null);
    }
  }, [open, editItem]);

  const groupedCategories = useMemo(() => {
    const map = new Map<string, ExpenseCategoryRow[]>();
    for (const c of categories) {
      const list = map.get(c.group_name) ?? [];
      list.push(c);
      map.set(c.group_name, list);
    }
    return [...map.entries()];
  }, [categories]);

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const token = (await import("@/hooks/useAdminData")).getAdminToken();
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/admin/expenses/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed.");
      setReceiptPath(data.path);
      setReceiptMime(data.mime);
      showToast("Receipt uploaded.", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Upload failed.", "error");
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cents = zarToCents(amountZar);
    if (!cents) {
      showToast("Enter a valid amount.", "error");
      return;
    }
    if (!categoryId || !description.trim() || !branchId) {
      showToast("Fill in all required fields.", "error");
      return;
    }

    setSaving(true);
    try {
      const body = {
        expense_date: expenseDate,
        category_id: categoryId,
        description: description.trim(),
        amount_cents: cents,
        payment_method: paymentMethod,
        paid_from_account_id: accountId || null,
        vendor_id: vendorId || null,
        vendor_name: !vendorId && newVendorName.trim() ? newVendorName.trim() : undefined,
        branch_id: branchId,
        booking_id: bookingId.trim() || null,
        notes: notes.trim() || null,
        receipt_path: receiptPath,
        receipt_mime: receiptMime,
      };

      if (editItem) {
        const res = await adminFetch(`/api/admin/expenses/${editItem.id}`, { method: "PATCH", body: JSON.stringify(body) });
        if (!res.ok) throw new Error(res.error ?? "Update failed.");
        showToast("Expense updated.", "success");
      } else {
        const res = await adminFetch("/api/admin/expenses", { method: "POST", body: JSON.stringify(body) });
        if (!res.ok) throw new Error(res.error ?? "Create failed.");
        showToast("Expense created (pending approval).", "success");
      }
      onSaved();
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Save failed.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SlideOverPanel open={open} onClose={onClose} title={editItem ? "Edit expense" : "New expense"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Date *</label>
          <input
            type="date"
            value={expenseDate}
            onChange={(e) => setExpenseDate(e.target.value)}
            required
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

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Description *</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
          />
        </div>

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

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Payment method *</label>
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

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Booking ID (optional)</label>
          <input
            type="text"
            value={bookingId}
            onChange={(e) => setBookingId(e.target.value)}
            placeholder="Link to booking for job-level profit"
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-mono text-xs"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Receipt</label>
          {receiptPath ? (
            <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              <span className="flex-1 truncate">Receipt attached</span>
              <button type="button" onClick={() => { setReceiptPath(null); setReceiptMime(null); }}>
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500 hover:border-blue-300 hover:bg-blue-50/50">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Upload image or PDF
              <input
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleUpload(f);
                }}
              />
            </label>
          )}
        </div>

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
            {saving ? "Saving…" : editItem ? "Update expense" : "Create expense"}
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
