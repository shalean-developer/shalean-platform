"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertCircle,
  Building2,
  Download,
  Mail,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  User,
} from "lucide-react";
import {
  OfficeZohoMetricCard,
  OfficeZohoMetricsRow,
  OfficeZohoPageHeader,
  OfficeZohoPrimaryButton,
  OfficeZohoSecondaryButton,
  OfficeZohoTableShell,
} from "@/components/admin/office/OfficeZohoChrome";
import { VendorFormPanel } from "@/components/admin/expenses/VendorFormPanel";
import { useAdminData, adminFetch } from "@/hooks/useAdminData";
import { confirm, showToast } from "@/components/ui/notifications";
import { downloadCsv, rowsToCsv } from "@/lib/admin/csvExport";
import type { ExpenseVendorRow } from "@/lib/admin/expenses/types";

type VendorsResponse = {
  vendors: ExpenseVendorRow[];
};

function formatZar(cents: number): string {
  return `R ${Math.round(cents / 100).toLocaleString("en-ZA")}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

export default function ExpenseVendorsPage() {
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState<ExpenseVendorRow | null>(null);

  const params = useMemo(() => {
    const p: Record<string, string> = {};
    if (search.trim()) p.search = search.trim();
    return p;
  }, [search]);

  const { data, loading, error, refetch } = useAdminData<VendorsResponse>("/api/admin/expenses/vendors", { params });
  const vendors = data?.vendors ?? [];

  const totals = useMemo(() => {
    let expenseCount = 0;
    let totalSpent = 0;
    for (const v of vendors) {
      expenseCount += v.expense_count ?? 0;
      totalSpent += v.total_spent_cents ?? 0;
    }
    return { vendorCount: vendors.length, expenseCount, totalSpent };
  }, [vendors]);

  async function handleDelete(vendor: ExpenseVendorRow) {
    const ok = await confirm({
      title: "Delete vendor?",
      description: `Remove "${vendor.name}"? Linked expenses will keep their records but lose the vendor association.`,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    try {
      const res = await adminFetch(`/api/admin/expenses/vendors/${vendor.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(res.error ?? "Delete failed.");
      showToast("Vendor deleted.", "success");
      refetch();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Delete failed.", "error");
    }
  }

  function exportCsv() {
    const headers = ["name", "contact_person", "phone", "email", "address", "expense_count", "total_spent_zar", "notes"];
    const rows = vendors.map((v) => ({
      name: v.name,
      contact_person: v.contact_person ?? "",
      phone: v.phone ?? "",
      email: v.email ?? "",
      address: v.address ?? "",
      expense_count: v.expense_count ?? 0,
      total_spent_zar: formatZar(v.total_spent_cents ?? 0),
      notes: v.notes ?? "",
    }));
    downloadCsv("expense-vendors.csv", rowsToCsv(headers, rows));
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <OfficeZohoPageHeader
        title="Vendors"
        subtitle="Manage suppliers and service providers for operating expenses"
        actions={
          <>
            <Link href="/office/expenses">
              <OfficeZohoSecondaryButton>← Expenses</OfficeZohoSecondaryButton>
            </Link>
            <OfficeZohoSecondaryButton onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </OfficeZohoSecondaryButton>
            <OfficeZohoPrimaryButton
              onClick={() => {
                setEditItem(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              New vendor
            </OfficeZohoPrimaryButton>
          </>
        }
      />

      <OfficeZohoMetricsRow>
        <OfficeZohoMetricCard icon={Building2} label="Total vendors" value={loading ? "—" : totals.vendorCount} />
        <OfficeZohoMetricCard icon={User} label="Linked expenses" value={loading ? "—" : totals.expenseCount} />
        <OfficeZohoMetricCard icon={Building2} label="Approved spend" value={loading ? "—" : formatZar(totals.totalSpent)} />
      </OfficeZohoMetricsRow>

      <OfficeZohoTableShell>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/40 px-4 py-3">
          <div className="relative min-w-[220px] flex-1 sm:max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search vendors…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white py-2 pl-9 pr-4 text-sm"
            />
          </div>
          <OfficeZohoSecondaryButton onClick={exportCsv} disabled={vendors.length === 0}>
            <Download className="h-4 w-4" />
            Export CSV
          </OfficeZohoSecondaryButton>
        </div>

        {error ? (
          <div className="flex items-center gap-2 p-6 text-sm text-red-600">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Vendor</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3 text-right">Expenses</th>
                  <th className="px-4 py-3 text-right">Approved spend</th>
                  <th className="px-4 py-3">Added</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                      Loading…
                    </td>
                  </tr>
                ) : vendors.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                      No vendors found. Create one or add vendors when logging expenses.
                    </td>
                  </tr>
                ) : (
                  vendors.map((vendor) => (
                    <tr key={vendor.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{vendor.name}</p>
                        {vendor.address ? (
                          <p className="mt-0.5 max-w-[200px] truncate text-xs text-slate-500">{vendor.address}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{vendor.contact_person ?? "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {vendor.phone ? (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="h-3.5 w-3.5 text-slate-400" />
                            {vendor.phone}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {vendor.email ? (
                          <span className="inline-flex items-center gap-1">
                            <Mail className="h-3.5 w-3.5 text-slate-400" />
                            {vendor.email}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">{vendor.expense_count ?? 0}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">
                        {formatZar(vendor.total_spent_cents ?? 0)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{formatDate(vendor.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditItem(vendor);
                              setFormOpen(true);
                            }}
                            className="rounded p-1 text-slate-400 hover:bg-slate-100"
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(vendor)}
                            className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </OfficeZohoTableShell>

      <VendorFormPanel
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditItem(null);
        }}
        onSaved={refetch}
        editItem={editItem}
      />
    </div>
  );
}
