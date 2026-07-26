import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isEarningsAdjustActionType,
  type MoneyActionProposalListItem,
  type MoneyActionProposalRow,
  type MoneyActionProposalStatus,
} from "@/lib/payout/moneyActionProposalTypes";
import { parseEarningsAdjustPayload } from "@/lib/payout/moneyActionProposalPayload";
import { computeMoneyActionProposalReviewability } from "@/lib/payout/moneyActionProposalReviewability";
import { expireOverdueMoneyActionProposals } from "@/lib/payout/expireOverdueMoneyActionProposals";

export type { MoneyActionProposalListItem };

export type ListMoneyActionProposalsParams = {
  status?: string | string[];
  actionType?: string | null;
  cleanerId?: string | null;
  proposedBy?: string | null;
  bookingId?: string | null;
  from?: string | null;
  to?: string | null;
  limit?: number;
  offset?: number;
  viewerUserId: string;
};

function parseStatusFilter(raw: string | string[] | undefined): string[] {
  if (raw == null || raw === "") return ["pending"];
  const parts = Array.isArray(raw) ? raw : String(raw).split(",");
  const allowed = new Set([
    "pending",
    "processing",
    "approved",
    "rejected",
    "expired",
    "failed",
    "all",
  ]);
  const statuses = parts.map((s) => s.trim().toLowerCase()).filter((s) => allowed.has(s));
  if (statuses.includes("all") || statuses.length === 0) {
    return ["pending", "processing", "approved", "rejected", "expired", "failed"];
  }
  return statuses;
}

function mapRow(
  row: MoneyActionProposalRow,
  enrich: {
    customer_name: string | null;
    date: string | null;
    service: string | null;
    cleaner_name: string | null;
  },
  viewerUserId: string,
): MoneyActionProposalListItem {
  const parsed = isEarningsAdjustActionType(String(row.action_type))
    ? parseEarningsAdjustPayload(row.payload)
    : null;
  const payload = parsed?.ok ? parsed.payload : null;
  const proposedTotal = payload ? payload.payout_cents + payload.bonus_cents : null;
  const originalTotal = payload?.original_total_cents ?? null;
  const reviewability = computeMoneyActionProposalReviewability({
    status: String(row.status),
    proposed_by: String(row.proposed_by),
    expires_at: row.expires_at,
    viewerUserId,
  });

  return {
    id: row.id,
    action_type: String(row.action_type),
    status: reviewability.status as MoneyActionProposalStatus,
    booking_id: row.booking_id,
    booking: {
      date: enrich.date,
      customer_name: enrich.customer_name,
      service: enrich.service,
    },
    cleaner_id: payload?.cleaner_id ?? null,
    cleaner_name: enrich.cleaner_name,
    original_total_cents: originalTotal,
    proposed_payout_cents: payload?.payout_cents ?? null,
    proposed_bonus_cents: payload?.bonus_cents ?? null,
    proposed_total_cents: proposedTotal,
    difference_cents:
      originalTotal != null && proposedTotal != null ? proposedTotal - originalTotal : null,
    adjustment_note: payload?.adjustment_note ?? null,
    proposed_by: row.proposed_by,
    proposed_by_email: row.proposed_by_email,
    created_at: row.created_at,
    expires_at: row.expires_at,
    reviewed_by: row.reviewed_by,
    reviewed_at: row.reviewed_at,
    review_note: row.review_note,
    can_review: reviewability.can_review,
    review_block_reason: reviewability.review_block_reason,
  };
}

export async function listMoneyActionProposals(
  admin: SupabaseClient,
  params: ListMoneyActionProposalsParams,
): Promise<{ ok: true; items: MoneyActionProposalListItem[]; total: number } | { ok: false; error: string }> {
  // Persist overdue pending→expired before filtering so Pending queue stays accurate.
  await expireOverdueMoneyActionProposals(admin);

  const limit = Math.min(100, Math.max(1, Math.round(params.limit ?? 25)));
  const offset = Math.max(0, Math.round(params.offset ?? 0));
  const statuses = parseStatusFilter(params.status);

  let query = admin
    .from("admin_money_action_proposals")
    .select(
      "id, action_type, booking_id, payload, proposed_by, proposed_by_email, status, reviewed_by, reviewed_at, review_note, created_at, expires_at",
      { count: "exact" },
    )
    .in("status", statuses)
    .order("created_at", { ascending: false });

  // Defense in depth: default Pending queue must not surface overdue rows even if
  // expire RPC briefly fails / migration not yet applied.
  if (statuses.length === 1 && statuses[0] === "pending") {
    query = query.gt("expires_at", new Date().toISOString());
  }

  if (params.actionType) query = query.eq("action_type", params.actionType);
  if (params.bookingId) query = query.eq("booking_id", params.bookingId);
  if (params.proposedBy) query = query.eq("proposed_by", params.proposedBy);
  if (params.from) query = query.gte("created_at", `${params.from}T00:00:00.000Z`);
  if (params.to) query = query.lte("created_at", `${params.to}T23:59:59.999Z`);
  if (params.cleanerId) {
    query = query.contains("payload", { cleaner_id: params.cleanerId });
  }

  const { data, error, count } = await query.range(offset, offset + limit - 1);
  if (error) return { ok: false, error: error.message };

  const rows = (data ?? []) as MoneyActionProposalRow[];
  const bookingIds = [...new Set(rows.map((r) => r.booking_id))];
  const cleanerIds = [
    ...new Set(
      rows
        .map((r) => {
          const p = parseEarningsAdjustPayload(r.payload);
          return p.ok ? p.payload.cleaner_id : null;
        })
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const bookingMap = new Map<
    string,
    { date: string | null; customer_name: string | null; service: string | null }
  >();
  if (bookingIds.length) {
    const { data: bookings } = await admin
      .from("bookings")
      .select("id, date, customer_name, service")
      .in("id", bookingIds);
    for (const b of bookings ?? []) {
      const row = b as {
        id: string;
        date?: string | null;
        customer_name?: string | null;
        service?: string | null;
      };
      bookingMap.set(row.id, {
        date: row.date ?? null,
        customer_name: row.customer_name ?? null,
        service: row.service ?? null,
      });
    }
  }

  const cleanerMap = new Map<string, string>();
  if (cleanerIds.length) {
    const { data: cleaners } = await admin.from("cleaners").select("id, full_name").in("id", cleanerIds);
    for (const c of cleaners ?? []) {
      const row = c as { id: string; full_name?: string | null };
      cleanerMap.set(row.id, row.full_name ?? "Cleaner");
    }
  }

  const items = rows.map((row) => {
    const booking = bookingMap.get(row.booking_id) ?? {
      date: null,
      customer_name: null,
      service: null,
    };
    const parsed = parseEarningsAdjustPayload(row.payload);
    const cleanerId = parsed.ok ? parsed.payload.cleaner_id : null;
    return mapRow(
      row,
      {
        ...booking,
        cleaner_name: cleanerId ? cleanerMap.get(cleanerId) ?? null : null,
      },
      params.viewerUserId,
    );
  });

  return { ok: true, items, total: count ?? items.length };
}

export async function getMoneyActionProposalById(
  admin: SupabaseClient,
  params: { proposalId: string; viewerUserId: string },
): Promise<{ ok: true; item: MoneyActionProposalListItem } | { ok: false; error: string; code: string }> {
  await expireOverdueMoneyActionProposals(admin);

  const { data, error } = await admin
    .from("admin_money_action_proposals")
    .select(
      "id, action_type, booking_id, payload, proposed_by, proposed_by_email, status, reviewed_by, reviewed_at, review_note, created_at, expires_at",
    )
    .eq("id", params.proposalId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message, code: "proposal_load_failed" };
  if (!data) return { ok: false, error: "Proposal not found.", code: "proposal_not_found" };

  const row = data as MoneyActionProposalRow;
  const { data: booking } = await admin
    .from("bookings")
    .select("id, date, customer_name, service")
    .eq("id", row.booking_id)
    .maybeSingle();
  const parsed = parseEarningsAdjustPayload(row.payload);
  const cleanerId = parsed.ok ? parsed.payload.cleaner_id : null;
  let cleanerName: string | null = null;
  if (cleanerId) {
    const { data: cleaner } = await admin
      .from("cleaners")
      .select("id, full_name")
      .eq("id", cleanerId)
      .maybeSingle();
    cleanerName = (cleaner as { full_name?: string | null } | null)?.full_name ?? null;
  }

  const b = booking as
    | { date?: string | null; customer_name?: string | null; service?: string | null }
    | null;

  return {
    ok: true,
    item: mapRow(
      row,
      {
        date: b?.date ?? null,
        customer_name: b?.customer_name ?? null,
        service: b?.service ?? null,
        cleaner_name: cleanerName,
      },
      params.viewerUserId,
    ),
  };
}
