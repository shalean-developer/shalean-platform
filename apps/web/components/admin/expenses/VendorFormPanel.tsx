"use client";

import { useEffect, useState } from "react";
import SlideOverPanel from "@/components/admin/SlideOverPanel";
import { adminFetch } from "@/hooks/useAdminData";
import { showToast } from "@/components/ui/notifications";
import type { ExpenseVendorRow } from "@/lib/admin/expenses/types";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editItem?: ExpenseVendorRow | null;
};

export function VendorFormPanel({ open, onClose, onSaved, editItem }: Props) {
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    if (editItem) {
      setName(editItem.name);
      setContactPerson(editItem.contact_person ?? "");
      setPhone(editItem.phone ?? "");
      setEmail(editItem.email ?? "");
      setAddress(editItem.address ?? "");
      setNotes(editItem.notes ?? "");
    } else {
      setName("");
      setContactPerson("");
      setPhone("");
      setEmail("");
      setAddress("");
      setNotes("");
    }
  }, [open, editItem]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      showToast("Vendor name is required.", "error");
      return;
    }

    setSaving(true);
    try {
      const body = {
        name: trimmedName,
        contact_person: contactPerson.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null,
        notes: notes.trim() || null,
      };

      if (editItem) {
        const res = await adminFetch(`/api/admin/expenses/vendors/${editItem.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(res.error ?? "Update failed.");
        showToast("Vendor updated.", "success");
      } else {
        const res = await adminFetch("/api/admin/expenses/vendors", {
          method: "POST",
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(res.error ?? "Create failed.");
        showToast("Vendor created.", "success");
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
    <SlideOverPanel open={open} onClose={onClose} title={editItem ? "Edit vendor" : "New vendor"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Vendor name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Contact person</label>
          <input
            type="text"
            value={contactPerson}
            onChange={(e) => setContactPerson(e.target.value)}
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Phone</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Address</label>
          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
          />
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
            {saving ? "Saving…" : editItem ? "Update vendor" : "Create vendor"}
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
