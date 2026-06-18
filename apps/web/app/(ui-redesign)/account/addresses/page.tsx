"use client";

import { useState } from "react";
import { Home, MapPin, Plus } from "lucide-react";
import type { CustomerAddressRow } from "@/lib/dashboard/types";
import { useAddresses } from "@/hooks/useAddresses";
import { PropertyCard } from "@/components/account/PropertyCard";
import { HelpCard } from "@/components/account/HelpCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDashboardToast } from "@/components/dashboard/dashboard-toast-context";

export default function AccountAddressesPage() {
  const toast = useDashboardToast();
  const { addresses, loading, error, refetch, insertAddress, updateAddress, deleteAddress, setDefaultAddress } =
    useAddresses();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerAddressRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    label: "",
    line1: "",
    suburb: "",
    city: "Cape Town",
    postal_code: "",
    is_default: false,
  });

  function openAdd() {
    setEditing(null);
    setForm({
      label: "",
      line1: "",
      suburb: "",
      city: "Cape Town",
      postal_code: "",
      is_default: addresses.length === 0,
    });
    setDialogOpen(true);
  }

  function openEdit(a: CustomerAddressRow) {
    setEditing(a);
    setForm({
      label: a.label,
      line1: a.line1,
      suburb: a.suburb,
      city: a.city,
      postal_code: a.postal_code,
      is_default: a.is_default,
    });
    setDialogOpen(true);
  }

  async function saveAddress() {
    setBusy(true);
    if (editing) {
      const r = await updateAddress(editing.id, form);
      if (!r.ok) { toast(r.message, "error"); setBusy(false); return; }
      toast("Property updated.", "success");
    } else {
      const r = await insertAddress(form);
      if (!r.ok) { toast(r.message, "error"); setBusy(false); return; }
      toast("Property saved.", "success");
    }
    setBusy(false);
    setDialogOpen(false);
    await refetch();
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Remove this property?")) return;
    const r = await deleteAddress(id);
    toast(r.ok ? "Property removed." : r.message, r.ok ? "success" : "error");
  }

  async function handleSetDefault(id: string) {
    const r = await setDefaultAddress(id);
    toast(r.ok ? "Primary property updated." : r.message, r.ok ? "success" : "error");
  }

  return (
    <div className="space-y-8 pb-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">My Properties</h1>
          <p className="mt-1 text-sm text-gray-500">
            Save your homes and offices for faster checkout and smoother bookings.
          </p>
        </div>
        <Button type="button" className="rounded-xl bg-blue-600 px-5 text-white hover:bg-blue-700" onClick={openAdd}>
          <Plus className="mr-2 h-4 w-4" />
          Add property
        </Button>
      </div>

      {/* Error */}
      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}{" "}
          <button type="button" className="font-semibold underline" onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      ) : null}

      {/* Properties list */}
      {loading ? (
        <div className="space-y-4 animate-pulse">
          {[1, 2].map((i) => <div key={i} className="h-28 rounded-2xl bg-gray-100" />)}
        </div>
      ) : addresses.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white p-12 text-center shadow-sm">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50">
            <Home className="h-8 w-8 text-blue-400" strokeWidth={1.5} />
          </div>
          <h2 className="mt-5 text-lg font-semibold text-gray-900">No properties saved yet</h2>
          <p className="mt-2 max-w-xs text-sm text-gray-500">
            Add your home or office address so we always know where to send your cleaner.
          </p>
          <Button
            type="button"
            size="lg"
            className="mt-6 rounded-xl bg-blue-600 text-white hover:bg-blue-700"
            onClick={openAdd}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add your first property
          </Button>
        </div>
      ) : (
        <section>
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">
            {addresses.length} {addresses.length === 1 ? "property" : "properties"} saved
          </p>
          <ul className="space-y-4">
            {addresses.map((a) => (
              <li key={a.id}>
                <PropertyCard
                  address={a}
                  onEdit={openEdit}
                  onDelete={(id) => void handleDelete(id)}
                  onSetDefault={(id) => void handleSetDefault(id)}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Why save properties */}
      {addresses.length === 0 ? null : (
        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600">
              <MapPin className="h-5 w-5 text-white" strokeWidth={1.75} />
            </div>
            <div>
              <p className="font-semibold text-blue-900">Tip: Save multiple addresses</p>
              <p className="mt-1 text-sm text-blue-700">
                Add your home, holiday property, or office so switching between locations is instant at checkout.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Help */}
      <HelpCard />

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit property" : "Add new property"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="addr-label">Label</Label>
              <Input
                id="addr-label"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="Home, Office, Holiday flat…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="addr-line1">Street address</Label>
              <Input
                id="addr-line1"
                value={form.line1}
                onChange={(e) => setForm((f) => ({ ...f, line1: e.target.value }))}
                placeholder="10 Example Road"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="addr-suburb">Suburb</Label>
                <Input
                  id="addr-suburb"
                  value={form.suburb}
                  onChange={(e) => setForm((f) => ({ ...f, suburb: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="addr-postal">Postal code</Label>
                <Input
                  id="addr-postal"
                  value={form.postal_code}
                  onChange={(e) => setForm((f) => ({ ...f, postal_code: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="addr-city">City</Label>
              <Input
                id="addr-city"
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                className="rounded"
                checked={form.is_default}
                onChange={(e) => setForm((f) => ({ ...f, is_default: e.target.checked }))}
              />
              Set as primary property
            </label>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => setDialogOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="rounded-xl bg-blue-600 text-white hover:bg-blue-700"
              onClick={() => void saveAddress()}
              disabled={busy}
            >
              {busy ? "Saving…" : "Save property"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
