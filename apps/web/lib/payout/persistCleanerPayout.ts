import {
  calculateCleanerPayoutFromBookingRow,
  type CleanerPayoutResult,
  resolvePayoutBaseAndServiceFeeCents,
} from "@/lib/payout/calculateCleanerPayout";
import {
  bookingAppointmentIsoUtc,
  FIXED_SPECIAL_PAYOUT_CENTS,
  normalizeBookingServiceIdForPayout,
  resolveCanonicalCleanerPayout,
  useLegacyPayoutEngine,
} from "@/lib/payout/canonicalCleanerPayout";
import {
  bookingSignalsPaidForZeroDisplayRecompute,
  bookingsPersistSelectListForPersist,
  fetchBookingDisplayEarningsCents,
  hasPersistedDisplayEarningsBasis,
} from "@/lib/payout/bookingEarningsIntegrity";
import { computeBookingEarnings, type ComputeBookingEarningsOutput } from "@/lib/payout/computeBookingEarnings";
import { sumEligibleLineItemsSubtotalCents } from "@/lib/payout/computeEarningsFromLineItems";
import { persistBookingCleanerEarningsSnapshot } from "@/lib/payout/persistBookingCleanerEarningsSnapshot";
import { computeCleanerEarningsForBooking } from "@/lib/payout/computeCleanerEarningsForBooking";
import {
  buildTeamJobMemberFixedPerCleanerPayoutRows,
  buildTeamJobMemberPayoutInsertRows,
  buildTeamJobMemberPayoutRowsFromEarningsSummary,
  fetchActiveTeamMemberIdsAtAppointment,
  fetchActiveTeamMemberIdsForMembershipDate,
  resolveTeamPayoutParticipantIds,
} from "@/lib/payout/teamRosterPayoutAllocation";
import { effectiveTeamMembershipDateYmd } from "@/lib/cleaner/teamMemberAvailability";
import {
  isPairedRosterSoloJob,
  leadEarningsRowFromSummary,
  loadBookingRosterRows,
  resolvePairedRosterLeaderId,
} from "@/lib/payout/pairedRosterPayout";
import { syncBookingRosterMemberPayouts } from "@/lib/payout/persistBookingRosterMemberPayouts";
import {
  perCleanerTotalFromCanonical,
  resolveBookingCanonicalPayout,
  type BookingRowForCanonicalPayout,
} from "@/lib/payout/resolveBookingCanonicalPayout";
import { ensureBookingLineItemsForEarningsIfMissing } from "@/lib/booking/ensureBookingLineItemsForEarnings";
import { repairBookingCompletionCoherenceIfNeeded } from "@/lib/booking/repairBookingCompletionCoherenceIfNeeded";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import {
  evaluatePersistCleanerPayoutEligibility,
  isActiveOnSiteBookingStatus,
  isPayoutEligibilitySkipReason,
} from "@/lib/payout/bookingPayoutPersistEligibility";
import {
  assertHybridPayoutWithinFinancialCap,
  bookingFinancialDiagnostics,
} from "@/lib/payout/bookingPayoutCapCents";
import { newPayoutMoneyPathErrorId } from "@/lib/payout/payoutMoneyPathErrorId";
import type { SupabaseClient } from "@supabase/supabase-js";

const EARNINGS_MODEL_VERSION_FALLBACK = "v1_2026_earnings";

/** Result of {@link persistCleanerPayoutIfUnset}; when `skipped`, `skipReason` is a stable machine-readable code (often with a suffix). */
export type PersistCleanerPayoutIfUnsetResult =
  | { ok: true; skipped: false; payout?: CleanerPayoutResult }
  | { ok: true; skipped: true; skipReason: string }
  | { ok: false; error: string; code?: "payout_exceeds_financial_cap" };

function resolveServiceIdForPersist(snapshot: unknown, serviceLabel: string | null | undefined): string {
  return String(normalizeBookingServiceIdForPayout(snapshot, serviceLabel));
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

function normalizeId(value: unknown): string {
  return String(value ?? "").trim();
}

function resolveTeamPayoutOwnershipInvariant(params: {
  expectedCleanerId: string;
  payoutOwnerCleanerId?: string | null;
  activeCleanerIds: readonly string[];
  rosterRows: readonly { cleaner_id?: string | null; role?: string | null }[];
}): { ok: true } | { ok: false; error: string } {
  const owner = normalizeId(params.payoutOwnerCleanerId);
  if (!owner) return { ok: false, error: "Team job missing payout_owner_cleaner_id" };

  const expected = normalizeId(params.expectedCleanerId);
  if (expected !== owner) return { ok: false, error: "Team payout persist cleaner does not match payout owner" };

  const rosterIds = new Set(params.rosterRows.map((row) => normalizeId(row.cleaner_id)).filter(Boolean));

  if (rosterIds.size > 0) {
    if (!rosterIds.has(owner)) {
      return { ok: false, error: "Team payout owner is missing from booking roster" };
    }
  } else {
    const activeIds = new Set(params.activeCleanerIds.map(normalizeId).filter(Boolean));
    if (!activeIds.has(owner)) {
      return { ok: false, error: "Team payout owner is not an active team member" };
    }
  }

  const leadIds = params.rosterRows
    .filter((row) => String(row.role ?? "").trim().toLowerCase() === "lead")
    .map((row) => normalizeId(row.cleaner_id))
    .filter(Boolean);
  if (leadIds.length > 0 && !leadIds.includes(owner)) {
    return { ok: false, error: "Team payout owner does not match booking roster lead" };
  }

  return { ok: true };
}

async function isCleanerAllowedForPersist(
  admin: SupabaseClient,
  r: {
    status?: string | null;
    cleaner_id?: string | null;
    payout_owner_cleaner_id?: string | null;
    team_id?: string | null;
    is_team_job?: boolean | null;
  },
  expectedCleanerId: string,
  bookingId: string,
): Promise<boolean> {
  const exp = expectedCleanerId.trim();
  const st = String(r.status ?? "").trim().toLowerCase();
  const activeOnSite = isActiveOnSiteBookingStatus(st);

  if (r.is_team_job === true) {
    const teamId = String(r.team_id ?? "").trim();
    if (!teamId) return false;
    if (r.cleaner_id != null && String(r.cleaner_id).trim() === exp) return true;
    const owner = String(r.payout_owner_cleaner_id ?? "").trim();
    if (owner && owner === exp) return true;
    const bid = String(bookingId ?? "").trim();
    if (bid) {
      const { data: bc, error: bcErr } = await admin
        .from("booking_cleaners")
        .select("id")
        .eq("booking_id", bid)
        .eq("cleaner_id", expectedCleanerId)
        .maybeSingle();
      if (!bcErr && bc) return true;
    }
    const { data, error } = await admin
      .from("team_members")
      .select("cleaner_id")
      .eq("team_id", teamId)
      .eq("cleaner_id", expectedCleanerId)
      .maybeSingle();
    if (!error && data != null) return true;
    if (activeOnSite) {
      return isCleanerAllowedForPreview(admin, r, expectedCleanerId, bookingId);
    }
    return false;
  }
  const cid = String(r.cleaner_id ?? "").trim();
  const owner = String(r.payout_owner_cleaner_id ?? "").trim();
  if (cid === exp || owner === exp) return true;
  const bid = String(bookingId ?? "").trim();
  if (bid) {
    const { data: bc, error: bcErr } = await admin
      .from("booking_cleaners")
      .select("id")
      .eq("booking_id", bid)
      .eq("cleaner_id", expectedCleanerId)
      .maybeSingle();
    if (!bcErr && bc) return true;
  }
  if (activeOnSite) {
    return isCleanerAllowedForPreview(admin, r, expectedCleanerId, bookingId);
  }
  return false;
}

async function updateBookingSoloDisplayColumns(
  admin: SupabaseClient,
  bookingId: string,
  patch: Record<string, unknown>,
  opts: { forceDisplay: boolean; recomputeZeroDisplay: boolean },
): Promise<{ updatedIds: string[]; error: string | null }> {
  let soloUp = admin
    .from("bookings")
    .update(patch)
    .eq("id", bookingId)
    .or("is_team_job.eq.false,is_team_job.is.null");
  soloUp = opts.forceDisplay
    ? soloUp
    : opts.recomputeZeroDisplay
      ? soloUp.eq("display_earnings_cents", 0)
      : soloUp.is("display_earnings_cents", null);
  const { data: updated, error: upErr } = await soloUp.select("id");
  if (upErr) return { updatedIds: [], error: upErr.message };
  const ids = (updated ?? []).map((row) => String((row as { id?: string }).id ?? "")).filter(Boolean);
  if (ids.length > 0 || !opts.forceDisplay) {
    return { updatedIds: ids, error: null };
  }
  const { data: retryUpdated, error: retryErr } = await admin.from("bookings").update(patch).eq("id", bookingId).select("id");
  if (retryErr) return { updatedIds: [], error: retryErr.message };
  return {
    updatedIds: (retryUpdated ?? []).map((row) => String((row as { id?: string }).id ?? "")).filter(Boolean),
    error: null,
  };
}

/**
 * Read-only access predicate for the cleaner-facing earnings preview surface.
 * Strictly looser than {@link isCleanerAllowedForPersist} (which protects
 * payout column writes): also accepts cleaners with a non-expired pending
 * `dispatch_offers` row for the booking, **and** cleaners on the
 * `booking_cleaners` roster (covers selected-cleaner / partially-assigned
 * solo flows).
 *
 * Why this exists: pre-acceptance, `bookings.cleaner_id` and
 * `payout_owner_cleaner_id` are NULL for solo dispatch offers — only set
 * inside `acceptDispatchOffer`. Reusing the persist gate for the preview
 * path therefore rejected every solo offer, and the cleaner saw "Job
 * earning unavailable" on every pending offer card. This predicate restores
 * that read access without granting any write capability.
 */
async function isCleanerAllowedForPreview(
  admin: SupabaseClient,
  r: {
    cleaner_id?: string | null;
    payout_owner_cleaner_id?: string | null;
    team_id?: string | null;
    is_team_job?: boolean | null;
  },
  expectedCleanerId: string,
  bookingId: string,
): Promise<boolean> {
  if (await isCleanerAllowedForPersist(admin, r, expectedCleanerId, bookingId)) return true;

  const bid = String(bookingId ?? "").trim();
  if (!bid) return false;

  /** Pending offer for this cleaner on this booking → they are being shown the offer card right now. */
  const nowIso = new Date().toISOString();
  const { data: openOffer, error: offerErr } = await admin
    .from("dispatch_offers")
    .select("id")
    .eq("booking_id", bid)
    .eq("cleaner_id", expectedCleanerId)
    .eq("status", "pending")
    .gt("expires_at", nowIso)
    .limit(1)
    .maybeSingle();
  if (!offerErr && openOffer) return true;

  /** Roster row (selected-cleaner / pre-assigned solo). booking_cleaners is read-only at preview time. */
  const { data: rosterRow, error: rosterErr } = await admin
    .from("booking_cleaners")
    .select("id")
    .eq("booking_id", bid)
    .eq("cleaner_id", expectedCleanerId)
    .limit(1)
    .maybeSingle();
  if (!rosterErr && rosterRow) return true;

  return false;
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
    date?: string | null;
    time?: string | null;
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
  const { data: cleaner, error: cErr } = await admin
    .from("cleaners")
    .select("joined_at, created_at")
    .eq("id", expectedCleanerId)
    .maybeSingle();
  if (cErr || !cleaner) return null;
  const row = cleaner as { joined_at?: string | null; created_at?: string | null };
  const joinedAt = String(row.joined_at ?? row.created_at ?? "").trim();
  const { payoutBaseCents } = resolvePayoutBaseAndServiceFeeCents({
    baseAmountCents: r.base_amount_cents,
    serviceFeeCents: r.service_fee_cents,
    totalPaidZar: r.total_paid_zar,
    amountPaidCents: r.total_paid_cents ?? r.amount_paid_cents,
    priceSnapshot: (r as { price_snapshot?: unknown }).price_snapshot,
  });
  const sid = resolveServiceIdForPersist(r.booking_snapshot ?? null, r.service ?? null);
  const appt = bookingAppointmentIsoUtc(r.date, r.time);
  const c = resolveCanonicalCleanerPayout({
    serviceId: sid,
    serviceLabel: r.service ?? null,
    cleanerJoinedAtIso: joinedAt || null,
    bookingAppointmentIsoUtc: appt,
    bookingValueCents: payoutBaseCents,
    isTeamJob: false,
  });
  return {
    display_earnings_cents: c.displayEarningsCents,
    payout_earnings_cents: c.payoutEarningsCents,
    internal_earnings_cents: c.internalEarningsCents,
    earnings_model_version: c.earningsModelVersion,
    earnings_percentage_applied: c.earningsPercentageApplied ?? undefined,
    earnings_cap_cents_applied: c.earningsCapCentsApplied ?? undefined,
    earnings_tenure_months_at_assignment: c.tenureMonths,
  };
}

async function resolveTeamCleanerCountForCanonical(
  admin: SupabaseClient,
  r: {
    team_id?: string | null;
    date?: string | null;
    time?: string | null;
    assigned_at?: string | null;
    team_member_count_snapshot?: number | null;
  },
  bookingId: string,
): Promise<number> {
  const teamId = String(r.team_id ?? "").trim();
  const membershipDateYmd = effectiveTeamMembershipDateYmd(r.date, r.assigned_at);
  if (teamId && membershipDateYmd) {
    const ids = await fetchActiveTeamMemberIdsForMembershipDate(admin, teamId, membershipDateYmd);
    if (ids.length > 0) return ids.length;
  }
  const appt = bookingAppointmentIsoUtc(r.date, r.time);
  if (teamId && appt) {
    const ids = await fetchActiveTeamMemberIdsAtAppointment(admin, teamId, appt);
    if (ids.length > 0) return ids.length;
  }
  const snap = Number(r.team_member_count_snapshot);
  if (Number.isFinite(snap) && snap > 0) return Math.floor(snap);
  const { data: roster } = await admin.from("booking_cleaners").select("cleaner_id").eq("booking_id", bookingId);
  const n = (roster ?? []).filter((x) =>
    /^[0-9a-f-]{36}$/i.test(String((x as { cleaner_id?: string | null }).cleaner_id ?? "").trim()),
  ).length;
  return Math.max(1, n);
}

export type PersistBookingRowForEarnings = {
  is_team_job?: boolean | null;
  team_id?: string | null;
  team_member_count_snapshot?: number | null;
  base_amount_cents?: number | null;
  service_fee_cents?: number | null;
  total_paid_zar?: number | null;
  total_paid_cents?: number | null;
  amount_paid_cents?: number | null;
  service?: string | null;
  booking_snapshot?: unknown;
  date?: string | null;
  time?: string | null;
  cleaner_payout_cents?: number | null;
};

export type ResolvePersistEarningsComputationResult =
  | {
      ok: true;
      earnings: ComputeBookingEarningsOutput;
      usedLineItemBasis: boolean;
      usedFallback: boolean;
      lineItemRows: { id: string; item_type: string; total_price_cents: number }[];
      payoutBaseCents: number;
      serviceFeeCents: number;
      bookingDateIso: string;
    }
  | { ok: false; error: string };

/**
 * Same earnings resolution as {@link persistCleanerPayoutIfUnsetCore} (line items → compute → fallback),
 * without writing. Used for cleaner-facing previews when `display_earnings_cents` is not yet persisted.
 */
export async function resolvePersistEarningsComputation(params: {
  admin: SupabaseClient;
  bookingId: string;
  expectedCleanerId: string;
  r: PersistBookingRowForEarnings;
}): Promise<ResolvePersistEarningsComputationResult> {
  const { admin, bookingId, expectedCleanerId, r } = params;
  const isTeamJob = r.is_team_job === true;
  let teamCleanerCountForCanonical: number | undefined;
  if (isTeamJob) {
    teamCleanerCountForCanonical = await resolveTeamCleanerCountForCanonical(admin, r, bookingId);
  }

  const { payoutBaseCents, serviceFeeCents } = resolvePayoutBaseAndServiceFeeCents({
    baseAmountCents: r.base_amount_cents,
    serviceFeeCents: r.service_fee_cents,
    totalPaidZar: r.total_paid_zar,
    amountPaidCents: r.total_paid_cents ?? r.amount_paid_cents,
    priceSnapshot: (r as { price_snapshot?: unknown }).price_snapshot,
  });
  const bookingDateIso = bookingAppointmentIsoUtc(r.date, r.time) ?? "";
  const serviceId = resolveServiceIdForPersist(r.booking_snapshot ?? null, r.service ?? null);

  let lineItemRows: {
    id: string;
    item_type: string;
    slug: string | null;
    name: string | null;
    metadata: Record<string, unknown> | null;
    earns_cleaner: boolean | null;
    total_price_cents: number;
  }[] = [];
  if (!isTeamJob) {
    const { data: li } = await admin
      .from("booking_line_items")
      .select("id, item_type, slug, name, metadata, earns_cleaner, total_price_cents")
      .eq("booking_id", bookingId);
    lineItemRows = (li ?? [])
      .map(
        (x) =>
          x as {
            id?: string;
            item_type?: string;
            slug?: string | null;
            name?: string | null;
            metadata?: Record<string, unknown> | null;
            earns_cleaner?: boolean | null;
            total_price_cents?: number;
          },
      )
      .filter((x) => typeof x.id === "string" && typeof x.item_type === "string")
      .map((x) => ({
        id: String(x.id),
        item_type: String(x.item_type),
        slug: x.slug ?? null,
        name: x.name ?? null,
        metadata: x.metadata ?? null,
        earns_cleaner: x.earns_cleaner ?? null,
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
        teamCleanerCount: team ? teamCleanerCountForCanonical : undefined,
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
      return { ok: false, error: "Could not resolve earnings" };
    }
    earnings = fb;
    usedFallback = true;
  }

  return {
    ok: true,
    earnings,
    usedLineItemBasis,
    usedFallback,
    lineItemRows,
    payoutBaseCents,
    serviceFeeCents,
    bookingDateIso,
  };
}

async function previewTeamMemberAllocatedCents(params: {
  admin: SupabaseClient;
  bookingId: string;
  teamId: string;
  cleanerId: string;
  earnings: ComputeBookingEarningsOutput;
  bookingDateIso: string;
  eligibleAmountCents: number;
  bookingRow: BookingRowForCanonicalPayout;
}): Promise<number | null> {
  const { admin, bookingId, cleanerId, earnings } = params;

  const { data: rosterRows, error: rosterErr } = await admin
    .from("booking_cleaners")
    .select("cleaner_id, role, payout_weight, lead_bonus_cents")
    .eq("booking_id", bookingId)
    .order("cleaner_id", { ascending: true });
  if (rosterErr) return null;

  const activeTeamMemberIds = await fetchActiveTeamMemberIdsAtAppointment(
    admin,
    params.teamId,
    params.bookingDateIso,
  );
  const participantIds = resolveTeamPayoutParticipantIds({
    rosterRows: rosterRows ?? [],
    activeTeamMemberIds,
  });
  if (!participantIds.length) return null;

  const exp = cleanerId.trim();
  if (!participantIds.includes(exp)) return null;

  if (!useLegacyPayoutEngine()) {
    const canonical = await resolveBookingCanonicalPayout(admin, {
      bookingId,
      row: params.bookingRow,
      expectedCleanerId: cleanerId,
      eligibleAmountCents: params.eligibleAmountCents,
    });
    return perCleanerTotalFromCanonical(canonical, exp);
  }

  const poolCents = Math.max(0, Math.floor(Number(earnings.payout_earnings_cents) || 0));
  if (poolCents <= 0) return null;

  const payoutRows = buildTeamJobMemberPayoutInsertRows({
    bookingId,
    teamId: params.teamId,
    poolCents,
    rosterRows: rosterRows ?? [],
    fallbackCleanerIds: participantIds,
  });
  const mine = payoutRows.find((pr) => pr.cleaner_id === exp);
  return mine != null ? Math.max(0, Math.floor(mine.payout_cents)) : null;
}

/**
 * Stable machine-readable miss codes for the diagnostic preview wrapper.
 * `cleaner_offers_preview_earnings_unavailable` system_log rows filter on
 * these — keep stable.
 */
export const PREVIEW_EARNINGS_MISS = {
  BOOKING_NOT_FOUND: "booking_not_found",
  CLEANER_NOT_ELIGIBLE: "cleaner_not_eligible_for_preview",
  COMPUTE_FAILED: "earnings_compute_failed",
  TEAM_MISSING_TEAM_ID: "team_missing_team_id",
  TEAM_MEMBER_NOT_ALLOCATED: "team_member_not_allocated",
} as const;

export type PreviewEarningsMissReason =
  | (typeof PREVIEW_EARNINGS_MISS)[keyof typeof PREVIEW_EARNINGS_MISS]
  | (string & {});

export type PreviewDisplayEarningsForCleanerJobDiagnostic =
  | { ok: true; amountCents: number; source: "persist_engine"; missingReason: null }
  | { ok: false; amountCents: null; source: null; missingReason: PreviewEarningsMissReason };

/**
 * Diagnostic variant of {@link previewDisplayEarningsCentsForCleanerJob} that
 * returns the *reason* the preview did not produce an amount. Callers (the
 * offers route, the dashboard route, the repair script) emit this directly to
 * `system_logs` so we can chase data gaps. The plain helper below preserves
 * the existing `Promise<number | null>` shape for legacy call sites.
 */
export async function previewDisplayEarningsCentsForCleanerJobDiagnostic(
  admin: SupabaseClient,
  params: { bookingId: string; cleanerId: string },
): Promise<PreviewDisplayEarningsForCleanerJobDiagnostic> {
  const { bookingId, cleanerId } = params;
  const { data: row, error: selErr } = await admin
    .from("bookings")
    .select(bookingsPersistSelectListForPersist())
    .eq("id", bookingId)
    .maybeSingle();
  if (selErr || !row) {
    return { ok: false, amountCents: null, source: null, missingReason: PREVIEW_EARNINGS_MISS.BOOKING_NOT_FOUND };
  }

  const r = row as PersistBookingRowForEarnings & {
    cleaner_id?: string | null;
    payout_owner_cleaner_id?: string | null;
    team_id?: string | null;
  };

  /**
   * Pre-acceptance solo dispatch offers have `cleaner_id = NULL` and
   * `payout_owner_cleaner_id = NULL` — the persist gate would reject them
   * even though we are explicitly being asked for a cleaner-facing preview.
   * The preview-only predicate accepts cleaners with an open pending offer
   * or a `booking_cleaners` roster row, which is exactly the set the offers
   * route is allowed to surface.
   */
  if (!(await isCleanerAllowedForPreview(admin, r, cleanerId, bookingId))) {
    return {
      ok: false,
      amountCents: null,
      source: null,
      missingReason: PREVIEW_EARNINGS_MISS.CLEANER_NOT_ELIGIBLE,
    };
  }

  const isTeamJob = r.is_team_job === true;
  const earned = await resolvePersistEarningsComputation({ admin, bookingId, expectedCleanerId: cleanerId, r });
  if (!earned.ok) {
    return {
      ok: false,
      amountCents: null,
      source: null,
      missingReason: `${PREVIEW_EARNINGS_MISS.COMPUTE_FAILED}:${earned.error}`,
    };
  }

  if (!isTeamJob) {
    const rosterRows = await loadBookingRosterRows(admin, bookingId);
    if (isPairedRosterSoloJob({ isTeamJob: false, rosterRows })) {
      const canonical = await resolveBookingCanonicalPayout(admin, {
        bookingId,
        row: r as BookingRowForCanonicalPayout,
        expectedCleanerId: cleanerId,
      });
      const cents = perCleanerTotalFromCanonical(canonical, cleanerId);
      if (cents != null) {
        return { ok: true, amountCents: cents, source: "persist_engine", missingReason: null };
      }
    }
    const cents = Math.max(0, Math.floor(Number(earned.earnings.display_earnings_cents) || 0));
    return { ok: true, amountCents: cents, source: "persist_engine", missingReason: null };
  }

  const teamId = String(r.team_id ?? "").trim();
  if (!teamId) {
    return {
      ok: false,
      amountCents: null,
      source: null,
      missingReason: PREVIEW_EARNINGS_MISS.TEAM_MISSING_TEAM_ID,
    };
  }
  const allocated = await previewTeamMemberAllocatedCents({
    admin,
    bookingId,
    teamId,
    cleanerId,
    earnings: earned.earnings,
    bookingDateIso: earned.bookingDateIso,
    eligibleAmountCents: earned.payoutBaseCents,
    bookingRow: r as BookingRowForCanonicalPayout,
  });
  if (allocated == null) {
    return {
      ok: false,
      amountCents: null,
      source: null,
      missingReason: PREVIEW_EARNINGS_MISS.TEAM_MEMBER_NOT_ALLOCATED,
    };
  }
  return { ok: true, amountCents: allocated, source: "persist_engine", missingReason: null };
}

/**
 * Read-only cents the viewer should see when `display_earnings_cents` is unset: same path as payout persist
 * (caps + tenure for solo; team jobs: R250 per cleaner when canonical, else legacy pool split).
 *
 * @deprecated Prefer {@link previewDisplayEarningsCentsForCleanerJobDiagnostic} so callers can
 * surface stable miss reasons in `system_logs`. This wrapper now delegates to the diagnostic
 * variant and discards the reason for backwards compatibility.
 */
export async function previewDisplayEarningsCentsForCleanerJob(
  admin: SupabaseClient,
  params: { bookingId: string; cleanerId: string },
): Promise<number | null> {
  const r = await previewDisplayEarningsCentsForCleanerJobDiagnostic(admin, params);
  return r.ok ? r.amountCents : null;
}

async function persistCleanerPayoutIfUnsetCore(
  params: { admin: SupabaseClient; bookingId: string; cleanerId: string; forceDisplayRecompute?: boolean },
): Promise<PersistCleanerPayoutIfUnsetResult> {
  const { admin, bookingId, cleanerId: expectedCleanerId, forceDisplayRecompute } = params;
  const forceDisplay = forceDisplayRecompute === true;
  const { data: row, error: selErr } = await admin
    .from("bookings")
    .select(bookingsPersistSelectListForPersist())
    .eq("id", bookingId)
    .maybeSingle();

  if (selErr || !row) {
    return { ok: false, error: selErr?.message ?? "Booking not found" };
  }

  const r = row as {
    status?: string | null;
    completed_at?: string | null;
    payment_needs_follow_up?: boolean | null;
    dispatch_status?: string | null;
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
    billing_type?: string | null;
    is_monthly_billing_booking?: boolean | null;
    monthly_invoice_id?: string | null;
    base_amount_cents?: number | null;
    service_fee_cents?: number | null;
    service?: string | null;
    booking_snapshot?: unknown;
  payment_status?: string | null;
  paid_at?: string | null;
  refunded_at?: string | null;
  refund_status?: string | null;
  };

  const persistEligibility = evaluatePersistCleanerPayoutEligibility(row as unknown as Record<string, unknown>);
  if (!persistEligibility.allowed) {
    void reportOperationalIssue("warn", "persistCleanerPayoutIfUnset", persistEligibility.skipReason, {
      bookingId,
      cleanerId: expectedCleanerId,
    });
    return { ok: true, skipped: true, skipReason: persistEligibility.skipReason };
  }

  if (!(await isCleanerAllowedForPersist(admin, r, expectedCleanerId, bookingId))) {
    return { ok: true, skipped: true, skipReason: "cleaner_not_eligible" };
  }

  const isTeamJob = r.is_team_job === true;

  if (!isTeamJob) {
    const ensured = await ensureBookingLineItemsForEarningsIfMissing(admin, bookingId, { isTeamJob: false });
    if (!ensured.ok) {
      return { ok: false, error: ensured.error };
    }
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
      return { ok: true, skipped: true, skipReason: "weekly_payout_locked" };
    }
  }

  const recomputeZeroDisplay = shouldRecomputeZeroDisplayEarnings(r);
  if (
    !forceDisplay &&
    r.display_earnings_cents != null &&
    Number.isFinite(Number(r.display_earnings_cents)) &&
    !recomputeZeroDisplay
  ) {
    let lineEarlyReason: string | null = null;
    if (!isTeamJob) {
      const lineEarly = await computeCleanerEarningsForBooking({
        admin,
        bookingId,
        cleanerId: expectedCleanerId,
        canonicalDisplayCents: hasPersistedDisplayEarningsBasis(r.display_earnings_cents)
          ? Math.max(0, Math.round(Number(r.display_earnings_cents)))
          : null,
      });
      if (!lineEarly.ok) {
        void reportOperationalIssue("warn", "persistCleanerPayoutIfUnset", `computeCleanerEarningsForBooking: ${lineEarly.error}`, {
          bookingId,
          cleanerId: expectedCleanerId,
        });
        lineEarlyReason = `compute_error:${lineEarly.error}`;
      } else if (lineEarly.skipped) {
        lineEarlyReason = lineEarly.reason;
      }
      if (String(r.status ?? "").toLowerCase() === "completed" || String(r.completed_at ?? "").trim()) {
        await repairBookingCompletionCoherenceIfNeeded({
          admin,
          bookingId,
          row: r,
          ensureLedger: true,
        });
      }
    }
    const skipReason = isTeamJob
      ? "display_earnings_already_set_team"
      : lineEarlyReason
        ? `display_earnings_already_set:${lineEarlyReason}`
        : "display_earnings_already_set";
    return { ok: true, skipped: true, skipReason };
  }

  const earned = await resolvePersistEarningsComputation({
    admin,
    bookingId,
    expectedCleanerId,
    r,
  });
  if (!earned.ok) {
    await reportOperationalIssue("warn", "persistCleanerPayoutIfUnset", "earnings fallback unresolved", {
      bookingId,
      cleanerId: expectedCleanerId,
    });
    return { ok: false, error: earned.error };
  }
  const { earnings, usedFallback, usedLineItemBasis, lineItemRows, payoutBaseCents, serviceFeeCents, bookingDateIso } =
    earned;

  if (isTeamJob) {
    const teamId = String(r.team_id ?? "").trim();
    if (!teamId) return { ok: false, error: "Team job missing team_id" };

    const membershipDateYmd = effectiveTeamMembershipDateYmd(
      r.date,
      (r as { assigned_at?: string | null }).assigned_at,
    );
    const activeTeamMemberIds = membershipDateYmd
      ? await fetchActiveTeamMemberIdsForMembershipDate(admin, teamId, membershipDateYmd)
      : [];

    const { data: rosterRows, error: rosterErr } = await admin
      .from("booking_cleaners")
      .select("cleaner_id, role, payout_weight, lead_bonus_cents")
      .eq("booking_id", bookingId)
      .order("cleaner_id", { ascending: true });
    if (rosterErr) return { ok: false, error: rosterErr.message };

    const participantIds = resolveTeamPayoutParticipantIds({
      rosterRows: rosterRows ?? [],
      activeTeamMemberIds,
    });
    if (!participantIds.length) return { ok: false, error: "No team payout participants for booking" };

    const poolCents = Math.max(0, Math.floor(Number(earnings.payout_earnings_cents) || 0));
    const legacyTeamPool = useLegacyPayoutEngine();
    const teamEligibleCents = usedLineItemBasis
      ? sumEligibleLineItemsSubtotalCents(lineItemRows)
      : payoutBaseCents;
    const teamCanonical = legacyTeamPool
      ? null
      : await resolveBookingCanonicalPayout(admin, {
          bookingId,
          row: r as BookingRowForCanonicalPayout,
          expectedCleanerId,
          eligibleAmountCents: teamEligibleCents > 0 ? teamEligibleCents : payoutBaseCents,
          computedAtIso: new Date().toISOString(),
        });
    const teamSummary = teamCanonical?.earningsSummary ?? null;

    const ownership = resolveTeamPayoutOwnershipInvariant({
      expectedCleanerId,
      payoutOwnerCleanerId: r.payout_owner_cleaner_id,
      activeCleanerIds: activeTeamMemberIds,
      rosterRows: rosterRows ?? [],
    });
    if (!ownership.ok) return ownership;

    const { data: statusRows, error: statusErr } = await admin
      .from("team_job_member_payouts")
      .select("status")
      .eq("booking_id", bookingId)
      .eq("team_id", teamId);
    if (statusErr) return { ok: false, error: statusErr.message };
    const hasLockedMemberPayout = (statusRows ?? []).some(
      (row) => String((row as { status?: string | null }).status ?? "").toLowerCase() !== "pending",
    );

    if (!hasLockedMemberPayout) {
      const { error: delErr } = await admin.from("team_job_member_payouts").delete().eq("booking_id", bookingId).eq("team_id", teamId);
      if (delErr) return { ok: false, error: delErr.message };

      const payoutRows = legacyTeamPool
        ? buildTeamJobMemberPayoutInsertRows({
            bookingId,
            teamId,
            poolCents,
            rosterRows: rosterRows ?? [],
            fallbackCleanerIds: participantIds,
          })
        : teamSummary
          ? buildTeamJobMemberPayoutRowsFromEarningsSummary({
              bookingId,
              teamId,
              summary: teamSummary,
            })
          : buildTeamJobMemberFixedPerCleanerPayoutRows({
              bookingId,
              teamId,
              rosterRows: rosterRows ?? [],
              fallbackCleanerIds: participantIds,
            });

      if (payoutRows.length > 0) {
        const { error: insErr } = await admin.from("team_job_member_payouts").insert(payoutRows);
        if (insErr) return { ok: false, error: insErr.message };
      }
    } else {
      const { data: existingRows, error: existingErr } = await admin
        .from("team_job_member_payouts")
        .select("cleaner_id")
        .eq("booking_id", bookingId)
        .eq("team_id", teamId);
      if (existingErr) return { ok: false, error: existingErr.message };
      const existingCleanerIds = new Set(
        (existingRows ?? []).map((row) => String((row as { cleaner_id?: string | null }).cleaner_id ?? "").trim()).filter(Boolean),
      );
      const perMember = legacyTeamPool
        ? participantIds.length > 0
          ? Math.max(0, Math.floor(poolCents / participantIds.length))
          : 0
        : teamSummary
          ? Math.max(
              0,
              Math.floor(
                (teamSummary.per_cleaner_earnings.find((row) => row.cleaner_id === participantIds[0])?.total_cents ??
                  teamCanonical?.displayEarningsCents ??
                  FIXED_SPECIAL_PAYOUT_CENTS) || 0,
              ),
            )
          : FIXED_SPECIAL_PAYOUT_CENTS;
      const inserts = participantIds
        .filter((cid) => cid && !existingCleanerIds.has(cid))
        .map((cid) => ({
          booking_id: bookingId,
          team_id: teamId,
          cleaner_id: cid,
          payout_cents: perMember,
          status: "pending",
        }));
      if (inserts.length > 0) {
        const { error: insErr } = await admin.from("team_job_member_payouts").insert(inserts);
        if (insErr) return { ok: false, error: insErr.message };
      }
    }

    let teamUp = admin
      .from("bookings")
      .update({
        cleaner_payout_cents: 0,
        cleaner_bonus_cents: 0,
        company_revenue_cents:
          teamSummary?.company_revenue_cents ??
          teamCanonical?.companyRevenueFromServiceCents ??
          Math.max(0, payoutBaseCents + serviceFeeCents - (teamCanonical?.internalEarningsCents ?? 0)),
        payout_percentage: teamCanonical?.payoutPercentage ?? null,
        payout_type: legacyTeamPool
          ? "team_fixed"
          : (teamCanonical?.payoutType ?? "team_per_cleaner_fixed"),
        display_earnings_cents: teamCanonical?.displayEarningsCents ?? earnings.display_earnings_cents,
        payout_earnings_cents: teamCanonical?.payoutEarningsCents ?? earnings.payout_earnings_cents,
        internal_earnings_cents:
          teamSummary?.total_cleaner_earnings_cents ??
          teamCanonical?.internalEarningsCents ??
          earnings.internal_earnings_cents,
        earnings_model_version: teamCanonical?.earningsModelVersion ?? earnings.earnings_model_version,
        earnings_percentage_applied:
          teamCanonical?.earningsPercentageApplied ?? earnings.earnings_percentage_applied ?? null,
        earnings_cap_cents_applied:
          teamCanonical?.earningsCapCentsApplied ?? earnings.earnings_cap_cents_applied ?? null,
        earnings_tenure_months_at_assignment:
          teamCanonical?.tenureMonths ?? earnings.earnings_tenure_months_at_assignment ?? null,
        earnings_summary: teamSummary,
      })
      .eq("id", bookingId)
      .eq("team_id", teamId);
    teamUp = forceDisplay
      ? teamUp
      : recomputeZeroDisplay
        ? teamUp.eq("display_earnings_cents", 0)
        : teamUp.is("display_earnings_cents", null);
    const { data: updatedTeam, error: teamUpErr } = await teamUp.select("id");
    if (teamUpErr) {
      await reportOperationalIssue("error", "persistCleanerPayoutIfUnset", teamUpErr.message, {
        bookingId,
        error_id: newPayoutMoneyPathErrorId(),
      });
      return { ok: false, error: teamUpErr.message };
    }
    if (!updatedTeam?.length) {
      return { ok: true, skipped: true, skipReason: "team_display_update_noop" };
    }
    const teamVerify = await verifyDisplayEarningsRowAfterWrite(admin, bookingId, "team_booking");
    if (!teamVerify.ok) {
      return { ok: false, error: teamVerify.error };
    }
    void logSystemEvent({
      level: "info",
      source: "persistCleanerPayoutIfUnset",
      message: legacyTeamPool ? "legacy_team_pool_payout_persisted" : "canonical_team_payout_persisted",
      context: {
        bookingId,
        team_id: teamId,
        cleanerId: expectedCleanerId,
        used_fallback: usedFallback,
        legacy_team_pool: legacyTeamPool,
        ...(teamCanonical?.diagnostics ?? {}),
        earnings_summary_model: teamSummary?.model_version ?? null,
      },
    });
    return { ok: true, skipped: false };
  }

  const rosterRowsForSolo = await loadBookingRosterRows(admin, bookingId);
  const pairedRosterSolo = isPairedRosterSoloJob({ isTeamJob: false, rosterRows: rosterRowsForSolo });

  const soloEligibleCents = usedLineItemBasis
    ? sumEligibleLineItemsSubtotalCents(lineItemRows)
    : payoutBaseCents;
  const soloCanonical = await resolveBookingCanonicalPayout(admin, {
    bookingId,
    row: r as BookingRowForCanonicalPayout,
    expectedCleanerId,
    eligibleAmountCents: soloEligibleCents > 0 ? soloEligibleCents : payoutBaseCents,
    computedAtIso: new Date().toISOString(),
  });
  const soloSummary = soloCanonical.earningsSummary;

  if (pairedRosterSolo && soloSummary) {
    const participantIds = soloSummary.per_cleaner_earnings.map((row) => row.cleaner_id);
    const leaderId = resolvePairedRosterLeaderId({
      rosterRows: rosterRowsForSolo,
      participantIds,
      payoutOwnerCleanerId: r.payout_owner_cleaner_id,
      bookingCleanerId: r.cleaner_id,
    });
    const leadRow = leadEarningsRowFromSummary(soloSummary, leaderId);
    const leadPayoutCents = Math.max(0, Math.round(leadRow?.base_earning_cents ?? 0));
    const leadBonusCents = Math.max(0, Math.round(leadRow?.bonus_cents ?? 0));

    const capRow = {
      billing_type: r.billing_type,
      is_monthly_billing_booking: r.is_monthly_billing_booking,
      payment_status: r.payment_status,
      monthly_invoice_id: r.monthly_invoice_id,
      total_paid_cents: r.total_paid_cents,
      amount_paid_cents: r.amount_paid_cents,
      total_paid_zar: r.total_paid_zar,
    };
    const finDiag = bookingFinancialDiagnostics(capRow);
    const capOk = assertHybridPayoutWithinFinancialCap({
      row: capRow,
      payoutCents: soloCanonical.internalEarningsCents,
      bonusCents: 0,
    });
    if (!capOk.ok) {
      await reportOperationalIssue("error", "persistCleanerPayoutIfUnset", "Paired roster payout exceeds financial cap", {
        bookingId,
        cleanerId: expectedCleanerId,
        cap: capOk.cap,
        hybrid: capOk.hybrid,
        ...finDiag,
      });
      return {
        ok: false,
        code: "payout_exceeds_financial_cap",
        error:
          "Cleaner payout exceeds the allowed financial cap for this billing mode (payout_exceeds_financial_cap).",
      };
    }

    let pairedUpPatch = {
        cleaner_payout_cents: leadPayoutCents,
        cleaner_bonus_cents: leadBonusCents,
        company_revenue_cents: soloCanonical.companyRevenueFromServiceCents,
        payout_percentage: soloCanonical.payoutPercentage ?? null,
        payout_type: soloCanonical.payoutType,
        display_earnings_cents: soloCanonical.displayEarningsCents,
        payout_earnings_cents: soloCanonical.payoutEarningsCents,
        internal_earnings_cents: soloCanonical.internalEarningsCents,
        earnings_model_version: soloCanonical.earningsModelVersion,
        earnings_percentage_applied: soloCanonical.earningsPercentageApplied ?? null,
        earnings_cap_cents_applied: soloCanonical.earningsCapCentsApplied ?? null,
        earnings_tenure_months_at_assignment: soloCanonical.tenureMonths ?? null,
        earnings_summary: soloSummary,
      };
    const pairedWrite = await updateBookingSoloDisplayColumns(admin, bookingId, pairedUpPatch, {
      forceDisplay,
      recomputeZeroDisplay,
    });
    if (pairedWrite.error) {
      await reportOperationalIssue("error", "persistCleanerPayoutIfUnset", pairedWrite.error, {
        bookingId,
        error_id: newPayoutMoneyPathErrorId(),
      });
      return { ok: false, error: pairedWrite.error };
    }
    if (!pairedWrite.updatedIds.length) {
      return { ok: true, skipped: true, skipReason: "paired_roster_display_update_noop" };
    }

    const rosterSync = await syncBookingRosterMemberPayouts({
      admin,
      bookingId,
      summary: soloSummary,
      leaderId,
    });
    if (!rosterSync.ok) {
      const missingTable = rosterSync.error.toLowerCase().includes("booking_roster_member_payouts");
      if (missingTable) {
        void reportOperationalIssue("warn", "persistCleanerPayoutIfUnset", rosterSync.error, {
          bookingId,
          hint: "Apply migration 20260958_booking_roster_member_payouts.sql",
        });
      } else {
        return { ok: false, error: rosterSync.error };
      }
    }

    void logSystemEvent({
      level: "info",
      source: "persistCleanerPayoutIfUnset",
      message: "canonical_paired_roster_payout_persisted",
      context: {
        bookingId,
        cleanerId: expectedCleanerId,
        leaderId,
        roster_member_rows: rosterSync.ok ? rosterSync.upserted : 0,
        internal_earnings_cents: soloCanonical.internalEarningsCents,
        per_cleaner_count: soloSummary.per_cleaner_earnings.length,
      },
    });
    return { ok: true, skipped: false };
  }

  const payout: CleanerPayoutResult = {
    payoutCents: soloCanonical.cleanerPayoutCents,
    bonusCents: soloCanonical.cleanerBonusCents,
    companyRevenueCents: soloCanonical.companyRevenueFromServiceCents,
    payoutType: soloCanonical.payoutType,
    payoutPercentage: soloCanonical.payoutPercentage,
    payoutBaseCents: soloEligibleCents > 0 ? soloEligibleCents : payoutBaseCents,
    serviceFeeCents,
  };

  const capRow = {
    billing_type: r.billing_type,
    is_monthly_billing_booking: r.is_monthly_billing_booking,
    payment_status: r.payment_status,
    monthly_invoice_id: r.monthly_invoice_id,
    total_paid_cents: r.total_paid_cents,
    amount_paid_cents: r.amount_paid_cents,
    total_paid_zar: r.total_paid_zar,
  };
  const finDiag = bookingFinancialDiagnostics(capRow);
  const capOk = assertHybridPayoutWithinFinancialCap({
    row: capRow,
    payoutCents: payout.payoutCents,
    bonusCents: payout.bonusCents,
  });
  void logSystemEvent({
    level: "info",
    source: "persistCleanerPayoutIfUnset",
    message: "payout_financial_cap_precheck",
    context: {
      bookingId,
      cleanerId: expectedCleanerId,
      ...finDiag,
      cleaner_payout_cents: payout.payoutCents,
      cleaner_bonus_cents: payout.bonusCents,
    },
  });
  if (!capOk.ok) {
    await reportOperationalIssue("error", "persistCleanerPayoutIfUnset", "Hybrid payout exceeds mode financial cap (precheck)", {
      bookingId,
      cleanerId: expectedCleanerId,
      cap: capOk.cap,
      hybrid: capOk.hybrid,
      ...finDiag,
    });
    return {
      ok: false,
      code: "payout_exceeds_financial_cap",
      error:
        "Cleaner payout exceeds the allowed financial cap for this billing mode (payout_exceeds_financial_cap).",
    };
  }

  /**
   * Solo payout columns: do not require `bookings.cleaner_id = expectedCleanerId`.
   * Cleaners may see and complete jobs via `payout_owner_cleaner_id` or roster while `cleaner_id` is null or lagging;
   * `isCleanerAllowedForPersist` above is the access gate.
   */
  const soloPatch = {
      cleaner_payout_cents: payout.payoutCents,
      cleaner_bonus_cents: payout.bonusCents,
      company_revenue_cents: payout.companyRevenueCents,
      payout_percentage: payout.payoutPercentage ?? null,
      payout_type: payout.payoutType,
      display_earnings_cents: soloCanonical.displayEarningsCents,
      payout_earnings_cents: soloCanonical.payoutEarningsCents,
      internal_earnings_cents: soloCanonical.internalEarningsCents,
      earnings_model_version: soloCanonical.earningsModelVersion,
      earnings_percentage_applied: soloCanonical.earningsPercentageApplied ?? null,
      earnings_cap_cents_applied: soloCanonical.earningsCapCentsApplied ?? null,
      earnings_tenure_months_at_assignment: soloCanonical.tenureMonths ?? null,
      earnings_summary: soloSummary,
    };
  const soloWrite = await updateBookingSoloDisplayColumns(admin, bookingId, soloPatch, {
    forceDisplay,
    recomputeZeroDisplay,
  });

  if (soloWrite.error) {
    await reportOperationalIssue("error", "persistCleanerPayoutIfUnset", soloWrite.error, {
      bookingId,
      error_id: newPayoutMoneyPathErrorId(),
    });
    return { ok: false, error: soloWrite.error };
  }

  if (!soloWrite.updatedIds.length) {
    return { ok: true, skipped: true, skipReason: "solo_display_update_noop" };
  }

  const soloVerify = await verifyDisplayEarningsRowAfterWrite(admin, bookingId, "solo_booking");
  if (!soloVerify.ok) {
    return { ok: false, error: soloVerify.error };
  }

  const lineEarn = await computeCleanerEarningsForBooking({
    admin,
    bookingId,
    cleanerId: expectedCleanerId,
    canonicalDisplayCents: soloCanonical.displayEarningsCents,
  });
  if (!lineEarn.ok) {
    void reportOperationalIssue("warn", "persistCleanerPayoutIfUnset", `computeCleanerEarningsForBooking: ${lineEarn.error}`, {
      bookingId,
      cleanerId: expectedCleanerId,
    });
  }
  void logSystemEvent({
    level: "info",
    source: "persistCleanerPayoutIfUnset",
    message: "canonical_solo_payout_persisted",
    context: {
      bookingId,
      cleanerId: expectedCleanerId,
      payout_source: "canonical",
      service_id: resolveServiceIdForPersist(r.booking_snapshot ?? null, r.service ?? null),
      tenure_months: earnings.earnings_tenure_months_at_assignment ?? null,
      payout_percentage: earnings.earnings_percentage_applied ?? null,
      fixed_service_override: soloCanonical.fixedServiceOverride,
      final_display_cents: soloCanonical.displayEarningsCents,
      cleaner_payout_cents: payout.payoutCents,
      cleaner_bonus_cents: payout.bonusCents,
      used_fallback: usedFallback,
      used_line_item_basis: usedLineItemBasis,
      line_earnings: !lineEarn.ok
        ? { ok: false, error: lineEarn.error }
        : lineEarn.skipped
          ? { ok: true, skipped: true, reason: lineEarn.reason }
          : { ok: true, skipped: false, total_cents: lineEarn.total_cents },
    },
  });
  if (String(r.status ?? "").toLowerCase() === "completed" || String(r.completed_at ?? "").trim()) {
    await repairBookingCompletionCoherenceIfNeeded({
      admin,
      bookingId,
      row: r,
      ensureLedger: true,
    });
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

/**
 * Eligibility skips (e.g. terminal booking) may legitimately leave display unset.
 * Only bypass {@link finalizePersistResult} when display is already persisted —
 * otherwise callers like cleaner complete would see `ok: true` then fail verify.
 */
async function shouldBypassFinalizeForEligibilitySkip(
  admin: SupabaseClient,
  bookingId: string,
  core: PersistCleanerPayoutIfUnsetResult,
): Promise<boolean> {
  if (!core.ok || !core.skipped || !isPayoutEligibilitySkipReason(core.skipReason)) {
    return false;
  }
  const cents = await fetchBookingDisplayEarningsCents(admin, bookingId);
  return hasPersistedDisplayEarningsBasis(cents);
}

async function finalizePersistResult(
  admin: SupabaseClient,
  bookingId: string,
  cleanerId: string,
  core: PersistCleanerPayoutIfUnsetResult,
): Promise<PersistCleanerPayoutIfUnsetResult> {
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
    skipReason: core.skipReason ?? null,
  });
  const skipSuffix = core.skipped && core.skipReason ? ` (${core.skipReason})` : "";
  return { ok: false, error: `Earnings not written${skipSuffix}` };
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
  params: { admin: SupabaseClient; bookingId: string; cleanerId: string; forceDisplayRecompute?: boolean },
): Promise<PersistCleanerPayoutIfUnsetResult> {
  try {
    const { data: idemRow } = await params.admin
      .from("bookings")
      .select("is_team_job, display_earnings_cents, cleaner_line_earnings_finalized_at, cleaner_earnings_total_cents")
      .eq("id", params.bookingId)
      .maybeSingle();
    if (idemRow && (idemRow as { is_team_job?: boolean | null }).is_team_job !== true) {
      const forceDisplay = params.forceDisplayRecompute === true;
      const finRaw = (idemRow as { cleaner_line_earnings_finalized_at?: string | null }).cleaner_line_earnings_finalized_at;
      const lineFinalized = finRaw != null && String(finRaw).trim() !== "";
      const totalRaw = (idemRow as { cleaner_earnings_total_cents?: number | null }).cleaner_earnings_total_cents;
      const totalSet = totalRaw != null && Number.isFinite(Number(totalRaw));
      const displayOk = hasPersistedDisplayEarningsBasis((idemRow as { display_earnings_cents?: unknown }).display_earnings_cents);
      if (!forceDisplay && lineFinalized && totalSet && displayOk) {
        const { count, error: ctErr } = await params.admin
          .from("cleaner_earnings")
          .select("id", { count: "exact", head: true })
          .eq("booking_id", params.bookingId);
        if (!ctErr && (count ?? 0) > 0) {
          void logSystemEvent({
            level: "info",
            source: "persistCleanerPayoutIfUnset",
            message: "skip_idempotent_solo_ledger_and_lines_finalized",
            context: { bookingId: params.bookingId, cleanerId: params.cleanerId },
          });
          return { ok: true, skipped: true, skipReason: "solo_line_finalized_with_ledger" };
        }
      }
    }

    const first = await persistCleanerPayoutIfUnsetCore(params);
    if (await shouldBypassFinalizeForEligibilitySkip(params.admin, params.bookingId, first)) {
      return first;
    }
    let out = await finalizePersistResult(params.admin, params.bookingId, params.cleanerId, first);
    if (await shouldBypassFinalizeForEligibilitySkip(params.admin, params.bookingId, out)) {
      return out;
    }
    if (!out.ok) {
      await new Promise((r) => setTimeout(r, 200));
      const second = await persistCleanerPayoutIfUnsetCore(params);
      if (await shouldBypassFinalizeForEligibilitySkip(params.admin, params.bookingId, second)) {
        return second;
      }
      out = await finalizePersistResult(params.admin, params.bookingId, params.cleanerId, second);
      if (await shouldBypassFinalizeForEligibilitySkip(params.admin, params.bookingId, out)) {
        return out;
      }
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
