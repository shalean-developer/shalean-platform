"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ClipboardList, MapPin, RefreshCw, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { adminFetch, useAdminData } from "@/hooks/useAdminData";

type QueueRow = {
  id: string;
  status: string | null;
  fulfillment_mode: string | null;
  fulfillment_reason: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  suburb: string | null;
  service: string | null;
  service_slug: string | null;
  date: string | null;
  time: string | null;
  created_at: string;
  amount_paid_cents: number | null;
};

type OpsQueueResponse = {
  pendingAssignment: QueueRow[];
  areaReview: QueueRow[];
  counts: { pendingAssignment: number; areaReview: number };
};

export default function OpsQueuePage() {
  const [tab, setTab] = useState<"pending_assignment" | "area_review">("pending_assignment");
  const { data, loading, error, refetch } = useAdminData<OpsQueueResponse>("/api/admin/ops-queue");

  const rows = useMemo(() => {
    if (!data) return [];
    return tab === "pending_assignment" ? data.pendingAssignment : data.areaReview;
  }, [data, tab]);

  async function runAction(bookingId: string, action: "reject" | "contact_logged" | "convert_area_review") {
    const res = await adminFetch(`/api/admin/bookings/${bookingId}/fulfillment`, {
      method: "POST",
      body: JSON.stringify({ action }),
    });
    if (res.ok) refetch();
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Ops queue</h1>
          <p className="mt-1 text-sm text-slate-600">
            Pending Assignment (paid reserves) and Area Review (unpaid expansion leads).
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setTab("pending_assignment")}
          className={cn(
            "rounded-xl border p-4 text-left",
            tab === "pending_assignment" ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white",
          )}
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <UserCheck className="h-4 w-4" />
            Pending Assignment
          </div>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{data?.counts.pendingAssignment ?? "—"}</p>
        </button>
        <button
          type="button"
          onClick={() => setTab("area_review")}
          className={cn(
            "rounded-xl border p-4 text-left",
            tab === "area_review" ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white",
          )}
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <MapPin className="h-4 w-4" />
            Area Review
          </div>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{data?.counts.areaReview ?? "—"}</p>
        </button>
      </div>

      {loading ? <p className="text-sm text-slate-500">Loading queue…</p> : null}
      {error ? <p className="text-sm text-red-600">{String(error)}</p> : null}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 font-medium">Customer</th>
              <th className="px-3 py-2 font-medium">Suburb</th>
              <th className="px-3 py-2 font-medium">When</th>
              <th className="px-3 py-2 font-medium">Service</th>
              <th className="px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                  <ClipboardList className="mx-auto mb-2 h-5 w-5" />
                  Queue is clear.
                </td>
              </tr>
            ) : null}
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-3 py-3">
                  <div className="font-medium text-slate-900">{row.customer_name || row.customer_email || "—"}</div>
                  <div className="text-xs text-slate-500">{row.customer_phone || row.customer_email}</div>
                </td>
                <td className="px-3 py-3">{row.suburb || "—"}</td>
                <td className="px-3 py-3">
                  {row.date} {row.time}
                </td>
                <td className="px-3 py-3">{row.service_slug || row.service || "—"}</td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/office/bookings/${row.id}`}
                      className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white"
                    >
                      Open
                    </Link>
                    <button
                      type="button"
                      className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium"
                      onClick={() => void runAction(row.id, "contact_logged")}
                    >
                      Contact logged
                    </button>
                    {tab === "area_review" ? (
                      <button
                        type="button"
                        className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-800"
                        onClick={() => void runAction(row.id, "convert_area_review")}
                      >
                        Convert to pay
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700"
                      onClick={() => void runAction(row.id, "reject")}
                    >
                      Reject
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
