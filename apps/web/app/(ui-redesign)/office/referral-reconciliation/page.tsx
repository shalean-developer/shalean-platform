"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import {
  OfficeZohoPageHeader,
  OfficeZohoSecondaryButton,
  OfficeZohoTableShell,
} from "@/components/admin/office/OfficeZohoChrome";
import { adminFetch } from "@/hooks/useAdminData";
import { useAdminData } from "@/hooks/useAdminData";
import { emitAdminToast } from "@/lib/admin/toastBus";
import { Button } from "@/components/ui/button";

type ReconItem = {
  booking_id: string;
  date: string | null;
  customer_email: string | null;
  customer_name: string | null;
  total_paid_zar: number | null;
  status: string | null;
  paystack_reference: string | null;
  created_at: string;
};

type Response = {
  items: ReconItem[];
  pagination: { page: number; page_size: number; total: number };
};

export default function ReferralReconciliationPage() {
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const { data, loading, error, refetch } = useAdminData<Response>("/api/admin/referrals/reconciliation", {
    params: { page: String(page) },
  });

  async function resolve(bookingId: string) {
    setBusy(bookingId);
    try {
      const res = await adminFetch("/api/admin/referrals/reconciliation", {
        method: "PATCH",
        body: JSON.stringify({ bookingId, action: "resolve" }),
      });
      if (!res.ok) throw new Error(res.error ?? "Could not resolve.");
      emitAdminToast("Marked as resolved.", "success");
      await refetch();
    } catch (e) {
      emitAdminToast(e instanceof Error ? e.message : "Failed.", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <OfficeZohoPageHeader
        title="Referral reconciliation"
        subtitle="Bookings where Paystack succeeded but referral discount redemption could not be persisted"
        actions={
          <OfficeZohoSecondaryButton onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </OfficeZohoSecondaryButton>
        }
      />

      <p className="text-sm text-slate-600">
        Review each booking in{" "}
        <Link href="/office/payment-reconciliation" className="font-medium text-blue-600 underline">
          payment reconciliation
        </Link>{" "}
        and finance reports, then mark resolved once corrected.
      </p>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <OfficeZohoTableShell>
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Paid</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(data?.items ?? []).map((row) => (
                <tr key={row.booking_id} className="border-b border-slate-50">
                  <td className="px-4 py-3">{row.date ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div>{row.customer_name ?? "—"}</div>
                    <div className="text-xs text-slate-500">{row.customer_email ?? ""}</div>
                  </td>
                  <td className="px-4 py-3">R {Number(row.total_paid_zar ?? 0).toLocaleString("en-ZA")}</td>
                  <td className="px-4 py-3">{row.status ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{row.paystack_reference ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/office/bookings?highlight=${row.booking_id}`}>
                        <Button size="sm" variant="outline" className="h-8 gap-1 text-xs">
                          <ExternalLink className="h-3 w-3" /> Booking
                        </Button>
                      </Link>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1 text-xs"
                        disabled={busy === row.booking_id}
                        onClick={() => void resolve(row.booking_id)}
                      >
                        <CheckCircle2 className="h-3 w-3" /> Resolve
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && !(data?.items?.length) ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-500">No items in the reconciliation queue.</td></tr>
              ) : null}
            </tbody>
          </table>
        )}
      </OfficeZohoTableShell>

      {(data?.pagination.total ?? 0) > (data?.pagination.page_size ?? 50) ? (
        <div className="flex justify-center gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="py-2 text-sm text-slate-600">Page {page}</span>
          <Button size="sm" variant="outline" disabled={(data?.items?.length ?? 0) < (data?.pagination.page_size ?? 50)} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      ) : null}
    </div>
  );
}
