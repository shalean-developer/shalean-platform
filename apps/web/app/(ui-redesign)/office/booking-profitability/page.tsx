"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import {
  OfficeZohoPageHeader,
  OfficeZohoSecondaryButton,
  OfficeZohoTableShell,
} from "@/components/admin/office/OfficeZohoChrome";
import { useAdminData } from "@/hooks/useAdminData";
import { defaultOfficePayoutPeriodRange } from "@/lib/admin/payouts/officePayoutPeriodReport";
import { cn } from "@/lib/utils";

type BookingProfitItem = {
  booking_id: string;
  date: string;
  branch_name: string;
  service_name: string;
  customer_payment_cents: number;
  cleaner_payment_cents: number;
  booking_expenses_cents: number;
  processing_fees_cents: number;
  platform_fees_cents: number;
  net_booking_profit_cents: number;
  profit_margin_percent: number | null;
};

type Response = {
  items: BookingProfitItem[];
  pagination: { page: number; page_size: number; total: number };
};

function formatZar(cents: number): string {
  return `R ${Math.round(cents / 100).toLocaleString("en-ZA")}`;
}

export default function BookingProfitabilityPage() {
  const defaults = defaultOfficePayoutPeriodRange();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [page, setPage] = useState(1);

  const params = useMemo(() => ({ from, to, page: String(page) }), [from, to, page]);
  const { data, loading, error, refetch } = useAdminData<Response>("/api/admin/booking-profitability", { params });

  return (
    <div className="space-y-6 p-4 md:p-6">
      <OfficeZohoPageHeader
        title="Booking profitability"
        subtitle="Per-booking profit after cleaner cost, expenses, and fees"
        live
        actions={
          <>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-slate-200 px-3 py-2 text-sm" />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-slate-200 px-3 py-2 text-sm" />
            <OfficeZohoSecondaryButton onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" /> Refresh
            </OfficeZohoSecondaryButton>
          </>
        }
      />

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <OfficeZohoTableShell>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Branch</th>
              <th className="px-4 py-3">Service</th>
              <th className="px-4 py-3 text-right">Customer</th>
              <th className="px-4 py-3 text-right">Cleaner</th>
              <th className="px-4 py-3 text-right">Expenses</th>
              <th className="px-4 py-3 text-right">Gateway</th>
              <th className="px-4 py-3 text-right">Platform</th>
              <th className="px-4 py-3 text-right">Net profit</th>
              <th className="px-4 py-3 text-right">Margin</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-500">Loading…</td></tr>
            ) : (data?.items ?? []).length === 0 ? (
              <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-500">No bookings in range.</td></tr>
            ) : (
              data!.items.map((row) => (
                <tr key={row.booking_id} className="border-b border-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/office/bookings/${row.booking_id}`} className="font-medium text-[#408df7] hover:underline">
                      {row.date}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{row.branch_name}</td>
                  <td className="px-4 py-3 text-slate-600">{row.service_name}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatZar(row.customer_payment_cents)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatZar(row.cleaner_payment_cents)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatZar(row.booking_expenses_cents)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatZar(row.processing_fees_cents)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatZar(row.platform_fees_cents)}</td>
                  <td className={cn("px-4 py-3 text-right font-semibold tabular-nums", row.net_booking_profit_cents >= 0 ? "text-emerald-700" : "text-red-600")}>
                    {formatZar(row.net_booking_profit_cents)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.profit_margin_percent ?? "—"}%</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </OfficeZohoTableShell>

      {data?.pagination && data.pagination.total > data.pagination.page_size ? (
        <div className="flex justify-center gap-2">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded border px-3 py-1 text-sm disabled:opacity-50">Prev</button>
          <span className="px-2 py-1 text-sm text-slate-500">Page {page}</span>
          <button type="button" disabled={page * data.pagination.page_size >= data.pagination.total} onClick={() => setPage((p) => p + 1)} className="rounded border px-3 py-1 text-sm disabled:opacity-50">Next</button>
        </div>
      ) : null}
    </div>
  );
}
