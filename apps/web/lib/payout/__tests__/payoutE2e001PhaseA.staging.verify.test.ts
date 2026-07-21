/**
 * PAYOUT-E2E-001 Phase A — staging behavioral harness (opt-in).
 * Run only with STAGING_VERIFY=1 against staging Supabase.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  loadRosterByBookingIds,
  loadTeamJobMemberPayoutsByBookingIds,
  perCleanerAllocationsForBooking,
} from "@/lib/admin/payouts/officePayoutPeriodReport";
import { parseBookingEarningsSummary } from "@/lib/payout/bookingEarningsSummary";
import { classifyVisitPayoutEdit } from "@/lib/payout/classifyVisitPayoutEdit";
import { adjustVisitPayoutEarnings } from "@/lib/payout/adjustVisitPayoutEarnings";
import { withEarningsAdjustMakerChecker } from "@/lib/payout/earningsAdjustMakerChecker";

const ENABLED = process.env.STAGING_VERIFY === "1";
const STAGING_REF = "gbgnemlpyykyhpqqbgru";
const ADMIN = "11111111-1111-4111-8111-111111111199";
const TEAM_ID = "b1111111-1111-4111-8111-111111111204";

const BOOKING_TJ_ONLY = "04ee8cad-9a3d-4154-b746-1591603f95d0";
const LEAD_TJ = "a1111111-1111-4111-8111-111111111107";
const MEMBER_TJ = "a1111111-1111-4111-8111-111111111108";

const BOOKING_TEAM = "bcc84463-0ef0-428f-a721-c5f8725f3d36";
const TEAM_LEAD = "a1111111-1111-4111-8111-111111111101";
const TEAM_MEMBER_A = "a1111111-1111-4111-8111-111111111108";
const TEAM_MEMBER_B = "a1111111-1111-4111-8111-111111111103";
const TEAM_TEAM_ID = "b1111111-1111-4111-8111-111111111203";

const evidence: Record<string, unknown> = {};
const created: { table: string; id: string }[] = [];

function adminClient(): SupabaseClient {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const ref = (process.env.SUPABASE_PROJECT_REF || "").trim();
  if (!url.includes(STAGING_REF) && ref !== STAGING_REF) {
    throw new Error(`Refusing non-staging target url=${url} ref=${ref}`);
  }
  if (url.includes("tchayecuvzssixyxlvfu")) throw new Error("Refusing production");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function officeSelected(admin: SupabaseClient, bookingId: string, cleanerId: string) {
  const { data: booking } = await admin
    .from("bookings")
    .select(
      "id, cleaner_id, payout_owner_cleaner_id, display_earnings_cents, cleaner_payout_cents, cleaner_bonus_cents, cleaner_earnings_total_cents, payout_frozen_cents, earnings_summary",
    )
    .eq("id", bookingId)
    .maybeSingle();
  const rosterByBooking = await loadRosterByBookingIds(admin, [bookingId]);
  const teamByBooking = await loadTeamJobMemberPayoutsByBookingIds(admin, [bookingId]);
  const allocations = perCleanerAllocationsForBooking(
    booking as Parameters<typeof perCleanerAllocationsForBooking>[0],
    rosterByBooking.get(bookingId) ?? [],
    teamByBooking.get(bookingId),
  );
  return {
    booking,
    allocations,
    selected: allocations.find((a) => a.cleaner_id === cleanerId)?.cents ?? null,
  };
}

async function snapshot(admin: SupabaseClient, bookingId: string) {
  const { data: booking } = await admin
    .from("bookings")
    .select(
      "id, is_team_job, cleaner_id, payout_owner_cleaner_id, cleaner_payout_cents, display_earnings_cents, cleaner_bonus_cents, cleaner_earnings_total_cents, earnings_summary, payout_id, payout_status, date, team_id",
    )
    .eq("id", bookingId)
    .maybeSingle();
  const { data: tj } = await admin
    .from("team_job_member_payouts")
    .select("id, cleaner_id, payout_cents, status, team_id")
    .eq("booking_id", bookingId);
  return { booking, tj };
}

describe.runIf(ENABLED)("PAYOUT-E2E-001 Phase A staging behavioral", () => {
  let admin: SupabaseClient;
  let originalTjOnly: Awaited<ReturnType<typeof snapshot>>;
  let originalTeam: Awaited<ReturnType<typeof snapshot>>;

  beforeAll(async () => {
    admin = adminClient();
    originalTjOnly = await snapshot(admin, BOOKING_TJ_ONLY);
    originalTeam = await snapshot(admin, BOOKING_TEAM);
    evidence.originalTjOnly = originalTjOnly;
    evidence.originalTeam = originalTeam;
  });

  afterAll(async () => {
    for (const c of created) {
      await admin.from(c.table).delete().eq("id", c.id);
    }
    await admin.from("team_job_member_payouts").delete().eq("booking_id", BOOKING_TJ_ONLY);
    await admin.from("team_job_member_payouts").delete().eq("booking_id", BOOKING_TEAM);
    if (originalTjOnly.booking) {
      const b = originalTjOnly.booking;
      await admin
        .from("bookings")
        .update({
          is_team_job: b.is_team_job,
          cleaner_id: b.cleaner_id,
          payout_owner_cleaner_id: b.payout_owner_cleaner_id,
          cleaner_payout_cents: b.cleaner_payout_cents,
          cleaner_bonus_cents: b.cleaner_bonus_cents,
          display_earnings_cents: b.display_earnings_cents,
          cleaner_earnings_total_cents: b.cleaner_earnings_total_cents,
          earnings_summary: b.earnings_summary,
          payout_id: b.payout_id,
          payout_status: b.payout_status,
          team_id: b.team_id,
        })
        .eq("id", BOOKING_TJ_ONLY);
    }
    if (originalTeam.booking) {
      const b = originalTeam.booking;
      await admin
        .from("bookings")
        .update({
          earnings_summary: b.earnings_summary,
          cleaner_payout_cents: b.cleaner_payout_cents,
          display_earnings_cents: b.display_earnings_cents,
          cleaner_earnings_total_cents: b.cleaner_earnings_total_cents,
          payout_id: null,
          payout_status: "pending",
        })
        .eq("id", BOOKING_TEAM);
    }
    evidence.restoration = "completed";
    // eslint-disable-next-line no-console
    console.log("STAGING_EVIDENCE_JSON", JSON.stringify(evidence));
  });

  it("T1/T2/T10: TJ-only member on non-team booking — per_cleaner persist, no lead overwrite", async () => {
    process.env.PAYOUT_MAKER_CHECKER = "false";
    const leadOnlySummary = {
      model_version: "v3",
      customer_total_cents: 45000,
      costs_cents: 0,
      per_cleaner_earnings: [
        {
          cleaner_id: LEAD_TJ,
          role: "lead",
          base_earning_cents: 25000,
          bonus_cents: 0,
          deduction_cents: 0,
          total_cents: 25000,
        },
      ],
      total_cleaner_earnings_cents: 25000,
      company_revenue_cents: 20000,
      payout_mode: "solo",
    };
    await admin
      .from("bookings")
      .update({
        is_team_job: false,
        cleaner_id: LEAD_TJ,
        payout_owner_cleaner_id: LEAD_TJ,
        cleaner_payout_cents: 25000,
        cleaner_bonus_cents: 0,
        display_earnings_cents: 25000,
        cleaner_earnings_total_cents: 25000,
        earnings_summary: leadOnlySummary,
        payout_id: null,
        payout_status: "pending",
        team_id: null,
      })
      .eq("id", BOOKING_TJ_ONLY);
    await admin.from("team_job_member_payouts").delete().eq("booking_id", BOOKING_TJ_ONLY);
    await admin.from("booking_cleaners").delete().eq("booking_id", BOOKING_TJ_ONLY).eq("cleaner_id", MEMBER_TJ);
    const { data: tjIns, error: tjErr } = await admin
      .from("team_job_member_payouts")
      .insert({
        booking_id: BOOKING_TJ_ONLY,
        team_id: TEAM_ID,
        cleaner_id: MEMBER_TJ,
        payout_cents: 15000,
        status: "pending",
      })
      .select("id")
      .single();
    expect(tjErr).toBeNull();
    created.push({ table: "team_job_member_payouts", id: String(tjIns!.id) });

    const before = await officeSelected(admin, BOOKING_TJ_ONLY, MEMBER_TJ);
    evidence.t1_before = { selected: before.selected, leadHybrid: 25000, tj: 15000 };

    const mode = classifyVisitPayoutEdit({
      is_team_job: false,
      cleaner_id: LEAD_TJ,
      payout_owner_cleaner_id: LEAD_TJ,
      team_id: null,
      earnings_summary: leadOnlySummary,
      rosterCleanerIds: [],
      hasTeamMemberPayoutRow: true,
      hasRosterMemberPayoutRow: false,
      requestedCleanerId: MEMBER_TJ,
    });
    expect(mode).toBe("per_cleaner");

    const newAmount = 18000;
    const edit = await adjustVisitPayoutEarnings(admin, {
      bookingId: BOOKING_TJ_ONLY,
      cleanerId: MEMBER_TJ,
      payoutCents: newAmount,
      bonusCents: 0,
      adjustmentNote: "PAYOUT-E2E-001 Phase A staging verify T1",
      adminUserId: ADMIN,
    });
    evidence.t1_edit = edit;
    expect(edit.ok).toBe(true);
    if (edit.ok) expect(edit.mode).toBe("per_cleaner");

    const after = await officeSelected(admin, BOOKING_TJ_ONLY, MEMBER_TJ);
    const { data: tjRow } = await admin
      .from("team_job_member_payouts")
      .select("payout_cents")
      .eq("booking_id", BOOKING_TJ_ONLY)
      .eq("cleaner_id", MEMBER_TJ)
      .maybeSingle();
    const summary = parseBookingEarningsSummary(after.booking?.earnings_summary);
    const summaryMember = summary?.per_cleaner_earnings.find((e) => e.cleaner_id === MEMBER_TJ);
    const leadAlloc = after.allocations.find((a) => a.cleaner_id === LEAD_TJ)?.cents;

    evidence.t1_after = {
      selected: after.selected,
      tj: tjRow?.payout_cents,
      summaryMember: summaryMember?.total_cents,
      leadHybrid: {
        payout: after.booking?.cleaner_payout_cents,
        display: after.booking?.display_earnings_cents,
      },
      leadAlloc,
    };

    expect(after.selected).toBe(newAmount);
    expect(tjRow?.payout_cents).toBe(newAmount);
    expect(summaryMember?.total_cents).toBe(newAmount);
    expect(after.booking?.cleaner_payout_cents).toBe(25000);
    expect(after.booking?.display_earnings_cents).toBe(25000);
    expect(leadAlloc).toBe(25000);

    const { data: audits } = await admin
      .from("payout_audit_events")
      .select("id, event_type, booking_ids, old_values, new_values, context, actor_user_id, created_at")
      .eq("event_type", "visit_earnings_adjusted")
      .contains("booking_ids", [BOOKING_TJ_ONLY])
      .order("created_at", { ascending: false })
      .limit(1);
    evidence.t6_audit = audits?.[0] ?? null;
    expect(audits?.length).toBeGreaterThan(0);
  });

  it("T3: true team booking — one member changes, peers unchanged", async () => {
    process.env.PAYOUT_MAKER_CHECKER = "false";
    const summary = {
      model_version: "v3",
      customer_total_cents: 190000,
      costs_cents: 0,
      per_cleaner_earnings: [
        { cleaner_id: TEAM_LEAD, role: "lead", base_earning_cents: 60000, bonus_cents: 0, deduction_cents: 0, total_cents: 60000 },
        { cleaner_id: TEAM_MEMBER_A, role: "member", base_earning_cents: 50000, bonus_cents: 0, deduction_cents: 0, total_cents: 50000 },
        { cleaner_id: TEAM_MEMBER_B, role: "member", base_earning_cents: 40000, bonus_cents: 0, deduction_cents: 0, total_cents: 40000 },
      ],
      total_cleaner_earnings_cents: 150000,
      company_revenue_cents: 40000,
      payout_mode: "team",
    };
    await admin
      .from("bookings")
      .update({
        earnings_summary: summary,
        cleaner_payout_cents: 60000,
        display_earnings_cents: 60000,
        cleaner_earnings_total_cents: 150000,
        payout_id: null,
        payout_status: "pending",
      })
      .eq("id", BOOKING_TEAM);
    await admin.from("team_job_member_payouts").delete().eq("booking_id", BOOKING_TEAM);
    for (const row of [
      { cleaner_id: TEAM_LEAD, payout_cents: 60000 },
      { cleaner_id: TEAM_MEMBER_A, payout_cents: 50000 },
      { cleaner_id: TEAM_MEMBER_B, payout_cents: 40000 },
    ]) {
      const { data, error } = await admin
        .from("team_job_member_payouts")
        .insert({
          booking_id: BOOKING_TEAM,
          team_id: TEAM_TEAM_ID,
          cleaner_id: row.cleaner_id,
          payout_cents: row.payout_cents,
          status: "pending",
        })
        .select("id")
        .single();
      expect(error).toBeNull();
      created.push({ table: "team_job_member_payouts", id: String(data!.id) });
    }

    const edit = await adjustVisitPayoutEarnings(admin, {
      bookingId: BOOKING_TEAM,
      cleanerId: TEAM_MEMBER_A,
      payoutCents: 55000,
      bonusCents: 0,
      adjustmentNote: "PAYOUT-E2E-001 Phase A staging verify T3",
      adminUserId: ADMIN,
    });
    evidence.t3_edit = edit;
    expect(edit.ok).toBe(true);

    const { data: tj } = await admin
      .from("team_job_member_payouts")
      .select("cleaner_id, payout_cents")
      .eq("booking_id", BOOKING_TEAM);
    const byId = Object.fromEntries((tj ?? []).map((r) => [r.cleaner_id, r.payout_cents]));
    evidence.t3_tj = byId;
    expect(byId[TEAM_MEMBER_A]).toBe(55000);
    expect(byId[TEAM_MEMBER_B]).toBe(40000);
    expect(byId[TEAM_LEAD]).toBe(60000);
    const alloc = await officeSelected(admin, BOOKING_TEAM, TEAM_MEMBER_A);
    expect(alloc.selected).toBe(55000);
    expect(alloc.booking?.cleaner_payout_cents).toBe(60000);
  });

  it("T4: maker-checker proposes without mutating", async () => {
    process.env.PAYOUT_MAKER_CHECKER = "true";
    const before = await admin
      .from("team_job_member_payouts")
      .select("payout_cents")
      .eq("booking_id", BOOKING_TJ_ONLY)
      .eq("cleaner_id", MEMBER_TJ)
      .maybeSingle();
    const gate = await withEarningsAdjustMakerChecker(admin, {
      actionType: "adjust_team_payout_earnings",
      bookingId: BOOKING_TJ_ONLY,
      payload: { payout_cents: 19000, bonus_cents: 0, cleaner_id: MEMBER_TJ, edit_mode: "per_cleaner" },
      adminUserId: ADMIN,
      proposalId: null,
      apply: async () => {
        throw new Error("apply must not run when proposing");
      },
    });
    const after = await admin
      .from("team_job_member_payouts")
      .select("payout_cents")
      .eq("booking_id", BOOKING_TJ_ONLY)
      .eq("cleaner_id", MEMBER_TJ)
      .maybeSingle();
    evidence.t4 = { gate, before: before.data?.payout_cents, after: after.data?.payout_cents };
    expect(gate.ok).toBe(true);
    if (gate.ok) {
      expect(gate.mode).toBe("proposed");
      if ("proposalId" in gate && gate.proposalId) {
        created.push({ table: "admin_money_action_proposals", id: gate.proposalId });
      }
    }
    expect(after.data?.payout_cents).toBe(before.data?.payout_cents);
    process.env.PAYOUT_MAKER_CHECKER = "false";
  });

  it("T5: open batch sync includes batched TJ member amount", async () => {
    process.env.PAYOUT_MAKER_CHECKER = "false";
    // Batch sync only attributes TJ rows whose booking is completed + non-test.
    const { data: bookingMeta } = await admin
      .from("bookings")
      .select("status, is_test, date")
      .eq("id", BOOKING_TJ_ONLY)
      .single();
    evidence.t5_booking_meta_before = bookingMeta;
    await admin
      .from("bookings")
      .update({ status: "completed", is_test: false })
      .eq("id", BOOKING_TJ_ONLY);

    const { data: batch, error } = await admin
      .from("cleaner_payouts")
      .insert({
        cleaner_id: MEMBER_TJ,
        total_amount_cents: 18000,
        status: "pending",
        period_start: "2026-07-01",
        period_end: "2026-07-31",
        payment_status: "pending",
        calculated_amount_cents: 18000,
      })
      .select("id, total_amount_cents")
      .single();
    expect(error).toBeNull();
    created.push({ table: "cleaner_payouts", id: String(batch!.id) });

    await admin
      .from("team_job_member_payouts")
      .update({ status: "batched" })
      .eq("booking_id", BOOKING_TJ_ONLY)
      .eq("cleaner_id", MEMBER_TJ);

    // Cap on this booking is R450 (lead 25000 + member must stay within 45000).
    const newAmt = 20000;
    const edit = await adjustVisitPayoutEarnings(admin, {
      bookingId: BOOKING_TJ_ONLY,
      cleanerId: MEMBER_TJ,
      payoutCents: newAmt,
      bonusCents: 0,
      adjustmentNote: "PAYOUT-E2E-001 Phase A staging verify T5",
      adminUserId: ADMIN,
    });
    evidence.t5_edit = edit;
    expect(edit.ok).toBe(true);

    const { data: batchAfter } = await admin
      .from("cleaner_payouts")
      .select("total_amount_cents, status")
      .eq("id", batch!.id)
      .single();
    evidence.t5_batch = { before: 18000, after: batchAfter, apiTotal: edit.ok ? edit.batchTotalCents : null };
    expect(edit.ok && edit.batchTotalCents).toBe(newAmt);
    expect(batchAfter?.total_amount_cents).toBe(newAmt);

    // Restore booking status for later tests / cleanup
    if (bookingMeta) {
      await admin
        .from("bookings")
        .update({ status: bookingMeta.status, is_test: bookingMeta.is_test })
        .eq("id", BOOKING_TJ_ONLY);
    }
  });

  it("T8: approved batch rejects edit without mutation", async () => {
    process.env.PAYOUT_MAKER_CHECKER = "false";
    const { data: approved, error } = await admin
      .from("cleaner_payouts")
      .insert({
        cleaner_id: TEAM_LEAD,
        total_amount_cents: 60000,
        status: "approved",
        period_start: "2026-07-01",
        period_end: "2026-07-31",
        payment_status: "pending",
        calculated_amount_cents: 60000,
        approved_at: new Date().toISOString(),
      })
      .select("id, status")
      .single();
    expect(error).toBeNull();
    expect(approved?.status).toBe("approved");
    created.push({ table: "cleaner_payouts", id: String(approved!.id) });

    const { error: linkErr } = await admin
      .from("bookings")
      .update({
        payout_id: approved!.id,
        payout_status: "eligible",
        payout_frozen_cents: 150000,
      })
      .eq("id", BOOKING_TEAM);
    expect(linkErr).toBeNull();
    const { data: linked } = await admin
      .from("bookings")
      .select("payout_id, payout_status")
      .eq("id", BOOKING_TEAM)
      .single();
    evidence.t8_link = linked;
    expect(linked?.payout_id).toBe(approved!.id);

    const before = await admin
      .from("team_job_member_payouts")
      .select("cleaner_id, payout_cents")
      .eq("booking_id", BOOKING_TEAM);
    // Amount stays under financial cap so rejection must come from lock guards, not cap.
    const edit = await adjustVisitPayoutEarnings(admin, {
      bookingId: BOOKING_TEAM,
      cleanerId: TEAM_MEMBER_B,
      payoutCents: 41000,
      bonusCents: 0,
      adjustmentNote: "PAYOUT-E2E-001 Phase A staging verify T8",
      adminUserId: ADMIN,
    });
    const after = await admin
      .from("team_job_member_payouts")
      .select("cleaner_id, payout_cents")
      .eq("booking_id", BOOKING_TEAM);
    evidence.t8 = { edit, before: before.data, after: after.data };
    expect(edit.ok).toBe(false);
    if (!edit.ok) {
      expect(edit.code).toBe("payout_batch_locked");
    }
    expect(JSON.stringify(before.data)).toBe(JSON.stringify(after.data));
    await admin.from("bookings").update({ payout_id: null, payout_status: "pending" }).eq("id", BOOKING_TEAM);
  });

  it("T9: cross-surface reconciliation for TJ-only member", async () => {
    const after = await officeSelected(admin, BOOKING_TJ_ONLY, MEMBER_TJ);
    const { data: tj } = await admin
      .from("team_job_member_payouts")
      .select("payout_cents")
      .eq("booking_id", BOOKING_TJ_ONLY)
      .eq("cleaner_id", MEMBER_TJ)
      .maybeSingle();
    const summary = parseBookingEarningsSummary(after.booking?.earnings_summary);
    const summaryCents = summary?.per_cleaner_earnings.find((e) => e.cleaner_id === MEMBER_TJ)?.total_cents ?? null;
    const table = {
      office: after.selected,
      tj: tj?.payout_cents ?? null,
      summary: summaryCents,
      leadPayout: after.booking?.cleaner_payout_cents ?? null,
      leadDisplay: after.booking?.display_earnings_cents ?? null,
    };
    evidence.t9 = table;
    expect(table.office).toBe(table.tj);
    expect(table.summary).toBe(table.office);
    expect(table.leadPayout).toBe(25000);
    expect(table.leadDisplay).toBe(25000);
  });
});
