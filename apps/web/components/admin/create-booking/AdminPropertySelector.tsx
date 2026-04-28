"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Plus, Search } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import type { CustomerAddressRow } from "@/lib/dashboard/types";
import {
  buildAdminBookingLocationString,
  formatSavedAddressOptionLabel,
} from "@/lib/admin/buildBookingLocationFromSavedAddress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type AdminPropertySelectorProps = {
  userId: string | null;
  /** Selected `customer_saved_addresses.id`, or "". */
  value: string;
  useCustomAddress: boolean;
  location: string;
  disabled?: boolean;
  onUseCustomAddressChange: (useCustom: boolean) => void;
  /** Called with the full row when a saved property is chosen. */
  onChange: (address: CustomerAddressRow) => void;
  onLocationChange: (v: string) => void;
  onAddressesLoaded?: (addresses: CustomerAddressRow[]) => void;
};

export function AdminPropertySelector({
  userId,
  value,
  useCustomAddress,
  location,
  disabled = false,
  onUseCustomAddressChange,
  onChange,
  onLocationChange,
  onAddressesLoaded,
}: AdminPropertySelectorProps) {
  const [addresses, setAddresses] = useState<CustomerAddressRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addLabel, setAddLabel] = useState("");
  const [addLine1, setAddLine1] = useState("");
  const [addSuburb, setAddSuburb] = useState("");
  const [addPostcode, setAddPostcode] = useState("");
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const onAddressesLoadedRef = useRef(onAddressesLoaded);
  useEffect(() => {
    onAddressesLoadedRef.current = onAddressesLoaded;
  }, [onAddressesLoaded]);

  const loadAddresses = useCallback(async () => {
    if (!userId) {
      setAddresses([]);
      onAddressesLoadedRef.current?.([]);
      return;
    }
    setLoading(true);
    try {
      const sb = getSupabaseBrowser();
      const token = (await sb?.auth.getSession())?.data.session?.access_token;
      if (!token) {
        setAddresses([]);
        onAddressesLoadedRef.current?.([]);
        return;
      }
      const res = await fetch(`/api/admin/bookings/customer-saved-addresses?user_id=${encodeURIComponent(userId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json().catch(() => ({}))) as { addresses?: CustomerAddressRow[]; error?: string };
      const rows = Array.isArray(json.addresses) ? json.addresses : [];
      setAddresses(rows);
      onAddressesLoadedRef.current?.(rows);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch list when userId changes
    void loadAddresses();
  }, [loadAddresses]);

  const q = filter.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return addresses;
    return addresses.filter((a) => {
      const hay = `${a.label} ${a.line1} ${a.suburb}`.toLowerCase();
      return hay.includes(q);
    });
  }, [addresses, q]);

  const resetAddForm = () => {
    setAddLabel("");
    setAddLine1("");
    setAddSuburb("");
    setAddPostcode("");
    setAddError(null);
  };

  const submitAdd = async () => {
    if (!userId) return;
    setAddError(null);
    setAddSaving(true);
    try {
      const sb = getSupabaseBrowser();
      const token = (await sb?.auth.getSession())?.data.session?.access_token;
      if (!token) {
        setAddError("Not signed in.");
        return;
      }
      const res = await fetch(`/api/admin/customers/${encodeURIComponent(userId)}/addresses`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          label: addLabel.trim(),
          line1: addLine1.trim(),
          suburb: addSuburb.trim(),
          postal_code: addPostcode.trim() || undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { address?: CustomerAddressRow; error?: string };
      if (!res.ok) {
        setAddError(typeof json.error === "string" ? json.error : "Could not create property.");
        return;
      }
      const row = json.address;
      if (!row?.id) {
        setAddError("Missing new property in response.");
        return;
      }
      setAddOpen(false);
      resetAddForm();
      await loadAddresses();
      onUseCustomAddressChange(false);
      onChange(row);
    } finally {
      setAddSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-base font-medium text-zinc-900 dark:text-zinc-50">My properties</Label>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Select a saved property or add a new one</p>
      </div>

      <label className="flex cursor-pointer items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 shrink-0 rounded border-zinc-300"
          checked={useCustomAddress}
          disabled={disabled}
          onChange={(e) => onUseCustomAddressChange(e.target.checked)}
        />
        <span>Use custom address</span>
      </label>

      {useCustomAddress ? (
        <div className="space-y-1">
          <Label htmlFor="location-custom" className="text-xs text-zinc-600 dark:text-zinc-400">
            Service location (sent to cleaners)
          </Label>
          <Input
            id="location-custom"
            value={location}
            onChange={(e) => onLocationChange(e.target.value)}
            disabled={disabled}
            autoComplete="street-address"
          />
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[12rem] flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden />
              <Input
                className="pl-8"
                placeholder="Search by name, street, or suburb…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                disabled={disabled || loading}
                autoComplete="off"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 gap-1"
              disabled={disabled || !userId || loading}
              onClick={() => {
                resetAddForm();
                setAddOpen(true);
              }}
            >
              <Plus className="h-4 w-4" aria-hidden />
              Add property
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Loading properties…
            </div>
          ) : addresses.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-3 py-4 text-sm text-zinc-600 dark:border-zinc-600 dark:bg-zinc-900/40 dark:text-zinc-300">
              No properties yet. Add one to speed up bookings.
            </p>
          ) : (
            <ul
              className="max-h-52 space-y-1 overflow-auto rounded-lg border border-zinc-200 p-1 dark:border-zinc-700"
              role="listbox"
            >
              {filtered.length === 0 ? (
                <li className="px-2 py-3 text-center text-xs text-zinc-500">No matches for that search.</li>
              ) : (
                filtered.map((a) => {
                  const selected = value === a.id;
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={selected}
                        disabled={disabled}
                        onClick={() => onChange(a)}
                        className={cn(
                          "flex w-full rounded-md px-2 py-2 text-left text-sm transition-colors",
                          selected
                            ? "bg-blue-50 font-medium text-blue-950 dark:bg-blue-950/50 dark:text-blue-50"
                            : "text-zinc-800 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800/80",
                          disabled && "pointer-events-none opacity-50",
                        )}
                      >
                        {formatSavedAddressOptionLabel(a)}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          )}

          {value && !useCustomAddress ? (
            <p className="text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
              Sent to cleaners as:{" "}
              <span className="font-medium text-zinc-700 dark:text-zinc-200">
                {(() => {
                  const row = addresses.find((x) => x.id === value);
                  return row ? buildAdminBookingLocationString(row) : "—";
                })()}
              </span>
            </p>
          ) : null}
        </div>
      )}

      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open);
          if (!open) {
            resetAddForm();
          }
        }}
      >
        <DialogContent onPointerDownOutside={(e) => addSaving && e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Add property</DialogTitle>
            <DialogDescription>Saved to this customer&apos;s account. Appears on their dashboard addresses.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1">
              <Label htmlFor="add-prop-label">Property name</Label>
              <Input
                id="add-prop-label"
                value={addLabel}
                onChange={(e) => setAddLabel(e.target.value)}
                disabled={addSaving}
                placeholder="e.g. Sea Point Studio"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="add-prop-line1">Line 1</Label>
              <Input
                id="add-prop-line1"
                value={addLine1}
                onChange={(e) => setAddLine1(e.target.value)}
                disabled={addSaving}
                placeholder="Street and number"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="add-prop-suburb">Suburb</Label>
              <Input
                id="add-prop-suburb"
                value={addSuburb}
                onChange={(e) => setAddSuburb(e.target.value)}
                disabled={addSaving}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="add-prop-post">Postcode (optional)</Label>
              <Input
                id="add-prop-post"
                value={addPostcode}
                onChange={(e) => setAddPostcode(e.target.value)}
                disabled={addSaving}
              />
            </div>
            {addError ? (
              <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                {addError}
              </p>
            ) : null}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" disabled={addSaving} onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={addSaving || !addLabel.trim() || !addLine1.trim() || !addSuburb.trim()}
              onClick={() => void submitAdd()}
            >
              {addSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  Saving…
                </>
              ) : (
                "Save property"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
