import { NextResponse } from "next/server";
import {
  assignmentSourceForVisibilityLog,
  bookingMatchesRecurringCleanerPendingPayment,
  cleanerHasBookingAccess,
  cleanerJobsListRowPostFilter,
  cleanerPendingPaymentBannerForRow,
  recurringPendingPaymentVisibilityReason,
} from "@/lib/cleaner/cleanerBookingAccess";
import {
  cleanerAcceptBooking,
  cleanerRejectBooking,
  markBookingCompleted,
  markBookingStarted,
  markCleanerOnTheWay,
} from "@/lib/booking/bookingOperations";
import { resolveCleanerIdFromRequest } from "@/lib/cleaner/session";
import {
  runCleanerBookingLifecycleAction,
  type CleanerLifecycleAction,
  type CleanerLifecycleResult,
} from "@/lib/cleaner/runCleanerBookingLifecycleAction";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logSystemEvent } from "@/lib/logging/systemLog";
import {
  parseBookingEarningsSummary,
  resolveCleanerFacingEarnings,
} from "@/lib/payout/bookingEarningsSummary";
import { resolveCleanerEarningsCents } from "@/lib/cleaner/resolveCleanerEarnings";
import { countActiveTeamMembersOnDate } from "@/lib/cleaner/teamMemberAvailability";
import {
  isStuckNullEarningsBooking,
  logEligibleOrPaidWithoutFrozen,
  maybeLogStuckNullEarnings,
} from "@/lib/cleaner/cleanerPayoutInvariantLogging";
import { scheduleStuckEarningsRecomputeDebounced } from "@/lib/cleaner/scheduleStuckEarningsRecompute";
import { fetchBookingLineItemsByBookingIds } from "@/lib/cleaner/fetchBookingLineItemsByBookingIds";
import { augmentCleanerBookingWire } from "@/lib/cleaner/cleanerJobWireAugment";
import { augmentCleanerJobsWithViewerRosterContext } from "@/lib/cleaner/pairedRosterMemberLifecycle";
import {
  cleanerJobAccessDetailLines,
  cleanerJobServiceDetailLines,
  formatCleanerJobLocationDisplay,
  resolveCleanerJobCustomerContact,
  syncSoloCleanerDisplayEarningsPreviewCents,
} from "@/lib/cleaner/cleanerJobDetailDisplayEnrich";
import { cleanerBookingScopeLines } from "@/lib/cleaner/cleanerBookingScopeSummary";
import {
  fetchTeamRosterByBookingIds,
  teamRosterPeersSummary,
  type TeamRosterMemberWire,
} from "@/lib/cleaner/fetchTeamRosterByBookingIds";
import { metrics } from "@/lib/metrics/counters";
import { fetchServiceQaForCleanerJob } from "@/lib/booking/bookingServiceQaServer";
import { previewDisplayEarningsCentsForCleanerJob } from "@/lib/payout/persistCleanerPayout";
import type { BookingCustomerOwnershipColumn } from "@/lib/booking/bookingCustomerIdentity";
import { resolveBookingOwnershipColumn } from "@/lib/customer/customerBookingsForUser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cleanerAcceptOpToLifecycleResult(
  op: Awaited<ReturnType<typeof cleanerAcceptBooking>>,
): CleanerLifecycleResult {
  if (op.ok) {
    return { status: 200, json: (op.data ?? { ok: true }) as Record<string, unknown> };
  }
  const st = typeof op.httpStatus === "number" ? op.httpStatus : 400;
  const json =
    op.cause && typeof op.cause === "object" && !Array.isArray(op.cause)
      ? (op.cause as Record<string, unknown>)
      : ({ error: op.message, code: op.code } as Record<string, unknown>);
  return { status: st, json };
}

function markCleanerOnTheWayOpToLifecycleResult(
  op: Awaited<ReturnType<typeof markCleanerOnTheWay>>,
): CleanerLifecycleResult {
  if (op.ok) {
    return { status: 200, json: (op.data ?? { ok: true }) as Record<string, unknown> };
  }
  const st = typeof op.httpStatus === "number" ? op.httpStatus : 400;
  const json =
    op.cause && typeof op.cause === "object" && !Array.isArray(op.cause)
      ? (op.cause as Record<string, unknown>)
      : ({ error: op.message, code: op.code } as Record<string, unknown>);
  return { status: st, json };
}

function markBookingStartedOpToLifecycleResult(
  op: Awaited<ReturnType<typeof markBookingStarted>>,
): CleanerLifecycleResult {
  if (op.ok) {
    return { status: 200, json: (op.data ?? { ok: true }) as Record<string, unknown> };
  }
  const st = typeof op.httpStatus === "number" ? op.httpStatus : 400;
  const json =
    op.cause && typeof op.cause === "object" && !Array.isArray(op.cause)
      ? (op.cause as Record<string, unknown>)
      : ({ error: op.message, code: op.code } as Record<string, unknown>);
  return { status: st, json };
}

function cleanerRejectBookingOpToLifecycleResult(
  op: Awaited<ReturnType<typeof cleanerRejectBooking>>,
): CleanerLifecycleResult {
  if (op.ok) {
    return { status: 200, json: (op.data ?? { ok: true }) as Record<string, unknown> };
  }
  const st = typeof op.httpStatus === "number" ? op.httpStatus : 400;
  const json =
    op.cause && typeof op.cause === "object" && !Array.isArray(op.cause)
      ? (op.cause as Record<string, unknown>)
      : ({ error: op.message, code: op.code } as Record<string, unknown>);
  return { status: st, json };
}

function markBookingCompletedOpToLifecycleResult(
  op: Awaited<ReturnType<typeof markBookingCompleted>>,
): CleanerLifecycleResult {
  if (op.ok) {
    return { status: 200, json: (op.data ?? { ok: true }) as Record<string, unknown> };
  }
  const st = typeof op.httpStatus === "number" ? op.httpStatus : 400;
  const json =
    op.cause && typeof op.cause === "object" && !Array.isArray(op.cause)
      ? (op.cause as Record<string, unknown>)
      : ({ error: op.message, code: op.code } as Record<string, unknown>);
  return { status: st, json };
}

function buildBookingDetailSelect(ownershipColumn: BookingCustomerOwnershipColumn): string {
  return [
    "id, service, service_slug, rooms, bathrooms, date, time, location, suburb, status, dispatch_status, pricing_version_id, customer_name, customer_phone, customer_email",
    ownershipColumn,
    "extras, selected_extras, service_details, pricing_summary, duration_minutes, access_instructions, gate_code, parking_instructions, assigned_at, accepted_at, en_route_at, started_at, completed_at, created_at, booking_snapshot, is_team_job, team_id, team_member_count_snapshot, cleaner_id, payout_owner_cleaner_id, cleaner_response_status, display_earnings_cents, cleaner_earnings_total_cents, cleaner_payout_cents, payout_status, payout_paid_at, payout_frozen_cents, earnings_summary, total_paid_zar, total_price, amount_paid_cents, base_amount_cents, service_fee_cents, payment_completed_at, is_recurring_generated, billing_type, monthly_invoice_id, admin_recurring_unpaid_completion_override_at, admin_recurring_unpaid_completion_override_by",
  ].join(", ");
}

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: bookingId } = await ctx.params;
  if (!bookingId) {
    return NextResponse.json({ error: "Missing booking id." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }
  const session = await resolveCleanerIdFromRequest(request, admin);
  if (!session.cleanerId) return NextResponse.json({ error: session.error ?? "Unauthorized." }, { status: session.status ?? 401 });

  const ownershipColumn = await resolveBookingOwnershipColumn(admin);
  const { data: row, error } = await admin
    .from("bookings")
    .select(buildBookingDetailSelect(ownershipColumn))
    .eq("id", bookingId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Booking not found." }, { status: 404 });

  const record = row as unknown as Record<string, unknown>;
  const canAccess = await cleanerHasBookingAccess(admin, session.cleanerId, {
    id: bookingId,
    cleaner_id: (record.cleaner_id as string | null | undefined) ?? null,
    payout_owner_cleaner_id: (record.payout_owner_cleaner_id as string | null | undefined) ?? null,
    team_id: (record.team_id as string | null | undefined) ?? null,
    is_team_job: record.is_team_job === true,
  });
  if (!canAccess) return NextResponse.json({ error: "Booking not found." }, { status: 404 });

  if (!cleanerJobsListRowPostFilter(record)) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  const banner = cleanerPendingPaymentBannerForRow(record);
  const visMode =
    String(record.status ?? "").trim().toLowerCase() === "pending_payment" && bookingMatchesRecurringCleanerPendingPayment(record)
      ? ("recurring_pending_payment" as const)
      : null;
  if (visMode && process.env.SHALEAN_CLEANER_VISIBILITY_DIAGNOSTICS === "1") {
    void logSystemEvent({
      level: "info",
      source: "cleaner_job_detail_visibility",
      message: "recurring_pending_payment_visible",
      context: {
        visibility_mode: visMode,
        booking_id: bookingId,
        cleaner_id: session.cleanerId,
        recurring_reason: recurringPendingPaymentVisibilityReason(record),
        assignment_source: assignmentSourceForVisibilityLog(session.cleanerId, record),
      },
    });
  }

  const { data: issueHit } = await admin
    .from("cleaner_job_issue_reports")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("cleaner_id", session.cleanerId)
    .limit(1)
    .maybeSingle();
  const cleaner_has_issue_report = Boolean(issueHit && typeof (issueHit as { id?: string }).id === "string");

  /**
   * Acceptance rule: cleaner card must show a positive amount immediately.
   * `0` from persisted (stale snapshot or pre-payment basis) is treated as **missing**
   * — fall through to the runtime preview. Only positive preview is rendered; preview `0`
   * surfaces as `displayEarningsCents = null` so the UI shows "Job earning unavailable"
   * (truly invalid pricing/payment data) instead of `R 0`.
   */
  const persistedDisplayEarningsCents = resolveCleanerEarningsCents({
    cleaner_earnings_total_cents: record.cleaner_earnings_total_cents,
    payout_frozen_cents: record.payout_frozen_cents,
    display_earnings_cents: record.display_earnings_cents,
  });
  const persistedIsPositive =
    typeof persistedDisplayEarningsCents === "number" &&
    Number.isFinite(persistedDisplayEarningsCents) &&
    persistedDisplayEarningsCents > 0;
  let displayEarningsCents: number | null = persistedIsPositive ? persistedDisplayEarningsCents : null;
  let displayEarningsIsEstimate = false;
  if (!persistedIsPositive) {
    const previewCents = await previewDisplayEarningsCentsForCleanerJob(admin, {
      bookingId,
      cleanerId: session.cleanerId,
    });
    if (typeof previewCents === "number" && Number.isFinite(previewCents) && previewCents > 0) {
      displayEarningsCents = previewCents;
      displayEarningsIsEstimate = true;
    } else if (record.is_team_job !== true) {
      const { data: cleanerRow } = await admin
        .from("cleaners")
        .select("joined_at, created_at")
        .eq("id", session.cleanerId)
        .maybeSingle();
      const joinedAt = String(
        (cleanerRow as { joined_at?: string | null; created_at?: string | null } | null)?.joined_at ??
          (cleanerRow as { created_at?: string | null } | null)?.created_at ??
          "",
      ).trim();
      const syncCents = syncSoloCleanerDisplayEarningsPreviewCents({ record, cleanerJoinedAtIso: joinedAt });
      if (typeof syncCents === "number" && syncCents > 0) {
        displayEarningsCents = syncCents;
        displayEarningsIsEstimate = true;
      }
    }
  }
  const snapRaw = record.team_member_count_snapshot;
  const snapCount =
    typeof snapRaw === "number" && Number.isFinite(snapRaw) && snapRaw > 0 ? Math.floor(snapRaw) : null;
  const totalPaidZarRaw = record.total_paid_zar;
  const totalPriceRaw = record.total_price;
  const amountPaidCentsRaw = record.amount_paid_cents;
  const totalPaidZarCoerced =
    typeof totalPaidZarRaw === "number" && Number.isFinite(totalPaidZarRaw)
      ? totalPaidZarRaw
      : typeof totalPaidZarRaw === "string" && totalPaidZarRaw.trim()
        ? ((n) => (Number.isFinite(n) && n > 0 ? n : null))(Number(totalPaidZarRaw.trim()))
        : null;
  const {
    cleaner_payout_cents: _legacyPayout,
    display_earnings_cents: _displayRaw,
    team_member_count_snapshot: _snapOmit,
    total_paid_zar: _omitPaidZar,
    total_price: _omitTotalPrice,
    price_breakdown: _omitPriceBreakdown,
    amount_paid_cents: _omitAmountPaid,
    base_amount_cents: _omitBaseAmount,
    service_fee_cents: _omitServiceFee,
    customer_id: _omitCustomerId,
    user_id: _omitUserId,
    customer_email: _omitCustomerEmail,
    selected_extras: _omitSelectedExtras,
    service_details: _omitServiceDetails,
    pricing_summary: _omitPricingSummary,
    duration_minutes: _omitDurationMinutes,
    access_instructions: _omitAccessInstructions,
    gate_code: _omitGateCode,
    parking_instructions: _omitParkingInstructions,
    suburb: _omitSuburb,
    ...safe
  } = record;
  const jobPayHintWire =
    displayEarningsCents == null
      ? {
          total_paid_zar: totalPaidZarCoerced,
          total_price: totalPriceRaw as number | string | null | undefined,
          amount_paid_cents:
            typeof amountPaidCentsRaw === "number" && Number.isFinite(amountPaidCentsRaw)
              ? Math.round(amountPaidCentsRaw)
              : null,
        }
      : {};

  const snap = record.booking_snapshot;
  const { customer_name, customer_phone } = await resolveCleanerJobCustomerContact(admin, {
    customer_name: typeof safe.customer_name === "string" ? safe.customer_name : null,
    customer_phone: typeof safe.customer_phone === "string" ? safe.customer_phone : null,
    customer_email: typeof record.customer_email === "string" ? record.customer_email : null,
    customer_id: typeof record.customer_id === "string" ? record.customer_id : null,
    user_id: typeof record.user_id === "string" ? record.user_id : null,
    booking_snapshot: snap,
  });
  if (customer_phone && !record.customer_phone) {
    const mergedSnap =
      snap && typeof snap === "object" && !Array.isArray(snap)
        ? {
            ...(snap as Record<string, unknown>),
            contactPhone: customer_phone,
            customer: {
              ...((snap as { customer?: Record<string, unknown> }).customer ?? {}),
              phone: customer_phone,
            },
          }
        : { contactPhone: customer_phone };
    void admin.from("bookings").update({ customer_phone, booking_snapshot: mergedSnap }).eq("id", bookingId);
  }
  const location_display = formatCleanerJobLocationDisplay({
    location: typeof safe.location === "string" ? safe.location : null,
    suburb: typeof record.suburb === "string" ? record.suburb : null,
    booking_snapshot: snap,
  });
  const service_detail_lines = cleanerJobServiceDetailLines({
    service_details: record.service_details,
    booking_snapshot: snap,
  });
  const access_detail_lines = cleanerJobAccessDetailLines({
    access_instructions: typeof record.access_instructions === "string" ? record.access_instructions : null,
    gate_code: typeof record.gate_code === "string" ? record.gate_code : null,
    parking_instructions: typeof record.parking_instructions === "string" ? record.parking_instructions : null,
  });

  let teamMemberCount: number | null = null;
  if (record.is_team_job === true) {
    if (snapCount != null) {
      teamMemberCount = snapCount;
    } else {
      const teamId = String(record.team_id ?? "").trim();
      const dateRaw = typeof record.date === "string" ? record.date : "";
      const dateYmd = dateRaw.trim().slice(0, 10);
      if (teamId && /^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) {
        const { data: rosterRows, error: rosterErr } = await admin
          .from("team_members")
          .select("team_id, cleaner_id, active_from, active_to")
          .eq("team_id", teamId)
          .not("cleaner_id", "is", null);
        if (!rosterErr) {
          const n = countActiveTeamMembersOnDate((rosterRows ?? []) as { cleaner_id?: string | null; active_from?: string | null; active_to?: string | null }[], dateYmd);
          teamMemberCount = n > 0 ? n : null;
        }
      }
    }
  }

  logEligibleOrPaidWithoutFrozen(bookingId, record);
  maybeLogStuckNullEarnings(bookingId, record);
  if (isStuckNullEarningsBooking(record)) {
    scheduleStuckEarningsRecomputeDebounced({
      admin,
      bookingId,
      cleanerId: session.cleanerId,
      recomputeSource: "job_detail",
    });
  }

  const lineMap = await fetchBookingLineItemsByBookingIds(admin, [bookingId]);
  const lineItems = lineMap.get(bookingId) ?? null;
  const scope_lines = cleanerBookingScopeLines({
    rooms: record.rooms,
    bathrooms: record.bathrooms,
    extras: record.extras,
    selected_extras: record.selected_extras,
    pricing_summary: record.pricing_summary,
    service_details: record.service_details,
    booking_snapshot: record.booking_snapshot,
    lineItems,
  });

  let team_roster: TeamRosterMemberWire[] = [];
  let team_roster_summary: string | null = null;
  if (record.is_team_job === true) {
    const rosterMap = await fetchTeamRosterByBookingIds(admin, [bookingId]);
    team_roster = rosterMap.get(bookingId) ?? [];
    team_roster_summary = teamRosterPeersSummary(team_roster, session.cleanerId);
  }

  const service_qa = await fetchServiceQaForCleanerJob(admin, {
    bookingId,
    cleanerId: session.cleanerId,
    serviceSlug: typeof record.service_slug === "string" ? record.service_slug : null,
    serviceLabel: typeof record.service === "string" ? record.service : null,
  });

  const earningsSummary = parseBookingEarningsSummary(record.earnings_summary);
  const cleanerFacing = resolveCleanerFacingEarnings(earningsSummary, session.cleanerId);
  const jobEarningCents = cleanerFacing?.job_earning_cents ?? displayEarningsCents;
  const bonusCents = cleanerFacing?.bonus_cents ?? 0;

  const jobPayload = {
    ...safe,
    ...(banner ? { cleaner_pending_payment_banner: banner } : {}),
    ...(visMode ? { cleaner_visibility_mode: visMode } : {}),
    ...jobPayHintWire,
    server_now_ms: Date.now(),
    customer_name,
    customer_phone,
    location_display,
    service_detail_lines,
    access_detail_lines,
    scope_lines,
    lineItems: lineItems && lineItems.length > 0 ? lineItems : null,
    displayEarningsCents: jobEarningCents,
    displayEarningsIsEstimate,
    earnings_cents: jobEarningCents,
    job_earning_cents: jobEarningCents,
    bonus_cents: bonusCents,
    earnings_estimated: displayEarningsIsEstimate,
    earnings_is_estimate: displayEarningsIsEstimate,
    teamMemberCount,
    team_roster,
    team_roster_summary,
    cleaner_has_issue_report,
    ...(service_qa ? { service_qa } : {}),
    ...augmentCleanerBookingWire(record, session.cleanerId),
  };
  const [jobWithRosterContext] = await augmentCleanerJobsWithViewerRosterContext(
    admin,
    [jobPayload as Record<string, unknown>],
    session.cleanerId,
  );

  return NextResponse.json({
    job: jobWithRosterContext,
  });
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: bookingId } = await ctx.params;
  if (!bookingId) {
    return NextResponse.json({ error: "Missing booking id." }, { status: 400 });
  }

  let body: { action?: string; idempotency_key?: string };
  try {
    body = (await request.json()) as { action?: string; idempotency_key?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const action = (typeof body.action === "string" ? body.action.trim() : "") as CleanerLifecycleAction;
  const allowedActions: CleanerLifecycleAction[] = ["accept", "reject", "en_route", "start", "complete"];
  if (!allowedActions.includes(action)) {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }

  /** Client-generated UUID per gesture; add a lifecycle phase token later if replays need stricter scoping. */
  const idempotency_key = typeof body.idempotency_key === "string" ? body.idempotency_key.trim() : "";
  if (idempotency_key.length < 10) {
    void logSystemEvent({
      level: "warn",
      source: "cleaner_job_lifecycle",
      message: "job_action_failed",
      context: { reason: "missing_idempotency_key", booking_id: bookingId },
    });
    return NextResponse.json({ error: "Missing or invalid idempotency_key." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }
  const session = await resolveCleanerIdFromRequest(request, admin);
  if (!session.cleanerId) return NextResponse.json({ error: session.error ?? "Unauthorized." }, { status: session.status ?? 401 });

  void logSystemEvent({
    level: "info",
    source: "cleaner_job_lifecycle",
    message: "job_action_attempted",
    context: {
      booking_id: bookingId,
      cleaner_id: session.cleanerId,
      action,
      idempotency_key,
    },
  });

  const { error: claimErr } = await admin.from("cleaner_job_lifecycle_idempotency").insert({
    cleaner_id: session.cleanerId,
    booking_id: bookingId,
    idempotency_key,
    action,
  });

  if (claimErr) {
    const dup =
      claimErr.code === "23505" ||
      /duplicate key|unique constraint/i.test(String(claimErr.message ?? ""));
    if (dup) {
      metrics.increment("cleaner_job_lifecycle_idempotency_conflict", { booking_id: bookingId, action });
      void logSystemEvent({
        level: "info",
        source: "cleaner_job_lifecycle",
        message: "job_action_duplicate_idempotency",
        context: { booking_id: bookingId, cleaner_id: session.cleanerId, action, idempotency_key },
      });
      return NextResponse.json({ ok: true, duplicate: true }, { status: 200 });
    }
    void logSystemEvent({
      level: "error",
      source: "cleaner_job_lifecycle",
      message: "job_action_failed",
      context: {
        booking_id: bookingId,
        cleaner_id: session.cleanerId,
        action,
        idempotency_key,
        code: claimErr.code,
        message: claimErr.message,
      },
    });
    return NextResponse.json({ error: claimErr.message ?? "Could not claim idempotency key." }, { status: 500 });
  }

  const out: CleanerLifecycleResult =
    action === "accept"
      ? cleanerAcceptOpToLifecycleResult(
          await cleanerAcceptBooking({
            admin,
            cleanerId: session.cleanerId,
            bookingId,
          }),
        )
      : action === "en_route"
        ? markCleanerOnTheWayOpToLifecycleResult(
            await markCleanerOnTheWay({
              admin,
              cleanerId: session.cleanerId,
              bookingId,
            }),
          )
        : action === "start"
          ? markBookingStartedOpToLifecycleResult(
              await markBookingStarted({
                admin,
                cleanerId: session.cleanerId,
                bookingId,
              }),
            )
          : action === "reject"
            ? cleanerRejectBookingOpToLifecycleResult(
                await cleanerRejectBooking({
                  admin,
                  cleanerId: session.cleanerId,
                  bookingId,
                }),
              )
            : action === "complete"
              ? markBookingCompletedOpToLifecycleResult(
                  await markBookingCompleted({
                    admin,
                    cleanerId: session.cleanerId,
                    bookingId,
                  }),
                )
              : await runCleanerBookingLifecycleAction({
                  admin,
                  cleanerId: session.cleanerId,
                  bookingId,
                  action,
                });

  if (out.status !== 200) {
    await admin.from("cleaner_job_lifecycle_idempotency").delete().eq("idempotency_key", idempotency_key);
    void logSystemEvent({
      level: "warn",
      source: "cleaner_job_lifecycle",
      message: "job_action_failed",
      context: {
        booking_id: bookingId,
        cleaner_id: session.cleanerId,
        action,
        idempotency_key,
        http_status: out.status,
        response: out.json,
      },
    });
  } else {
    void logSystemEvent({
      level: "info",
      source: "cleaner_job_lifecycle",
      message: "job_action_success",
      context: { booking_id: bookingId, cleaner_id: session.cleanerId, action, idempotency_key },
    });
  }

  return NextResponse.json(out.json, { status: out.status });
}
