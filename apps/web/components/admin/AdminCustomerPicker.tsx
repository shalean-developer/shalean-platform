"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { adminFetch, getAdminToken } from "@/hooks/useAdminData";

type CustomerHit = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone?: string | null;
  billing_type: string;
  schedule_type: string;
};

export type AdminCustomerPickerValue = {
  customerId: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
};

type AdminCustomerPickerProps = {
  value: AdminCustomerPickerValue;
  onChange: (value: AdminCustomerPickerValue) => void;
  disabled?: boolean;
  createCustomerHref?: string;
};

function billingLabel(t: string): string {
  const v = t.trim().toLowerCase();
  if (v === "monthly") return "Monthly invoice";
  return "Per booking";
}

function scheduleLabel(t: string): string {
  const v = t.trim().toLowerCase();
  if (v === "recurring") return "Recurring";
  return "On demand";
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

export function AdminCustomerPicker({
  value,
  onChange,
  disabled = false,
  createCustomerHref = "/admin/customers/create",
}: AdminCustomerPickerProps) {
  const [customerQuery, setCustomerQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerHit | null>(null);
  const [searchHits, setSearchHits] = useState<CustomerHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      searchAbortRef.current?.abort();
    };
  }, []);

  const searchCustomers = useCallback(async (q: string) => {
    searchAbortRef.current?.abort();
    const t = q.trim();
    if (t.length < 2) {
      if (!mountedRef.current) return;
      setSearchHits([]);
      setSearchError(null);
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    searchAbortRef.current = controller;
    if (!mountedRef.current) return;
    setSearching(true);
    setSearchError(null);

    try {
      const digits = t.replace(/\D/g, "");
      const looksLikePhone = digits.length >= 9 || t.startsWith("+");
      const url = looksLikePhone
        ? `/api/admin/bookings/customers?phone=${encodeURIComponent(t)}`
        : `/api/admin/bookings/customers?q=${encodeURIComponent(t)}`;

      const token = await getAdminToken();
      if (!token || controller.signal.aborted) return;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;

      const json = (await res.json().catch(() => ({}))) as {
        customers?: CustomerHit[];
        error?: string;
      };
      if (!res.ok) {
        if (!mountedRef.current || controller.signal.aborted) return;
        setSearchHits([]);
        setSearchError(json.error ?? "Could not search customers.");
        return;
      }
      if (!mountedRef.current || controller.signal.aborted) return;
      setSearchHits(json.customers ?? []);
    } catch (err) {
      if (isAbortError(err) || controller.signal.aborted || !mountedRef.current) return;
      setSearchHits([]);
      setSearchError(
        err instanceof TypeError && err.message === "Failed to fetch"
          ? "Network error — check your connection and try again."
          : "Could not search customers.",
      );
    } finally {
      if (!controller.signal.aborted && mountedRef.current) setSearching(false);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void searchCustomers(customerQuery), 300);
    return () => {
      window.clearTimeout(t);
      searchAbortRef.current?.abort();
    };
  }, [customerQuery, searchCustomers]);

  async function hydrateCustomerFields(hit: CustomerHit) {
    setSearchError(null);
    let enriched = hit;
    const res = await adminFetch<{ customers?: CustomerHit[] }>(
      `/api/admin/bookings/customers?id=${encodeURIComponent(hit.id)}`,
    );
    if (res.ok && res.data?.customers?.[0]) {
      enriched = { ...hit, ...res.data.customers[0] };
    } else if (!res.ok && res.error) {
      setSearchError(res.error);
    }
    setSelectedCustomer(enriched);
    setCustomerQuery(enriched.email ?? enriched.full_name ?? enriched.id);
    setSearchHits([]);
    onChange({
      customerId: enriched.id,
      customerName: enriched.full_name ?? "",
      customerEmail: enriched.email ?? "",
      customerPhone: enriched.phone ?? "",
    });
  }

  function clearSelectedCustomer() {
    setSelectedCustomer(null);
    setCustomerQuery("");
    setSearchHits([]);
    setSearchError(null);
    onChange({
      customerId: null,
      customerName: "",
      customerEmail: "",
      customerPhone: "",
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2 sm:col-span-2">
        <span className="block text-sm text-slate-600">Search customer</span>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <input
            type="search"
            placeholder="Search by name, email, or phone…"
            value={customerQuery}
            onChange={(e) => {
              setCustomerQuery(e.target.value);
              setSelectedCustomer(null);
              setSearchError(null);
              onChange({
                ...value,
                customerId: null,
              });
            }}
            disabled={disabled}
            autoComplete="off"
            className="mt-1 w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3"
          />
        </div>
        {searching ? (
          <p className="text-xs text-slate-500">Searching…</p>
        ) : searchError ? (
          <p className="text-xs text-red-600">{searchError}</p>
        ) : searchHits.length > 0 && !selectedCustomer ? (
          <ul className="max-h-48 overflow-auto rounded-xl border border-slate-200">
            {searchHits.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  className="flex w-full flex-col items-start gap-0.5 border-b border-slate-100 px-3 py-2 text-left text-sm last:border-0 hover:bg-slate-50"
                  onClick={() => void hydrateCustomerFields(h)}
                >
                  <span className="font-medium text-slate-900">{h.full_name ?? "—"}</span>
                  <span className="text-xs text-slate-500">{h.email ?? h.id}</span>
                  <span className="text-[11px] text-slate-400">
                    Billing: {billingLabel(h.billing_type)} · Schedule: {scheduleLabel(h.schedule_type)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : customerQuery.trim().length >= 2 && !selectedCustomer && !searching ? (
          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
            <p className="text-slate-600">
              No customers found. Enter details manually below or{" "}
              <Link
                href={(() => {
                  const raw = customerQuery.trim();
                  const digits = raw.replace(/\D/g, "");
                  const looksLikePhone = digits.length >= 9 || raw.startsWith("+");
                  if (looksLikePhone) {
                    return `${createCustomerHref}?phone=${encodeURIComponent(raw)}`;
                  }
                  if (raw.includes("@")) {
                    return `${createCustomerHref}?email=${encodeURIComponent(raw)}`;
                  }
                  return `${createCustomerHref}?full_name=${encodeURIComponent(raw)}`;
                })()}
                className="font-medium text-blue-600 hover:underline"
              >
                create a new customer
              </Link>
              .
            </p>
          </div>
        ) : null}
        {selectedCustomer ? (
          <div className="flex items-start justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <div>
              <p className="font-medium text-slate-900">
                {selectedCustomer.full_name ?? "—"}{" "}
                <span className="font-normal text-slate-500">
                  ({selectedCustomer.email ?? selectedCustomer.id})
                </span>
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                Billing: {billingLabel(selectedCustomer.billing_type)} · Schedule:{" "}
                {scheduleLabel(selectedCustomer.schedule_type)}
              </p>
            </div>
            <button
              type="button"
              className="shrink-0 text-xs text-slate-500 hover:text-slate-700"
              onClick={clearSelectedCustomer}
              disabled={disabled}
            >
              Clear
            </button>
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-slate-600">Customer name</span>
          <input
            required
            value={value.customerName}
            onChange={(e) => {
              setSelectedCustomer(null);
              onChange({
                ...value,
                customerId: null,
                customerName: e.target.value,
              });
            }}
            disabled={disabled}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">Email</span>
          <input
            required
            type="email"
            value={value.customerEmail}
            onChange={(e) => {
              setSelectedCustomer(null);
              onChange({
                ...value,
                customerId: null,
                customerEmail: e.target.value,
              });
            }}
            disabled={disabled}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">Phone (optional)</span>
          <input
            type="tel"
            value={value.customerPhone}
            onChange={(e) =>
              onChange({
                ...value,
                customerPhone: e.target.value,
              })
            }
            disabled={disabled}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
          />
        </label>
      </div>
    </div>
  );
}
