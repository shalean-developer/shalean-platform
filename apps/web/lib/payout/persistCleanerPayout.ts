import {
  calculateCleanerPayoutFromBookingRow,
  type CleanerPayoutResult,
  resolvePayoutBaseAndServiceFeeCents,
} from "@/lib/payout/calculateCleanerPayout";
import {
  bookingSignalsPaidForZeroDisplayRecompute,
  bookingsPersistSelectListForPersist,
  fetchBookingDisplayEarningsCents,
  hasPersistedDisplayEarningsBasis,
} from "@/lib/payout/bookingEarningsIntegrity";
import { computeBookingEarnings, type ComputeBookingEarningsOutput } from "@/lib/payout/computeBookingEarnings";
import { sumEligibleLineItemsSubtotalCents } from "@/lib/payout/computeEarningsFromLineItems";
import { persistBookingCleanerEarningsSnapshot } from "@/lib/payout/persistBookingCleanerEarningsSnapshot";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { newPayoutMoneyPathErrorId } from "@/lib/payout/payoutMoneyPathErrorId";
import { parseBookingServiceId } from "@/components/booking/serviceCategories";
import type { SupabaseClient } from "@supabase/supabase-js";

const EARNINGS_MODEL_VERSION_FALLBACK = "v1_2026_earnings";

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

function isValidEarningsShape(e: ComputeBookingEarningsOutput | null | undefined): e is ComputeBookingEarningsOutput {
  if (!e) return false;
  const d = Number(e.display_earnings_cents);
  const p = Number(e.payout_earnings_cents);
  const i = Number(e.internal_earnings_cents);
  return Number.isFinite(d) && Number.isFinite(p) && Number.isFinite(i) && d >= 0 && p >= 0 && i >= 0;
}

/** Stale `display_earnings_cents = 0` while payment signals exist — recompute and overwrite. */
function shouldRecomputeZeroDisplayEarnings(r: {
  display_earnings_cents?: number | null;
  total_paid_zar?: number | null;
  total_paid_cents?: number | null;
  amount_paid_cents?: number | null;
  payment_status?: string | null;
  paid_at?: string | null;
  refunded_at?: string | null;
  refund_status?: string | null;
}): boolean {
  const d = r.display_earnings_cents;
  if (d == null || !Number.isFinite(Number(d))) return false;
  if (Math.round(Number(d)) !== 0) return false;
  return bookingSignalsPaidForZeroDisplayRecompute(r);
}

async function isCleanerAllowedForPersist(
  admin: SupabaseClient,
  r: {
    cleaner_id?: string | null;
    payout_owner_cleaner_id?: string | null;
    team_id?: string | null;
    is_team_job?: boolean | null;
  },
  expectedCleanerId: string,
): Promise<boolean> {
  const exp = expectedCleanerId.trim();
  if (r.is_team_job === true) {
    const teamId = String(r.team_id ?? "").trim();
    if (!teamId) return false;
    if (r.cleaner_id != null && String(r.cleaner_id).trim() === exp) return true;
    const owner = String(r.payout_owner_cleaner_id ?? "").trim();
    if (owner && owner === exp) return true;
    const { data, error } = await admin
      .from("team_members")
      .select("cleaner_id")
      .eq("team_id", teamId)
      .eq("cleaner_id", expectedCleanerId)
      .maybeSingle();
    return !error && data != null;
  }
  const cid = String(r.cleaner_id ?? "").trim();
  const owner = String(r.payout_owner_cleaner_id ?? "").trim();
  return cid === exp || owner === exp;
}

async function buildFallbackEarnings(params: {
  admin: SupabaseClient;
  r: {
    total_paid_zar?: number | null;
    total_paid_cents?: number | null;
    amount_paid_cents?: number | null;
    base_amount_cents?: number | null;
    service_fee_cents?: number | null;
    service?: string | null;
    booking_snapshot?: unknown;
    cleaner_payout_cents?: number | null;
  };
  expectedCleanerId: string;
  isTeamJob: boolean;
}): Promise<ComputeBookingEarningsOutput | null> {
  const { admin, r, expectedCleanerId, isTeamJob } = params;
  if (isTeamJob) {
    return null;
  }
  const legacy = Number(r.cleaner_payout_cents);
  if (Number.isFinite(legacy) && legacy >= 0) {
    const v = Math.floor(legacy);
    return {
      display_earnings_cents: v,
      payout_earnings_cents: v,
      internal_earnings_cents: v,
      earnings_model_version: EARNINGS_MODEL_VERSION_FALLBACK,
    };
  }
  const { data: cleaner, error: cErr } = await admin.from("cleaners").select("created_at").eq("id", expectedCleanerId).maybeSingle();
  if (cErr || !cleaner) return null;
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
  const v = Math.max(0, Math.floor(Number(payout.payoutCents)));
  return {
    display_earnings_cents: v,
    payout_earnings_cents: v,
    internal_earnings_cents: v,
    earnings_model_version: EARNINGS_MODEL_VERSION_FALLBACK,
  };
}

async function persistCleanerPayoutIfUnsetCore(
  params: { admin: SupabaseClient; bookingId: string; cleanerId: string },
): Promise<{ ok: true; skipped: boolean; payout?: CleanerPayoutResult } | { ok: false; error: string }> {
  const { admin, bookingId, cleanerId: expectedCleanerId } = params;
  const { data: row, error: selErr } = await admin
    .from("bookings")
    .select(bookingsPersistSelectListForPersist())
    .eq("id", bookingId)
    .maybeSingle();

  if (selErr || !row) {
    return { ok: false, error: selErr?.message ?? "Booking not found" };
  }

  const r = row as {
    payout_id?: string | null;
    cleaner_id?: string | null;
    payout_owner_cleaner_id?: string | null;
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
  payment_status?: string | null;
  paid_at?: string | null;
  refunded_at?: string | null;
  refund_status?: string | null;
  };

  if (!(await isCleanerAllowedForPersist(admin, r, expectedCleanerId))) {
    return { ok: true, skipped: true };
  }

  const payoutIdForLock = String(r.payout_id ?? "").trim();
  if (payoutIdForLock) {
    const { data: cp, error: cpErr } = await admin
      .from("cleaner_payouts")
      .select("status, frozen_at")
      .eq("id", payoutIdForLock)
      .maybeSingle();
    if (cpErr) return { ok: false, error: cpErr.message };
    const cpRow = cp as { status?: string | null; frozen_at?: string | null } | null;
    const frozenAt = cpRow?.frozen_at != null && String(cpRow.frozen_at).trim() !== "";
    const st = String(cpRow?.status ?? "")
      .trim()
      .toLowerCase();
    if (frozenAt || st === "frozen" || st === "approved" || st === "paid") {
      return { ok: true, skipped: true };
    }
  }

  const recomputeZeroDisplay = shouldRecomputeZeroDisplayEarnings(r);
  if (r.display_earnings_cents != null && Number.isFinite(Number(r.display_earnings_cents)) && !recomputeZeroDisplay) {
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

  let lineItemRows: { id: string; item_type: string; total_price_cents: number }[] = [];
  if (!isTeamJob) {
    const { data: li } = await admin
      .from("booking_line_items")
      .select("id, item_type, total_price_cents")
      .eq("booking_id", bookingId);
    lineItemRows = (li ?? [])
      .map((x) => x as { id?: string; item_type?: string; total_price_cents?: number })
      .filter((x) => typeof x.id === "string" && typeof x.item_type === "string")
      .map((x) => ({
        id: String(x.id),
        item_type: String(x.item_type),
        total_price_cents: Number(x.total_price_cents) || 0,
      }));
  }

  let earnings: ComputeBookingEarningsOutput | null = null;
  let usedFallback = false;
  let computeRejectReason: string | null = null;
  let usedLineItemBasis = false;

  async function tryComputeEarnings(servicePriceCents: number, team: boolean): Promise<ComputeBookingEarningsOutput | null> {
    try {
      const computed = await computeBookingEarnings({
        servicePriceCents,
        serviceId,
        cleanerId: expectedCleanerId,
        isTeamJob: team,
        bookingDate: bookingDateIso,
      });
      if (isValidEarningsShape(computed)) return computed;
      computeRejectReason = "invalid_compute_output";
    } catch (e) {
      computeRejectReason = `compute_threw:${String(e)}`;
    }
    return null;
  }

  if (!isTeamJob) {
    const lineSubtotal = sumEligibleLineItemsSubtotalCents(lineItemRows);
    if (lineSubtotal > 0) {
      const fromLines = await tryComputeEarnings(lineSubtotal, false);
      if (fromLines) {
        earnings = fromLines;
        usedLineItemBasis = true;
      }
    }
  }

  if (!earnings) {
    const fromBooking = await tryComputeEarnings(payoutBaseCents, isTeamJob);
    if (fromBooking) earnings = fromBooking;
  }

  if (!earnings) {
    const fb = await buildFallbackEarnings({ admin, r, expectedCleanerId, isTeamJob });
    if (!fb) {
      await reportOperationalIssue("warn", "persistCleanerPayoutIfUnset", "earnings fallback unresolved", {
        bookingId,
        cleanerId: expectedCleanerId,
      });
      return { ok: false, error: "Could not resolve earnings" };
    }
    earnings = fb;
    usedFallback = true;
  }

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

    let teamUp = admin
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
      .eq("team_id", teamId);
    teamUp = recomputeZeroDisplay ? teamUp.eq("display_earnings_cents", 0) : teamUp.is("display_earnings_cents", null);
    const { data: updatedTeam, error: teamUpErr } = await teamUp.select("id");
    if (teamUpErr) {
      await reportOperationalIssue("error", "persistCleanerPayoutIfUnset", teamUpErr.message, {
        bookingId,
        error_id: newPayoutMoneyPathErrorId(),
      });
      return { ok: false, error: teamUpErr.message };
    }
    if (!updatedTeam?.length) {
      return { ok: true, skipped: true };
    }
    const teamVerify = await verifyDisplayEarningsRowAfterWrite(admin, bookingId, "team_booking");
    if (!teamVerify.ok) {
      return { ok: false, error: teamVerify.error };
    }
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

  let soloUp = admin
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
    .eq("cleaner_id", expectedCleanerId);
  soloUp = recomputeZeroDisplay ? soloUp.eq("display_earnings_cents", 0) : soloUp.is("display_earnings_cents", null);
  const { data: updated, error: upErr } = await soloUp.select("id");

  if (upErr) {
    await reportOperationalIssue("error", "persistCleanerPayoutIfUnset", upErr.message, {
      bookingId,
      error_id: newPayoutMoneyPathErrorId(),
    });
    return { ok: false, error: upErr.message };
  }

  if (!updated?.length) {
    return { ok: true, skipped: true };
  }

  const soloVerify = await verifyDisplayEarningsRowAfterWrite(admin, bookingId, "solo_booking");
  if (!soloVerify.ok) {
    return { ok: false, error: soloVerify.error };
  }

  if (usedLineItemBasis && lineItemRows.length > 0) {
    const snap = await persistBookingCleanerEarningsSnapshot({
      admin,
      bookingId,
      cleanerId: expectedCleanerId,
      lineRows: lineItemRows,
      earnings,
    });
    if (!snap.ok) {
      void reportOperationalIssue("warn", "persistCleanerPayoutIfUnset", `booking_cleaner_earnings_snapshot: ${snap.error}`, {
        bookingId,
        cleanerId: expectedCleanerId,
      });
    }
  }

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
      used_line_item_earnings_basis: usedLineItemBasis,
    },
  });

  return { ok: true, skipped: false, payout };
}

async function verifyDisplayEarningsRowAfterWrite(
  admin: SupabaseClient,
  bookingId: string,
  context: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: v, error } = await admin.from("bookings").select("display_earnings_cents").eq("id", bookingId).maybeSingle();
  if (error) {
    await reportOperationalIssue("error", "persistCleanerPayoutIfUnset", `post-write verify select failed (${context}): ${error.message}`, {
      bookingId,
    });
    return { ok: false, error: "Post-write earnings verification failed" };
  }
  const d = (v as { display_earnings_cents?: unknown } | null)?.display_earnings_cents;
  if (!hasPersistedDisplayEarningsBasis(d)) {
    await reportOperationalIssue("error", "persistCleanerPayoutIfUnset", `post-write verify: display_earnings_cents missing or invalid (${context})`, {
      bookingId,
    });
    return { ok: false, error: "Earnings write verification failed" };
  }
  return { ok: true };
}

async function finalizePersistResult(
  admin: SupabaseClient,
  bookingId: string,
  cleanerId: string,
  core: Awaited<ReturnType<typeof persistCleanerPayoutIfUnsetCore>>,
): Promise<{ ok: true; skipped: boolean; payout?: CleanerPayoutResult } | { ok: false; error: string }> {
  if (!core.ok) return core;
  if (!core.skipped) return core;

  const cents = await fetchBookingDisplayEarningsCents(admin, bookingId);
  if (hasPersistedDisplayEarningsBasis(cents)) {
    return core;
  }

  await reportOperationalIssue("error", "persistCleanerPayoutIfUnset", "Earnings not written (skipped but display_earnings_cents still null/invalid)", {
    bookingId,
    cleanerId,
    error_id: newPayoutMoneyPathErrorId(),
  });
  return { ok: false, error: "Earnings not written" };
}

/**
 * Persists payout columns once per booking (immutable after first successful write).
 * Call when a cleaner is assigned and payment total is known — e.g. from `notifyCleanerAssignedBooking`.
 * Never throws: failures return `{ ok: false, error }` so callers do not break upstream flows.
 *
 * If the core run returns `skipped: true`, re-reads `display_earnings_cents`; when still not a finite
 * non-null value **≥ 0**, returns `{ ok: false, error: "Earnings not written" }` (no silent success).
 */
export async function persistCleanerPayoutIfUnset(
  params: { admin: SupabaseClient; bookingId: string; cleanerId: string },
): Promise<{ ok: true; skipped: boolean; payout?: CleanerPayoutResult } | { ok: false; error: string }> {
  try {
    const first = await persistCleanerPayoutIfUnsetCore(params);
    let out = await finalizePersistResult(params.admin, params.bookingId, params.cleanerId, first);
    if (!out.ok) {
      await new Promise((r) => setTimeout(r, 200));
      const second = await persistCleanerPayoutIfUnsetCore(params);
      out = await finalizePersistResult(params.admin, params.bookingId, params.cleanerId, second);
    }
    return out;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await reportOperationalIssue("error", "persistCleanerPayoutIfUnset", msg, {
      bookingId: params.bookingId,
      cleanerId: params.cleanerId,
      error_id: newPayoutMoneyPathErrorId(),
    });
    return { ok: false, error: msg };
  }
}
