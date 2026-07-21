"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import {
  OfficeZohoPageHeader,
  OfficeZohoPrimaryButton,
  OfficeZohoSecondaryButton,
  OfficeZohoTableShell,
} from "@/components/admin/office/OfficeZohoChrome";
import { adminFetch, useAdminData } from "@/hooks/useAdminData";
import { confirm, prompt, showToast } from "@/components/ui/notifications";
import { cn } from "@/lib/utils";
import type { MoneyActionProposalListItem } from "@/lib/payout/moneyActionProposalTypes";

type ListResponse = {
  items: MoneyActionProposalListItem[];
  total: number;
  page: number;
  page_size: number;
  error?: string;
};

const STATUS_CLS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  processing: "bg-sky-100 text-sky-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-700",
  expired: "bg-slate-100 text-slate-600",
  failed: "bg-rose-100 text-rose-800",
};

function formatZar(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return "—";
  return `R ${Math.round(cents / 100).toLocaleString("en-ZA")}`;
}

function formatTs(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-ZA", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function actionLabel(actionType: string): string {
  if (actionType === "adjust_team_payout_earnings") return "Team visit earnings";
  if (actionType === "adjust_payout_earnings") return "Visit earnings";
  if (actionType === "reprice_booking_details") return "Booking reprice";
  return actionType;
}

export default function OfficePayoutApprovalsClient() {
  const searchParams = useSearchParams();
  const highlight = searchParams.get("highlight")?.trim() || "";

  const [statusFilter, setStatusFilter] = useState("pending");
  const [actionFilter, setActionFilter] = useState("");
  const [cleanerId, setCleanerId] = useState("");
  const [proposerId, setProposerId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const pageSize = 25;

  const params = useMemo(() => {
    const p: Record<string, string> = {
      page: String(page),
      page_size: String(pageSize),
      status: statusFilter || "pending",
    };
    if (actionFilter) p.action_type = actionFilter;
    if (cleanerId.trim()) p.cleaner_id = cleanerId.trim();
    if (proposerId.trim()) p.proposed_by = proposerId.trim();
    if (fromDate) p.from = fromDate;
    if (toDate) p.to = toDate;
    return p;
  }, [statusFilter, actionFilter, cleanerId, proposerId, fromDate, toDate, page]);

  const { data, loading, error, refetch } = useAdminData<ListResponse>(
    "/api/admin/money-action-proposals",
    { params },
  );

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (!highlight) return;
    const el = document.getElementById(`proposal-${highlight}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlight, items]);

  const handleApprove = useCallback(
    async (item: MoneyActionProposalListItem) => {
      if (!item.can_review) {
        showToast("You cannot approve this proposal.", "error");
        return;
      }
      const ok = await confirm({
        title: "Approve earnings change?",
        description: `${item.cleaner_name ?? "Cleaner"} · ${formatZar(item.original_total_cents)} → ${formatZar(item.proposed_total_cents)} (${formatZar(item.difference_cents)}). Stored proposal payload will be applied.`,
        confirmLabel: "Approve",
      });
      if (!ok) return;

      setBusyId(item.id);
      const res = await adminFetch(`/api/admin/money-action-proposals/${encodeURIComponent(item.id)}/approve`, {
        method: "POST",
        body: JSON.stringify({ confirm: true }),
      });
      setBusyId(null);

      if (!res.ok) {
        showToast(res.error ?? "Approve failed.", "error");
        await refetch();
        return;
      }
      showToast("Approved — earnings updated from stored proposal.", "success");
      await refetch();
    },
    [refetch],
  );

  const handleReject = useCallback(
    async (item: MoneyActionProposalListItem) => {
      if (!item.can_review) {
        showToast("You cannot reject this proposal.", "error");
        return;
      }
      const reason = await prompt({
        title: "Rejection reason",
        description: "Required. Earnings will remain unchanged.",
        placeholder: "Why is this proposal being rejected?",
      });
      if (!reason?.trim() || reason.trim().length < 3) {
        if (reason != null) showToast("Rejection reason must be at least 3 characters.", "error");
        return;
      }

      setBusyId(item.id);
      const res = await adminFetch(`/api/admin/money-action-proposals/${encodeURIComponent(item.id)}/reject`, {
        method: "POST",
        body: JSON.stringify({ review_note: reason.trim() }),
      });
      setBusyId(null);

      if (!res.ok) {
        showToast(res.error ?? "Reject failed.", "error");
        await refetch();
        return;
      }
      showToast("Proposal rejected — earnings unchanged.", "success");
      await refetch();
    },
    [refetch],
  );

  const unauthorized = Boolean(error && /not authenticated|forbidden|401|403/i.test(error));

  return (
    <div className="space-y-6 p-4 md:p-6">
      <OfficeZohoPageHeader
        title="Payout approvals"
        subtitle="Second-admin review for visit earnings maker–checker proposals"
        actions={
          <>
            <Link href="/office/payouts">
              <OfficeZohoSecondaryButton>Back to payouts</OfficeZohoSecondaryButton>
            </Link>
            <OfficeZohoSecondaryButton onClick={() => void refetch()}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </OfficeZohoSecondaryButton>
          </>
        }
      />

      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          aria-label="Status filter"
        >
          <option value="pending">Pending</option>
          <option value="all">All statuses</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="expired">Expired</option>
          <option value="failed">Failed</option>
          <option value="processing">Processing</option>
        </select>
        <select
          value={actionFilter}
          onChange={(e) => {
            setActionFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          aria-label="Type filter"
        >
          <option value="">All types</option>
          <option value="adjust_payout_earnings">Visit earnings</option>
          <option value="adjust_team_payout_earnings">Team visit earnings</option>
        </select>
        <input
          value={cleanerId}
          onChange={(e) => {
            setCleanerId(e.target.value);
            setPage(1);
          }}
          placeholder="Cleaner id"
          className="w-40 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
        />
        <input
          value={proposerId}
          onChange={(e) => {
            setProposerId(e.target.value);
            setPage(1);
          }}
          placeholder="Proposer user id"
          className="w-44 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
        />
        <input
          type="date"
          value={fromDate}
          onChange={(e) => {
            setFromDate(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          aria-label="From date"
        />
        <input
          type="date"
          value={toDate}
          onChange={(e) => {
            setToDate(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          aria-label="To date"
        />
      </div>

      {unauthorized ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
          Unauthorized — sign in as an Office administrator to view proposals.
        </div>
      ) : null}

      {!unauthorized && error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      <OfficeZohoTableShell>
        {loading ? (
          <div className="flex items-center gap-2 p-8 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading proposals…
          </div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No {statusFilter === "pending" ? "pending " : ""}earnings approvals.
            <div className="mt-2">
              <Link href="/office/payouts" className="font-semibold text-violet-700 hover:underline">
                Go to Cleaner Payouts
              </Link>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-2">Proposal</th>
                  <th className="px-3 py-2">Cleaner / visit</th>
                  <th className="px-3 py-2">Amounts</th>
                  <th className="px-3 py-2">Proposer</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {items.map((item) => {
                  const isHighlight = highlight === item.id;
                  return (
                    <tr
                      key={item.id}
                      id={`proposal-${item.id}`}
                      className={cn(isHighlight && "bg-violet-50/80")}
                    >
                      <td className="px-3 py-3 align-top">
                        <p className="font-semibold text-slate-800">{actionLabel(item.action_type)}</p>
                        <p className="mt-0.5 font-mono text-[11px] text-slate-500">{item.id.slice(0, 8)}…</p>
                        <p className="mt-1 text-[11px] text-slate-500">
                          Created {formatTs(item.created_at)}
                          <br />
                          Expires {formatTs(item.expires_at)}
                        </p>
                        {item.adjustment_note ? (
                          <p className="mt-1 max-w-xs text-xs text-slate-600">{item.adjustment_note}</p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <p className="font-medium text-slate-800">{item.cleaner_name ?? "—"}</p>
                        <Link
                          href={`/office/bookings/${encodeURIComponent(item.booking_id)}`}
                          className="text-xs font-semibold text-violet-700 hover:underline"
                        >
                          {item.booking.customer_name ?? "Booking"} · {item.booking.date ?? "—"}
                        </Link>
                        <p className="text-[11px] text-slate-500">{item.booking.service ?? ""}</p>
                      </td>
                      <td className="px-3 py-3 align-top tabular-nums">
                        <p className="text-slate-600">{formatZar(item.original_total_cents)}</p>
                        <p className="font-bold text-slate-900">→ {formatZar(item.proposed_total_cents)}</p>
                        <p
                          className={cn(
                            "text-xs font-semibold",
                            (item.difference_cents ?? 0) > 0
                              ? "text-emerald-700"
                              : (item.difference_cents ?? 0) < 0
                                ? "text-red-700"
                                : "text-slate-500",
                          )}
                        >
                          Δ {formatZar(item.difference_cents)}
                        </p>
                      </td>
                      <td className="px-3 py-3 align-top text-xs text-slate-600">
                        {item.proposed_by_email ?? item.proposed_by.slice(0, 8)}
                        {item.review_note ? (
                          <p className="mt-1 text-red-700">Reject note: {item.review_note}</p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                            STATUS_CLS[item.status] ?? "bg-slate-100 text-slate-600",
                          )}
                        >
                          {item.status}
                        </span>
                        {!item.can_review && item.status === "pending" ? (
                          <p className="mt-1 text-[10px] text-slate-500">
                            You proposed this — another admin must review.
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 align-top text-right">
                        {item.can_review ? (
                          <div className="inline-flex flex-col gap-1 sm:flex-row">
                            <OfficeZohoPrimaryButton
                              disabled={busyId !== null}
                              onClick={() => void handleApprove(item)}
                              className="!px-2 !py-1 !text-xs"
                            >
                              {busyId === item.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              )}
                              Approve
                            </OfficeZohoPrimaryButton>
                            <OfficeZohoSecondaryButton
                              disabled={busyId !== null}
                              onClick={() => void handleReject(item)}
                              className="!px-2 !py-1 !text-xs"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              Reject
                            </OfficeZohoSecondaryButton>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </OfficeZohoTableShell>

      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>
            Page {page} of {totalPages} · {total} total
          </span>
          <div className="flex gap-2">
            <OfficeZohoSecondaryButton disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              <ChevronLeft className="h-4 w-4" />
              Prev
            </OfficeZohoSecondaryButton>
            <OfficeZohoSecondaryButton
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </OfficeZohoSecondaryButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}
