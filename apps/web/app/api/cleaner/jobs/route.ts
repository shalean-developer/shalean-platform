import { NextResponse } from "next/server";
import {
  assignmentSourceForVisibilityLog,
  bookingMatchesRecurringCleanerPendingPayment,
  cleanerJobsListRowPostFilter,
  cleanerPendingPaymentBannerForRow,
  fetchCleanerVisibleBookingsMerged,
  recurringPendingPaymentVisibilityReason,
  sortBookingsByDateThenTime,
} from "@/lib/cleaner/cleanerBookingAccess";
import { resolveCleanerIdFromRequest } from "@/lib/cleaner/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveCleanerEarningsCents } from "@/lib/cleaner/resolveCleanerEarnings";
import { countActiveTeamMembersOnDate } from "@/lib/cleaner/teamMemberAvailability";
import {
  isStuckNullEarningsBooking,
  logEligibleOrPaidWithoutFrozen,
  maybeLogStuckNullEarnings,
} from "@/lib/cleaner/cleanerPayoutInvariantLogging";
import { scheduleStuckEarningsRecomputeDebounced } from "@/lib/cleaner/scheduleStuckEarningsRecompute";
import type { CleanerBookingLineItemWire, CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";
import { cleanerBookingScopeLines } from "@/lib/cleaner/cleanerBookingScopeSummary";
import { fetchBookingLineItemsByBookingIds } from "@/lib/cleaner/fetchBookingLineItemsByBookingIds";
import { augmentCleanerBookingWire } from "@/lib/cleaner/cleanerJobWireAugment";
import {
  fetchTeamRosterByBookingIds,
  teamRosterPeersSummary,
  type TeamRosterMemberWire,
} from "@/lib/cleaner/fetchTeamRosterByBookingIds";
import { assignedOfferPastAcceptanceDeadline } from "@/lib/cleaner/cleanerAssignedOfferExpiry";
import {
  applyPreviewEarningsToCleanerJobRows,
  DEFAULT_CLEANER_JOB_EARNINGS_PREVIEW_CAP,
} from "@/lib/cleaner/applyPreviewEarningsToCleanerJobRows";
import { logSystemEvent } from "@/lib/logging/systemLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }
  const session = await resolveCleanerIdFromRequest(request, admin);
  if (!session.cleanerId) return NextResponse.json({ error: session.error ?? "Unauthorized." }, { status: session.status ?? 401 });
  const viewerCleanerId = session.cleanerId;

  const { data: c } = await admin.from("cleaners").select("id").eq("id", viewerCleanerId).maybeSingle();
  if (!c) {
    return NextResponse.json({ error: "Not a cleaner account." }, { status: 403 });
  }

  const url = new URL(request.url);
  /**
   * NOTE: `lite=1` is legacy for older clients that inlined jobs on a heavy home screen.
   * Prefer `GET /api/cleaner/dashboard` for the mobile dashboard slice (capped jobs + today earnings).
   * When set: full booking visibility without line items, roster names, issue flags, or recompute side-effects.
   *
   * `view=card` — jobs list / timeline: skips line-item join, issue flags, team roster fetch, and stuck-earnings
   * side-effects; attaches `scope_lines` from persisted booking + snapshot (lighter mobile payload).
   */
  const lite = url.searchParams.get("lite") === "1" || url.searchParams.get("lite") === "true";
  const cardView = url.searchParams.get("view") === "card";
  const slimWire = lite || cardView;
  /** Legacy `lite=1` only — card view still runs stuck-earnings recompute so rows can populate `display_earnings_cents`. */
  const skipStuckEarningsSideEffects = lite;
  const directAssignments = !slimWire && url.searchParams.get("assignments") === "direct";

  if (process.env.TRACE_BOOKING_ASSIGN === "1") {
    console.log(
      "[TRACE_BOOKING_ASSIGN]",
      JSON.stringify({
        at: new Date().toISOString(),
        step: "cleaner/jobs GET",
        viewerCleanerId,
        directAssignments,
        lite,
        cardView,
      }),
    );
  }

  const bookingSelect =
    "id, service, service_slug, rooms, bathrooms, date, time, location, status, dispatch_status, pricing_version_id, customer_name, customer_phone, extras, assigned_at, accepted_at, en_route_at, started_at, completed_at, created_at, booking_snapshot, is_team_job, team_id, team_member_count_snapshot, cleaner_id, payout_owner_cleaner_id, cleaner_response_status, display_earnings_cents, cleaner_earnings_total_cents, cleaner_payout_cents, payout_status, payout_paid_at, payout_frozen_cents, total_paid_zar, total_price, amount_paid_cents, payment_completed_at, is_recurring_generated, billing_type, monthly_invoice_id, admin_recurring_unpaid_completion_override_at, admin_recurring_unpaid_completion_override_by";

  const { data: jobsRaw, error } = directAssignments
    ? await admin
        .from("bookings")
        .select(bookingSelect)
        .eq("cleaner_id", viewerCleanerId)
        .not("status", "eq", "failed")
        .not("status", "eq", "payment_expired")
        .order("date", { ascending: true })
        .order("time", { ascending: true })
        .limit(100)
    : await (async () => {
        const { data: merged, error: mergeErr } = await fetchCleanerVisibleBookingsMerged(admin, viewerCleanerId, {
          select: bookingSelect,
          perBranchLimit: 300,
          applyEachBranch: (q) =>
            q.not("status", "eq", "failed").not("status", "eq", "payment_expired").order("date", { ascending: true }).order("time", { ascending: true }),
        });
        return {
          data: sortBookingsByDateThenTime((merged ?? []) as Record<string, unknown>[]).slice(0, 100),
          error: mergeErr,
        };
      })();

  const jobs = (jobsRaw ?? []).filter(cleanerJobsListRowPostFilter);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const mappedJobs = (jobs ?? []).map((raw) => {
    const row = raw as Record<string, unknown>;
    const displayEarningsCents = resolveCleanerEarningsCents({
      cleaner_earnings_total_cents: row.cleaner_earnings_total_cents,
      payout_frozen_cents: row.payout_frozen_cents,
      display_earnings_cents: row.display_earnings_cents,
    });
    const snapRaw = row.team_member_count_snapshot;
    const teamSnap =
      typeof snapRaw === "number" && Number.isFinite(snapRaw) && snapRaw > 0 ? Math.floor(snapRaw) : null;
    const totalPaidZarRaw = row.total_paid_zar;
    const totalPriceRaw = row.total_price;
    const amountPaidCentsRaw = row.amount_paid_cents;
    const totalPaidZarCoerced =
      typeof totalPaidZarRaw === "number" && Number.isFinite(totalPaidZarRaw)
        ? totalPaidZarRaw
        : typeof totalPaidZarRaw === "string" && totalPaidZarRaw.trim()
          ? ((n) => (Number.isFinite(n) && n > 0 ? n : null))(Number(totalPaidZarRaw.trim()))
          : null;
    const {
      cleaner_payout_cents: _legacyPayout,
      display_earnings_cents: _displayRaw,
      team_member_count_snapshot: _snapCol,
      total_paid_zar: _omitPaidZar,
      total_price: _omitTotalPrice,
      price_breakdown: _omitPriceBreakdown,
      amount_paid_cents: _omitAmountPaid,
      ...safe
    } = row;
    const cardPayHint =
      cardView && displayEarningsCents == null
        ? {
            total_paid_zar: totalPaidZarCoerced,
            total_price: totalPriceRaw as number | string | null | undefined,
            amount_paid_cents:
              typeof amountPaidCentsRaw === "number" && Number.isFinite(amountPaidCentsRaw)
                ? Math.round(amountPaidCentsRaw)
                : null,
          }
        : null;
    return {
      ...safe,
      ...(cardPayHint ? cardPayHint : {}),
      displayEarningsCents,
      displayEarningsIsEstimate: false,
      earnings_cents: displayEarningsCents,
      earnings_estimated: false,
      earnings_is_estimate: false,
      __teamSnap: teamSnap as number | null,
    };
  });

  const teamIdsForRoster = [
    ...new Set(
      mappedJobs
        .filter((j) => {
          const rec = j as Record<string, unknown>;
          if (rec.is_team_job !== true || !rec.team_id) return false;
          const dateYmd = String(rec.date ?? "").trim().slice(0, 10);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) return false;
          const snap = rec.__teamSnap;
          if (typeof snap === "number" && snap > 0) return false;
          return true;
        })
        .map((j) => String((j as { team_id?: string | null }).team_id ?? "").trim())
        .filter(Boolean),
    ),
  ];

  type MemberRow = {
    team_id?: string | null;
    cleaner_id?: string | null;
    active_from?: string | null;
    active_to?: string | null;
  };

  const membersByTeam: Record<string, MemberRow[]> = {};
  if (teamIdsForRoster.length > 0) {
    const { data: rosterRows, error: rosterErr } = await admin
      .from("team_members")
      .select("team_id, cleaner_id, active_from, active_to")
      .in("team_id", teamIdsForRoster)
      .not("cleaner_id", "is", null);
    if (!rosterErr && rosterRows?.length) {
      for (const raw of rosterRows as MemberRow[]) {
        const tid = String(raw.team_id ?? "").trim();
        if (!tid) continue;
        if (!membersByTeam[tid]) membersByTeam[tid] = [];
        membersByTeam[tid].push(raw);
      }
    }
  }

  const mappedWithTeamCounts = mappedJobs.map((j) => {
    const rec = j as Record<string, unknown>;
    const { __teamSnap, ...pub } = rec;
    const isTeam = pub.is_team_job === true;
    const teamId = String(pub.team_id ?? "").trim();
    const dateYmd = String(pub.date ?? "").trim().slice(0, 10);
    if (!isTeam || !teamId || !/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) {
      return { ...pub, teamMemberCount: null as number | null };
    }
    const snap = typeof __teamSnap === "number" && __teamSnap > 0 ? __teamSnap : null;
    if (snap != null) {
      return { ...pub, teamMemberCount: snap };
    }
    const roster = membersByTeam[teamId] ?? [];
    const teamMemberCount = countActiveTeamMembersOnDate(roster, dateYmd);
    return { ...pub, teamMemberCount: teamMemberCount > 0 ? teamMemberCount : null };
  });

  const bookingIdsForLines = mappedWithTeamCounts
    .map((j) => String((j as { id?: string }).id ?? "").trim())
    .filter(Boolean);

  const lineItemsByBooking = slimWire
    ? new Map<string, CleanerBookingLineItemWire[]>()
    : await fetchBookingLineItemsByBookingIds(admin, bookingIdsForLines);

  const mappedWithLineItems = mappedWithTeamCounts.map((j) => {
    if (slimWire) {
      return { ...j, lineItems: null as null };
    }
    const id = String((j as { id?: string }).id ?? "").trim();
    const lineItems = id ? lineItemsByBooking.get(id) ?? null : null;
    return { ...j, lineItems: lineItems && lineItems.length > 0 ? lineItems : null };
  });

  const bookingIds = mappedWithLineItems
    .map((j) => String((j as { id?: string }).id ?? "").trim())
    .filter(Boolean);

  const reportedIds = new Set<string>();
  if (!slimWire && bookingIds.length > 0) {
    const { data: repRows, error: repErr } = await admin
      .from("cleaner_job_issue_reports")
      .select("booking_id")
      .in("booking_id", bookingIds)
      .eq("cleaner_id", viewerCleanerId);
    if (!repErr && repRows?.length) {
      for (const r of repRows as { booking_id?: string }[]) {
        const bid = String(r.booking_id ?? "").trim();
        if (bid) reportedIds.add(bid);
      }
    }
  }

  const jobsWithIssue = mappedWithLineItems
    .map((j) => {
      const id = String((j as { id?: string }).id ?? "").trim();
      return { ...j, cleaner_has_issue_report: slimWire ? false : id ? reportedIds.has(id) : false };
    })
    .filter((j) => !assignedOfferPastAcceptanceDeadline(j as CleanerBookingRow));

  const jobsOut = jobsWithIssue.map((j) => {
    const rec = j as Record<string, unknown>;
    const banner = cleanerPendingPaymentBannerForRow(rec);
    const visMode =
      String(rec.status ?? "").trim().toLowerCase() === "pending_payment" && bookingMatchesRecurringCleanerPendingPayment(rec)
        ? ("recurring_pending_payment" as const)
        : null;
    if (visMode && process.env.SHALEAN_CLEANER_VISIBILITY_DIAGNOSTICS === "1") {
      void logSystemEvent({
        level: "info",
        source: "cleaner_jobs_visibility",
        message: "recurring_pending_payment_visible",
        context: {
          visibility_mode: visMode,
          booking_id: String(rec.id ?? "").trim() || null,
          cleaner_id: viewerCleanerId,
          recurring_reason: recurringPendingPaymentVisibilityReason(rec),
          assignment_source: assignmentSourceForVisibilityLog(viewerCleanerId, rec),
        },
      });
    }
    return {
      ...j,
      ...(banner ? { cleaner_pending_payment_banner: banner } : {}),
      ...(visMode ? { cleaner_visibility_mode: visMode } : {}),
      ...augmentCleanerBookingWire(rec, viewerCleanerId),
    };
  });

  const teamBookingIds = jobsOut
    .filter((j) => (j as { is_team_job?: boolean }).is_team_job === true)
    .map((j) => String((j as { id?: string }).id ?? "").trim())
    .filter(Boolean);
  const rosterByBooking = slimWire
    ? new Map<string, TeamRosterMemberWire[]>()
    : await fetchTeamRosterByBookingIds(admin, teamBookingIds);
  const jobsWithRoster = jobsOut.map((j) => {
    const rec = j as Record<string, unknown>;
    const id = String(rec.id ?? "").trim();
    if (rec.is_team_job !== true || !id) return j;
    if (slimWire) {
      return { ...j, team_roster: [], team_roster_summary: null as string | null };
    }
    const roster = rosterByBooking.get(id) ?? [];
    return {
      ...j,
      team_roster: roster,
      team_roster_summary: teamRosterPeersSummary(roster, viewerCleanerId),
    };
  });

  if (!skipStuckEarningsSideEffects) {
    for (const j of jobsWithRoster) {
      const rec = j as Record<string, unknown>;
      const id = String(rec.id ?? "").trim();
      if (!id) continue;
      logEligibleOrPaidWithoutFrozen(id, rec);
      maybeLogStuckNullEarnings(id, rec);
      if (isStuckNullEarningsBooking(rec)) {
        scheduleStuckEarningsRecomputeDebounced({
          admin,
          bookingId: id,
          cleanerId: viewerCleanerId,
          recomputeSource: "jobs_list",
        });
      }
    }
  }

  const jobsPayload = cardView
    ? jobsWithRoster.map((j) => ({
        ...j,
        scope_lines: cleanerBookingScopeLines(j as CleanerBookingRow),
      }))
    : jobsWithRoster;

  if (cardView) {
    const out = await applyPreviewEarningsToCleanerJobRows(admin, {
      cleanerId: viewerCleanerId,
      rows: jobsPayload as Record<string, unknown>[],
      maxPreviews: DEFAULT_CLEANER_JOB_EARNINGS_PREVIEW_CAP,
    });
    return NextResponse.json({ jobs: out });
  }

  if (!lite) {
    const out = await applyPreviewEarningsToCleanerJobRows(admin, {
      cleanerId: viewerCleanerId,
      rows: jobsPayload as Record<string, unknown>[],
      maxPreviews: DEFAULT_CLEANER_JOB_EARNINGS_PREVIEW_CAP,
    });
    return NextResponse.json({ jobs: out });
  }

  return NextResponse.json({ jobs: jobsPayload });
}
