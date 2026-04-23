"use client";

import { useState } from "react";
import { MapPin, Pencil, Trash2, Star } from "lucide-react";
import type { CustomerAddressRow } from "@/lib/dashboard/types";
import { useAddresses } from "@/hooks/useAddresses";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDashboardToast } from "@/components/dashboard/dashboard-toast-context";
import { DashboardListSkeleton } from "@/components/dashboard/dashboard-skeletons";

export default function DashboardAddressesPage() {
  const toast = useDashboardToast();
  const { addresses, loading, error, refetch, insertAddress, updateAddress, deleteAddress, setDefaultAddress } = useAddresses();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerAddressRow | null>(null);
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
    if (editing) {
      const r = await updateAddress(editing.id, {
        label: form.label,
        line1: form.line1,
        suburb: form.suburb,
        city: form.city,
        postal_code: form.postal_code,
        is_default: form.is_default,
      });
      if (!r.ok) {
        toast(r.message, "error");
        return;
      }
      toast("Address updated.", "success");
    } else {
      const r = await insertAddress({
        label: form.label,
        line1: form.line1,
        suburb: form.suburb,
        city: form.city,
        postal_code: form.postal_code,
        is_default: form.is_default,
      });
      if (!r.ok) {
        toast(r.message, "error");
        return;
      }
      toast("Address saved.", "success");
    }
    setDialogOpen(false);
    await refetch();
  }

  async function remove(id: string) {
    const r = await deleteAddress(id);
    if (!r.ok) {
      toast(r.message, "error");
      return;
    }
    toast("Address removed.", "success");
  }

  async function makeDefault(id: string) {
    const r = await setDefaultAddress(id);
    if (!r.ok) {
      toast(r.message, "error");
      return;
    }
    toast("Default address updated.", "success");
  }

  return (
    <div>
      <PageHeader
        title="Addresses"
        description="Save homes and offices for faster checkout."
        action={
          <Button type="button" size="lg" className="rounded-xl" onClick={openAdd}>
            Add address
          </Button>
        }
      />

      {error ? (
        <p className="mb-4 text-sm text-red-600">
          {error}{" "}
          <button type="button" className="font-semibold underline" onClick={() => void refetch()}>
            Retry
          </button>
        </p>
      ) : null}

      {loading ? (
        <DashboardListSkeleton rows={4} />
      ) : (
        <ul className="space-y-4">
          {addresses.map((a) => (
            <li key={a.id}>
              <Card className="rounded-2xl border-zinc-200/80 shadow-md dark:border-zinc-800 dark:bg-zinc-900">
                <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
                      <MapPin className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-zinc-900 dark:text-zinc-50">{a.label}</p>
                        {a.is_default ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-950/60 dark:text-amber-200">
                            <Star className="h-3 w-3" />
                            Default
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{a.line1}</p>
                      <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        {a.suburb}, {a.city} {a.postal_code}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!a.is_default ? (
                      <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => void makeDefault(a.id)}>
                        Set default
                      </Button>
                    ) : null}
                    <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => openEdit(a)}>
                      <Pencil className="h-4 w-4" />
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-xl text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                      onClick={() => void remove(a.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit address" : "New address"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="addr-label">Label</Label>
              <Input id="addr-label" value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="Home, Office…" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="addr-line1">Street</Label>
              <Input id="addr-line1" value={form.line1} onChange={(e) => setForm((f) => ({ ...f, line1: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="addr-suburb">Suburb</Label>
                <Input id="addr-suburb" value={form.suburb} onChange={(e) => setForm((f) => ({ ...f, suburb: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="addr-postal">Postal code</Label>
                <Input id="addr-postal" value={form.postal_code} onChange={(e) => setForm((f) => ({ ...f, postal_code: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="addr-city">City</Label>
              <Input id="addr-city" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <input type="checkbox" checked={form.is_default} onChange={(e) => setForm((f) => ({ ...f, is_default: e.target.checked }))} />
              Set as default
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" className="rounded-xl" onClick={() => void saveAddress()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
