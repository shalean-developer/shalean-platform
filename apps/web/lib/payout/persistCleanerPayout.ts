import {
  calculateCleanerPayoutFromBookingRow,
  type CleanerPayoutResult,
  resolvePayoutBaseAndServiceFeeCents,
} from "@/lib/payout/calculateCleanerPayout";
import { computeBookingEarnings } from "@/lib/payout/computeBookingEarnings";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { parseBookingServiceId } from "@/components/booking/serviceCategories";
import type { SupabaseClient } from "@supabase/supabase-js";

function resolveServiceId(snapshot: unknown, serviceLabel: string | null | undefined): string {
  if (snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)) {
    const locked = (snapshot as { locked?: unknown }).locked;
    if (locked && typeof locked === "object" && !Array.isArray(locked)) {
      const parsed = parseBookingServiceId((locked as { service?: unknown }).service);
      if (parsed) return parsed;
    }
  }
  const s = String(serviceLabel ?? "").toLowerCase();
  if (s.includes("deep")) return "deep";
  if (s.includes("move")) return "move";
  if (s.includes("airbnb")) return "airbnb";
  if (s.includes("carpet")) return "carpet";
  if (s.includes("quick")) return "quick";
  return "standard";
}

function resolveBookingDateIso(date: string | null | undefined, time: string | null | undefined): string {
  const d = String(date ?? "").trim();
  const t = String(time ?? "").trim().slice(0, 5);
  if (/^\d{4}-\d{2}-\d{2}$/.test(d) && /^\d{2}:\d{2}$/.test(t)) return `${d}T${t}:00.000Z`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return `${d}T12:00:00.000Z`;
  return new Date().toISOString();
}

/**
 * Persists payout columns once per booking (immutable after first successful write).
 * Call when a cleaner is assigned and payment total is known — e.g. from `notifyCleanerAssignedBooking`.
 */
export async function persistCleanerPayoutIfUnset(
  params: { admin: SupabaseClient; bookingId: string; cleanerId: string },
): Promise<{ ok: true; skipped: boolean; payout?: CleanerPayoutResult } | { ok: false; error: string }> {
  const { admin, bookingId, cleanerId: expectedCleanerId } = params;
  const { data: row, error: selErr } = await admin
    .from("bookings")
    .select(
      "id, cleaner_id, team_id, is_team_job, date, time, total_paid_zar, total_paid_cents, amount_paid_cents, base_amount_cents, service_fee_cents, service, booking_snapshot, cleaner_payout_cents, cleaner_bonus_cents, company_revenue_cents, display_earnings_cents",
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (selErr || !row) {
    return { ok: false, error: selErr?.message ?? "Booking not found" };
  }

  const r = row as {
    cleaner_id?: string | null;
    team_id?: string | null;
    is_team_job?: boolean | null;
    date?: string | null;
    time?: string | null;
    cleaner_payout_cents?: number | null;
    cleaner_bonus_cents?: number | null;
    company_revenue_cents?: number | null;
    display_earnings_cents?: number | null;
    total_paid_zar?: number | null;
    total_paid_cents?: number | null;
    amount_paid_cents?: number | null;
    base_amount_cents?: number | null;
    service_fee_cents?: number | null;
    service?: string | null;
    booking_snapshot?: unknown;
  };

  if (String(r.cleaner_id ?? "") !== expectedCleanerId) {
    return { ok: true, skipped: true };
  }

  if (r.display_earnings_cents != null && Number.isFinite(Number(r.display_earnings_cents))) {
    return { ok: true, skipped: true };
  }

  if (
    r.cleaner_payout_cents != null &&
    Number.isFinite(Number(r.cleaner_payout_cents)) &&
    r.cleaner_bonus_cents != null &&
    Number.isFinite(Number(r.cleaner_bonus_cents)) &&
    r.company_revenue_cents != null &&
    Number.isFinite(Number(r.company_revenue_cents))
  ) {
    return { ok: true, skipped: true };
  }

  const { payoutBaseCents, serviceFeeCents } = resolvePayoutBaseAndServiceFeeCents({
    baseAmountCents: r.base_amount_cents,
    serviceFeeCents: r.service_fee_cents,
    totalPaidZar: r.total_paid_zar,
    amountPaidCents: r.total_paid_cents ?? r.amount_paid_cents,
  });
  const bookingDateIso = resolveBookingDateIso(r.date, r.time);
  const serviceId = resolveServiceId(r.booking_snapshot ?? null, r.service ?? null);
  const isTeamJob = r.is_team_job === true;

  const earnings = await computeBookingEarnings({
    servicePriceCents: payoutBaseCents,
    serviceId,
    cleanerId: expectedCleanerId,
    isTeamJob,
    bookingDate: bookingDateIso,
  });

  if (isTeamJob) {
    const teamId = String(r.team_id ?? "").trim();
    if (!teamId) return { ok: false, error: "Team job missing team_id" };

    const { data: members, error: membersErr } = await admin
      .from("team_members")
      .select("cleaner_id, active_from, active_to")
      .eq("team_id", teamId)
      .not("cleaner_id", "is", null);
    if (membersErr) return { ok: false, error: membersErr.message };

    const bookingMs = new Date(bookingDateIso).getTime();
    const activeMembers = (members ?? [])
      .map((m) => m as { cleaner_id?: string | null; active_from?: string | null; active_to?: string | null })
      .filter((m) => {
        const cid = String(m.cleaner_id ?? "").trim();
        if (!cid) return false;
        const from = m.active_from ? new Date(m.active_from).getTime() : null;
        const to = m.active_to ? new Date(m.active_to).getTime() : null;
        if (from != null && !Number.isNaN(from) && bookingMs < from) return false;
        if (to != null && !Number.isNaN(to) && bookingMs > to) return false;
        return true;
      });
    if (!activeMembers.length) return { ok: false, error: "No active team members for payout" };

    const { data: existingRows, error: existingErr } = await admin
      .from("team_job_member_payouts")
      .select("cleaner_id")
      .eq("booking_id", bookingId)
      .eq("team_id", teamId);
    if (existingErr) return { ok: false, error: existingErr.message };
    const existingCleanerIds = new Set(
      (existingRows ?? []).map((row) => String((row as { cleaner_id?: string | null }).cleaner_id ?? "").trim()).filter(Boolean),
    );
    const inserts = activeMembers
      .map((m) => String(m.cleaner_id ?? "").trim())
      .filter((cid) => cid && !existingCleanerIds.has(cid))
      .map((cid) => ({
        booking_id: bookingId,
        team_id: teamId,
        cleaner_id: cid,
        payout_cents: earnings.payout_earnings_cents,
        status: "pending",
      }));
    if (inserts.length > 0) {
      const { error: insErr } = await admin.from("team_job_member_payouts").insert(inserts);
      if (insErr) return { ok: false, error: insErr.message };
    }

    const { data: updatedTeam, error: teamUpErr } = await admin
      .from("bookings")
      .update({
        cleaner_payout_cents: 0,
        cleaner_bonus_cents: 0,
        company_revenue_cents: Math.max(0, payoutBaseCents + serviceFeeCents),
        payout_percentage: null,
        payout_type: "team_fixed",
        display_earnings_cents: earnings.display_earnings_cents,
        payout_earnings_cents: earnings.payout_earnings_cents,
        internal_earnings_cents: earnings.internal_earnings_cents,
        earnings_model_version: earnings.earnings_model_version,
        earnings_percentage_applied: earnings.earnings_percentage_applied ?? null,
        earnings_cap_cents_applied: earnings.earnings_cap_cents_applied ?? null,
        earnings_tenure_months_at_assignment: earnings.earnings_tenure_months_at_assignment ?? null,
      })
      .eq("id", bookingId)
      .eq("team_id", teamId)
      .is("display_earnings_cents", null)
      .select("id");
    if (teamUpErr) {
      await reportOperationalIssue("error", "persistCleanerPayoutIfUnset", teamUpErr.message, { bookingId });
      return { ok: false, error: teamUpErr.message };
    }
    if (!updatedTeam?.length) return { ok: true, skipped: true };
    return { ok: true, skipped: false };
  }

  const { data: cleaner, error: cErr } = await admin.from("cleaners").select("created_at").eq("id", expectedCleanerId).maybeSingle();

  if (cErr || !cleaner) {
    await reportOperationalIssue("warn", "persistCleanerPayoutIfUnset", `cleaner not found: ${cErr?.message ?? ""}`, {
      bookingId,
      cleanerId: expectedCleanerId,
    });
    return { ok: false, error: "Cleaner not found" };
  }

  const createdAt =
    cleaner && typeof cleaner === "object" && "created_at" in cleaner
      ? String((cleaner as { created_at?: string | null }).created_at ?? "")
      : "";

  const payout = calculateCleanerPayoutFromBookingRow({
    totalPaidZar: r.total_paid_zar,
    amountPaidCents: r.total_paid_cents ?? r.amount_paid_cents,
    baseAmountCents: r.base_amount_cents,
    serviceFeeCents: r.service_fee_cents,
    serviceLabel: r.service ?? null,
    bookingSnapshot: r.booking_snapshot ?? null,
    cleanerCreatedAtIso: createdAt || null,
  });

  const { data: updated, error: upErr } = await admin
    .from("bookings")
    .update({
      cleaner_payout_cents: payout.payoutCents,
      cleaner_bonus_cents: payout.bonusCents,
      company_revenue_cents: payout.companyRevenueCents,
      payout_percentage: payout.payoutPercentage,
      payout_type: payout.payoutType,
      display_earnings_cents: earnings.display_earnings_cents,
      payout_earnings_cents: earnings.payout_earnings_cents,
      internal_earnings_cents: earnings.internal_earnings_cents,
      earnings_model_version: earnings.earnings_model_version,
      earnings_percentage_applied: earnings.earnings_percentage_applied ?? null,
      earnings_cap_cents_applied: earnings.earnings_cap_cents_applied ?? null,
      earnings_tenure_months_at_assignment: earnings.earnings_tenure_months_at_assignment ?? null,
    })
    .eq("id", bookingId)
    .eq("cleaner_id", expectedCleanerId)
    .is("display_earnings_cents", null)
    .select("id");

  if (upErr) {
    await reportOperationalIssue("error", "persistCleanerPayoutIfUnset", upErr.message, { bookingId });
    return { ok: false, error: upErr.message };
  }

  if (!updated?.length) {
    return { ok: true, skipped: true };
  }

  console.log("PAYOUT_CALCULATED", {
    bookingId,
    cleanerPayout: payout.payoutCents,
    cleanerBonus: payout.bonusCents,
    companyRevenue: payout.companyRevenueCents,
    type: payout.payoutType,
    payoutBaseCents: payout.payoutBaseCents,
    serviceFeeCents: payout.serviceFeeCents,
  });
  console.log("EARNINGS_COMPARISON", {
    bookingId,
    old: r.cleaner_payout_cents,
    new: earnings.payout_earnings_cents,
  });

  void logSystemEvent({
    level: "info",
    source: "PAYOUT_CALCULATED",
    message: "Cleaner payout persisted",
    context: {
      bookingId,
      cleanerId: expectedCleanerId,
      cleanerPayoutCents: payout.payoutCents,
      cleanerBonusCents: payout.bonusCents,
      companyRevenueCents: payout.companyRevenueCents,
      payoutType: payout.payoutType,
      payoutPercentage: payout.payoutPercentage,
      payoutBaseCents: payout.payoutBaseCents,
      serviceFeeCents: payout.serviceFeeCents,
    },
  });

  return { ok: true, skipped: false, payout };
}
