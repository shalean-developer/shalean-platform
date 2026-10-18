import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchAllPayoutRows,
  payoutQueryChunks,
} from "@/lib/payout/payoutQueryPagination";
import {
  buildEarningsWorkspace,
  type WorkspaceBooking,
  type WorkspaceBatch,
  type WorkspaceDisbursement,
  type WorkspaceMember,
  type WorkspaceSettlementLink,
} from "./buildEarningsWorkspace";

const BOOKING_SELECT =
  "id,date,service,completed_at,cleaner_id,payout_owner_cleaner_id,payout_id,payout_status,earnings_policy,internal_earnings_cents,cleaner_payout_cents,cleaner_bonus_cents,payout_frozen_cents,display_earnings_cents,cleaner_earnings_total_cents,is_team_job,earnings_summary,metadata,booking_cleaners(cleaner_id),booking_roster_member_payouts(cleaner_id,payout_cents,bonus_cents)";

/** Complete, viewer-scoped read. Pagination changes lists, never aggregate coverage. */
export async function fetchEarningsWorkspace(
  admin: SupabaseClient,
  cleanerId: string,
  month: string,
  now: Date,
) {
  const [
    direct,
    roster,
    teamMembers,
    rosterMembers,
    batches,
    disbursements,
    settlementLinks,
    bank,
  ] = await Promise.all([
    fetchAllPayoutRows((from, to) =>
      admin
        .from("bookings")
        .select(BOOKING_SELECT)
        .or(
          `cleaner_id.eq.${cleanerId},payout_owner_cleaner_id.eq.${cleanerId}`,
        )
        .eq("status", "completed")
        .eq("is_test", false)
        .order("id")
        .range(from, to),
    ),
    fetchAllPayoutRows((from, to) =>
      admin
        .from("booking_cleaners")
        .select("id,booking_id")
        .eq("cleaner_id", cleanerId)
        .order("id")
        .range(from, to),
    ),
    fetchAllPayoutRows((from, to) =>
      admin
        .from("team_job_member_payouts")
        .select("id,booking_id,payout_cents,status,cleaner_payout_id")
        .eq("cleaner_id", cleanerId)
        .order("id")
        .range(from, to),
    ),
    fetchAllPayoutRows((from, to) =>
      admin
        .from("booking_roster_member_payouts")
        .select(
          "id,booking_id,payout_cents,bonus_cents,status,cleaner_payout_id",
        )
        .eq("cleaner_id", cleanerId)
        .order("id")
        .range(from, to),
    ),
    fetchAllPayoutRows((from, to) =>
      admin
        .from("cleaner_payouts")
        .select(
          "id,total_amount_cents,status,payment_status,payment_method,payment_reference,paid_at,period_start,period_end",
        )
        .eq("cleaner_id", cleanerId)
        .order("id")
        .range(from, to),
    ),
    fetchAllPayoutRows((from, to) =>
      admin
        .from("cleaner_earnings_disbursements")
        .select(
          "id,total_amount_cents,status,paid_at,paystack_reference,transfer_code,paystack_transfer_code,created_at",
        )
        .eq("cleaner_id", cleanerId)
        .order("id")
        .range(from, to),
    ),
    fetchAllPayoutRows((from, to) =>
      admin
        .from("cleaner_earnings")
        .select("id,booking_id,status,disbursement_id")
        .eq("cleaner_id", cleanerId)
        .in("status", ["approved", "paid", "processing"])
        .order("id")
        .range(from, to),
    ),
    admin
      .from("cleaner_payment_details")
      .select("account_number,bank_code,account_name")
      .eq("cleaner_id", cleanerId)
      .maybeSingle(),
  ]);
  if (bank.error) throw new Error(bank.error.message);
  const directIds = new Set(direct.map((r) => r.id));
  const extraIds = [
    ...new Set(
      [...roster, ...teamMembers, ...rosterMembers].map((r) => r.booking_id),
    ),
  ].filter((id) => !directIds.has(id));
  const extra: WorkspaceBooking[] = [];
  for (const ids of payoutQueryChunks(extraIds)) {
    // Chunks are smaller than the server row limit and each id is unique.
    const { data, error } = await admin
      .from("bookings")
      .select(BOOKING_SELECT)
      .in("id", ids)
      .eq("status", "completed")
      .eq("is_test", false)
      .order("id");
    if (error) throw new Error(error.message);
    extra.push(...((data ?? []) as unknown as WorkspaceBooking[]));
  }
  const details = bank.data;
  return buildEarningsWorkspace({
    cleanerId,
    month,
    now,
    bookings: [...(direct as unknown as WorkspaceBooking[]), ...extra],
    teamMembers: teamMembers as unknown as WorkspaceMember[],
    rosterMembers: rosterMembers as unknown as WorkspaceMember[],
    batches: batches as unknown as WorkspaceBatch[],
    disbursements: disbursements as unknown as WorkspaceDisbursement[],
    settlementLinks: settlementLinks as unknown as WorkspaceSettlementLink[],
    bankReady: Boolean(
      details?.account_number?.trim() &&
        details?.bank_code?.trim() &&
        details?.account_name?.trim(),
    ),
  });
}
