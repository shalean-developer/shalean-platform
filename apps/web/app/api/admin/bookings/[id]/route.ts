import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin/requireAdminSession";
import { invalidateCleanerAvailabilityCache } from "@/lib/admin/cleanerAvailabilityCache";
import { applyAdminBookingLifecycleStatusOverride } from "@/lib/admin/adminBookingLifecycleStatusOverrideCommand";
import { findCleanerSlotConflict } from "@/lib/admin/adminCleanerSlotConflict";
import { normalizeTimeHm } from "@/lib/admin/validateAdminBookingSlot";
import { countActiveTeamMembersOnDate } from "@/lib/cleaner/teamMemberAvailability";
import { isAdmin } from "@/lib/auth/admin";
import { isTeamService } from "@/lib/dispatch/assignBooking";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { notifyCleanerAssignedBooking } from "@/lib/dispatch/notifyCleanerAssigned";
import { scheduleStuckEarningsRecomputeDebounced } from "@/lib/cleaner/scheduleStuckEarningsRecompute";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { BOOKING_PAYOUT_COLUMNS_CLEAR } from "@/lib/payout/bookingPayoutColumns";
import {
  adminBookingBeforeAssignmentPatchSelectList,
  bookingRequiresPersistedEarningsBeforeCleanerNotify,
  revertAdminBookingAssignmentToBeforeRow,
} from "@/lib/payout/adminBookingAssignmentEarningsGate";
import {
  bookingPaymentRecomputeBlockedByRefund,
  bookingsPersistSelectListForPersist,
  fetchBookingDisplayEarningsCents,
  hasPersistedDisplayEarningsBasis,
  isCompletableDisplayEarningsCents,
  resolvePersistCleanerIdForBooking,
  type BookingPaidSignalRow,
} from "@/lib/payout/bookingEarningsIntegrity";
import { persistCleanerPayoutIfUnset, resolvePersistEarningsComputation, type PersistBookingRowForEarnings } from "@/lib/payout/persistCleanerPayout";
import { buildCompletionCoherencePatch } from "@/lib/booking/bookingCompletionIntegrity";
import { ensureCleanerEarningsLedgerRow } from "@/lib/payout/ensureCleanerEarningsLedger";
import { resetBookingCleanerLineEarnings } from "@/lib/payout/resetBookingCleanerLineEarnings";
import { CLEANER_RESPONSE } from "@/lib/dispatch/cleanerResponseStatus";
import { bookingIsRecurringPendingPayment } from "@/lib/cleaner/cleanerRecurringPendingPaymentLifecycle";
import { fetchServiceQaForAdminBooking } from "@/lib/booking/bookingServiceQaServer";
import { canonicalDbBookingStatus } from "@/lib/booking/canonicalBookingStatus";
import { ensureBookingLineItemsForEarningsIfMissing } from "@/lib/booking/ensureBookingLineItemsForEarnings";
import { buildDashboardLifecycleAlignmentWire } from "@/lib/booking/readModels/bookingReadModel";
import { assertAdminBookingDeleteSafe } from "@/lib/admin/adminBookingDeleteSafety";
import { assertAdminBookingPatchDoesNotMutateAssignmentFields } from "@/lib/admin/adminBookingPatchAssignmentGuard";
import { buildAdminWarningPayload } from "@/lib/admin/adminWarningPayload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "Missing booking id." }, { status: 400 });
  }

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) {
    return NextResponse.json({ error: "Missing authorization." }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const pub = createClient(url, anon);
  const {
    data: { user },
  } = await pub.auth.getUser(token);
  if (!user?.email || !isAdmin(user.email)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const { data: booking, error } = await admin
    .from("bookings")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!booking) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  const cleanerId = typeof booking.cleaner_id === "string" ? booking.cleaner_id : null;
  const userId = typeof booking.user_id === "string" ? booking.user_id : null;

  const selectedRaw =
    typeof (booking as { selected_cleaner_id?: unknown }).selected_cleaner_id === "string"
      ? String((booking as { selected_cleaner_id: string }).selected_cleaner_id).trim()
      : "";
  const selectedCleanerId = /^[0-9a-f-]{36}$/i.test(selectedRaw) ? selectedRaw : null;
  /** Join row for checkout pick (`selected_cleaner_id`) whenever set — list card labels selection separately from assignment. */
  const fetchSelectedCleanerRow = selectedCleanerId != null;

  const cleanerPromise = cleanerId
    ? admin
        .from("cleaners")
        .select("id, full_name, email, phone, status, rating")
        .eq("id", cleanerId)
        .maybeSingle()
    : Promise.resolve({ data: null, error: null });

  const selectedCleanerPromise = fetchSelectedCleanerRow
    ? admin
        .from("cleaners")
        .select("id, full_name, email, phone, status, rating")
        .eq("id", selectedCleanerId)
        .maybeSingle()
    : Promise.resolve({ data: null, error: null });

  const userProfilePromise = userId
    ? admin
        .from("user_profiles")
        .select("id, email, full_name, phone, tier")
        .eq("id", userId)
        .maybeSingle()
    : Promise.resolve({ data: null, error: null });

  const offersPromise = admin
    .from("dispatch_offers")
    .select("id, cleaner_id, status, rank_index, expires_at, created_at, responded_at, ux_variant")
    .eq("booking_id", id)
    .order("created_at", { ascending: false });

  const issueReportsPromise = admin
    .from("cleaner_job_issue_reports")
    .select(
      "id, cleaner_id, reason_key, reason_version, detail, whatsapp_snapshot, idempotency_key, created_at, resolved_at, resolved_by",
    )
    .eq("booking_id", id)
    .order("created_at", { ascending: false })
    .limit(50);

  const bookingLineItemsPromise = admin.from("booking_line_items").select("*").eq("booking_id", id);

  const cleanerEarningsPromise = admin.from("cleaner_earnings").select("*").eq("booking_id", id);

  const [
    { data: cleaner },
    { data: selected_cleaner },
    { data: userProfile },
    { data: dispatchOffers, error: offersErr },
    { data: cleanerIssueReportsRaw, error: issueErr },
    { data: booking_line_items, error: lineItemsErr },
    { data: cleaner_earnings, error: earningsErr },
  ] = await Promise.all([
    cleanerPromise,
    selectedCleanerPromise,
    userProfilePromise,
    offersPromise,
    issueReportsPromise,
    bookingLineItemsPromise,
    cleanerEarningsPromise,
  ]);

  if (offersErr) {
    return NextResponse.json({ error: offersErr.message }, { status: 500 });
  }
  if (issueErr) {
    return NextResponse.json({ error: issueErr.message }, { status: 500 });
  }
  if (lineItemsErr) {
    return NextResponse.json({ error: lineItemsErr.message }, { status: 500 });
  }
  if (earningsErr) {
    return NextResponse.json({ error: earningsErr.message }, { status: 500 });
  }

  const cleanerIssueReports = [...(cleanerIssueReportsRaw ?? [])].sort((a, b) => {
    const ar = Boolean((a as { resolved_at?: string | null }).resolved_at);
    const br = Boolean((b as { resolved_at?: string | null }).resolved_at);
    if (ar !== br) return ar ? 1 : -1;
    const ta = new Date(String((a as { created_at?: string }).created_at ?? "")).getTime();
    const tb = new Date(String((b as { created_at?: string }).created_at ?? "")).getTime();
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
  });

  const b = booking as Record<string, unknown>;
  const supports_team_assignment = isTeamService({
    service: typeof b.service === "string" ? b.service : null,
    service_slug: typeof b.service_slug === "string" ? b.service_slug : null,
    booking_snapshot: b.booking_snapshot,
  });

  let team_summary: { id: string; name: string; member_count: number | null } | null = null;
  const teamId = typeof b.team_id === "string" && b.team_id.trim() ? b.team_id.trim() : null;
  const dateYmd = typeof b.date === "string" ? b.date.trim().slice(0, 10) : "";
  if (teamId) {
    const { data: teamRow } = await admin.from("teams").select("id, name").eq("id", teamId).maybeSingle();
    if (teamRow && typeof teamRow === "object" && "id" in teamRow && "name" in teamRow) {
      let member_count: number | null = null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) {
        const { data: mem } = await admin
          .from("team_members")
          .select("cleaner_id, active_from, active_to")
          .eq("team_id", teamId)
          .not("cleaner_id", "is", null);
        member_count = countActiveTeamMembersOnDate(mem ?? [], dateYmd);
      }
      team_summary = {
        id: String((teamRow as { id: string }).id),
        name: String((teamRow as { name: string }).name),
        member_count,
      };
    }
  }

  const bSvc = booking as { service_slug?: string | null; service?: string | null };
  const service_qa = await fetchServiceQaForAdminBooking(admin, {
    bookingId: id,
    serviceSlug: typeof bSvc.service_slug === "string" ? bSvc.service_slug : null,
    serviceLabel: typeof bSvc.service === "string" ? bSvc.service : null,
  });

  const pendingOfferCount = (dispatchOffers ?? []).filter((o) => {
    const ost = String((o as { status?: string }).status ?? "").toLowerCase();
    return ost === "pending";
  }).length;

  const dashboardLifecycle = buildDashboardLifecycleAlignmentWire(b, {
    pendingDispatchOfferCount: pendingOfferCount,
    telemetryBookingId: id,
  });

  return NextResponse.json({
    booking,
    dashboardLifecycle,
    booking_line_items: booking_line_items ?? [],
    cleaner_earnings: cleaner_earnings ?? [],
    cleaner: cleaner ?? null,
    selected_cleaner: selected_cleaner ?? null,
    userProfile: userProfile ?? null,
    dispatch_offers: dispatchOffers ?? [],
    cleaner_issue_reports: cleanerIssueReports ?? [],
    supports_team_assignment,
    team_summary,
    ...(service_qa ? { service_qa } : {}),
  });
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Missing booking id." }, { status: 400 });

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) return NextResponse.json({ error: "Missing authorization." }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const pub = createClient(url, anon);
  const {
    data: { user },
  } = await pub.auth.getUser(token);
  if (!user?.email || !isAdmin(user.email)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  type PatchBody = {
    status?: string;
    date?: string;
    time?: string;
    cleaner_id?: string | null;
    selected_cleaner_id?: string | null;
    ignore_cleaner_slot_conflict?: boolean;
    cleaner_slot_override_reason?: string | null;
  };
  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const assignmentGuard = assertAdminBookingPatchDoesNotMutateAssignmentFields(body as Record<string, unknown>);
  if (!assignmentGuard.ok) {
    const payload = buildAdminWarningPayload({
      ok: false,
      error: assignmentGuard.message,
      code: assignmentGuard.code,
      warning: {
        code: "admin.assignment.patch_field_blocked",
        domain: "assignment",
        severity: "high",
        action: "blocked",
        message: assignmentGuard.message,
        fields: assignmentGuard.blockedFields,
      },
    });
    return NextResponse.json(
      {
        ...payload,
        blocked_fields: assignmentGuard.blockedFields,
      },
      { status: 409 },
    );
  }
  const updates: Record<string, unknown> = {};

  if (body.status != null) {
    const status = canonicalDbBookingStatus(String(body.status).trim());
    const allowed = new Set(["pending", "assigned", "in_progress", "completed", "cancelled", "failed"]);
    if (!allowed.has(status)) return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    updates.status = status;
    if (status === "cancelled") {
      (updates as Record<string, unknown>).cancelled_by = "system";
    }
  }
  if (body.date != null) {
    const date = String(body.date).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Invalid date format." }, { status: 400 });
    updates.date = date;
  }
  if (body.time != null) {
    const time = String(body.time).trim();
    if (!/^\d{2}:\d{2}(:\d{2})?$/.test(time)) return NextResponse.json({ error: "Invalid time format." }, { status: 400 });
    updates.time = time.length === 5 ? `${time}:00` : time;
  }
  if ("cleaner_id" in body) {
    if (body.cleaner_id === null || body.cleaner_id === "") {
      updates.cleaner_id = null;
    } else if (typeof body.cleaner_id === "string") {
      const cid = body.cleaner_id.trim();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cid)) {
        return NextResponse.json({ error: "Invalid cleaner_id." }, { status: 400 });
      }
      updates.cleaner_id = cid;
    }
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const wantsPreferredCleaner = "selected_cleaner_id" in body;

  if (wantsPreferredCleaner) {
    const { data: prefRow, error: prefErr } = await admin
      .from("bookings")
      .select("date, time, status")
      .eq("id", id)
      .maybeSingle();
    if (prefErr || !prefRow) {
      return NextResponse.json({ error: prefErr?.message ?? "Booking not found." }, { status: 500 });
    }
    const pst = String((prefRow as { status?: string | null }).status ?? "").toLowerCase();
    if (pst !== "pending_payment" && pst !== "pending") {
      return NextResponse.json(
        { error: "Preferred cleaner can only be set while the booking is pending or awaiting payment." },
        { status: 400 },
      );
    }
    const dateYmd = String((prefRow as { date?: string | null }).date ?? "").trim();
    const timeRaw = String((prefRow as { time?: string | null }).time ?? "").trim();
    const timeHm = normalizeTimeHm(timeRaw);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd) || !/^\d{2}:\d{2}$/.test(timeHm)) {
      return NextResponse.json({ error: "Booking must have a valid date and time before assigning a preferred cleaner." }, { status: 400 });
    }

    const ignoreConflict = body.ignore_cleaner_slot_conflict === true;

    if ("selected_cleaner_id" in body) {
      const rawSel = body.selected_cleaner_id;
      if (rawSel === null || rawSel === "") {
        updates.selected_cleaner_id = null;
        (updates as Record<string, unknown>).assignment_type = null;
      } else if (typeof rawSel === "string") {
        const sid = rawSel.trim();
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sid)) {
          return NextResponse.json({ error: "Invalid selected_cleaner_id." }, { status: 400 });
        }
        const { data: clOk } = await admin.from("cleaners").select("id").eq("id", sid).maybeSingle();
        if (!clOk) {
          return NextResponse.json({ error: "Cleaner not found." }, { status: 404 });
        }
        if (!ignoreConflict) {
          const conflictId = await findCleanerSlotConflict(admin, {
            cleanerId: sid,
            dateYmd,
            timeHm,
            excludeBookingId: id,
          });
          if (conflictId) {
            return NextResponse.json(
              {
                error:
                  "This cleaner already has an active booking at this time. Confirm overlap or pass ignore_cleaner_slot_conflict=true with an optional cleaner_slot_override_reason.",
                cleaner_slot_conflict: true,
                conflicting_booking_id: conflictId,
              },
              { status: 409 },
            );
          }
        }
        updates.selected_cleaner_id = sid;
        updates.assignment_type = "user_selected";
        if (ignoreConflict) {
          updates.ignore_cleaner_conflict = true;
          const reasonRaw =
            typeof body.cleaner_slot_override_reason === "string" ? body.cleaner_slot_override_reason.trim().slice(0, 500) : "";
          if (reasonRaw.length > 0) {
            updates.cleaner_slot_override_reason = reasonRaw;
          }
        }
      }
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields provided." }, { status: 400 });
  }

  let assignmentRevertedForEarnings = false;

  const { data: before } = await admin.from("bookings").select(adminBookingBeforeAssignmentPatchSelectList()).eq("id", id).maybeSingle();
  const beforeRow = before as {
    cleaner_id?: string | null;
    status?: string | null;
    completed_at?: string | null;
    dispatch_status?: string | null;
    payout_owner_cleaner_id?: string | null;
    is_team_job?: boolean | null;
    date?: string | null;
    time?: string | null;
    selected_cleaner_id?: string | null;
  } | null;
  const beforeStatus = String(beforeRow?.status ?? "pending").trim() || "pending";
  const beforeCompletedAt =
    beforeRow?.completed_at != null && String(beforeRow.completed_at).trim()
      ? String(beforeRow.completed_at).trim()
      : null;
  /** When admin completion fails earnings gate, revert must restore prior `dispatch_status` if we normalized it. */
  let completionDispatchNormalized = false;
  const oldCleaner =
    before && typeof before === "object"
      ? String((before as { cleaner_id?: string | null }).cleaner_id ?? "").trim() || null
      : null;
  const newCleaner =
    "cleaner_id" in updates && typeof updates.cleaner_id === "string" && updates.cleaner_id.trim().length > 0
      ? updates.cleaner_id.trim()
      : null;
  const cleanerWasChanged = "cleaner_id" in updates && newCleaner !== oldCleaner;
  if (cleanerWasChanged) {
    Object.assign(updates, BOOKING_PAYOUT_COLUMNS_CLEAR);
    await logSystemEvent({
      level: "info",
      source: "admin_booking_reassignment",
      message: "Reassignment triggers payout recalculation",
      context: {
      bookingId: id,
      oldCleanerId: oldCleaner,
      newCleanerId: newCleaner,
      },
    });
  }

  if (cleanerWasChanged && newCleaner) {
    const bs = beforeStatus.toLowerCase();
    if (bs === "pending" || bs === "pending_assignment" || bs === "assigned") {
      (updates as Record<string, unknown>).cleaner_response_status = CLEANER_RESPONSE.PENDING;
      (updates as Record<string, unknown>).en_route_at = null;
      (updates as Record<string, unknown>).started_at = null;
      (updates as Record<string, unknown>).status = "assigned";
      (updates as Record<string, unknown>).dispatch_status = "assigned";
      if (bs === "pending" || bs === "pending_assignment") {
        (updates as Record<string, unknown>).assigned_at = new Date().toISOString();
      }
    }
  }

  if (
    updates.status === "completed" &&
    before &&
    bookingIsRecurringPendingPayment(before as unknown as Record<string, unknown>)
  ) {
    (updates as Record<string, unknown>).admin_recurring_unpaid_completion_override_at = new Date().toISOString();
    (updates as Record<string, unknown>).admin_recurring_unpaid_completion_override_by =
      (typeof user.email === "string" && user.email.trim()) || user.id;
  }

  if (updates.status === "completed" && beforeRow) {
    const { patch: completionCoherencePatch, dispatchStatusNormalized } = buildCompletionCoherencePatch({
      beforeCompletedAt,
      beforeDispatchStatus: beforeRow.dispatch_status ?? null,
      fillCompletedAtIfMissing: true,
    });
    Object.assign(updates, completionCoherencePatch);
    completionDispatchNormalized = dispatchStatusNormalized;
  }

  if (cleanerWasChanged && newCleaner && before && !bookingPaymentRecomputeBlockedByRefund(before as BookingPaidSignalRow)) {
    if (bookingRequiresPersistedEarningsBeforeCleanerNotify(before as never)) {
      const li = await ensureBookingLineItemsForEarningsIfMissing(admin, id, {
        isTeamJob: (before as { is_team_job?: boolean | null }).is_team_job,
      });
      if (!li.ok) {
        return NextResponse.json(
          { error: `Cannot assign cleaner: ${li.error}`, code: "booking_line_items_ensure_failed" },
          { status: 422 },
        );
      }
      const { data: gateFinancial, error: gfErr } = await admin
        .from("bookings")
        .select(bookingsPersistSelectListForPersist())
        .eq("id", id)
        .maybeSingle();
      if (!gfErr && gateFinancial) {
        const merged = { ...(gateFinancial as unknown as Record<string, unknown>), cleaner_id: newCleaner };
        const earned = await resolvePersistEarningsComputation({
          admin,
          bookingId: id,
          expectedCleanerId: newCleaner,
          r: merged as PersistBookingRowForEarnings,
        });
        if (!earned.ok) {
          return NextResponse.json(
            {
              error: `Cannot assign cleaner: earnings cannot be computed (${earned.error}).`,
              code: "earnings_basis_uncomputable",
            },
            { status: 422 },
          );
        }
      }
    }
  }

  const { error } =
    "status" in updates
      ? await applyAdminBookingLifecycleStatusOverride({ admin, bookingId: id, updates })
      : await admin.from("bookings").update(updates).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (
    updates.status === "completed" &&
    before &&
    bookingIsRecurringPendingPayment(before as unknown as Record<string, unknown>)
  ) {
    await logSystemEvent({
      level: "warn",
      source: "admin_booking_lifecycle_override",
      message: "admin_marked_completed_recurring_unpaid_pending_payment",
      context: {
        booking_id: id,
        admin_user_id: user.id,
        admin_email: user.email ?? null,
        prior_status: beforeStatus,
        override_type: "recurring_unpaid_completion",
      },
    });
  }

  if (cleanerWasChanged) {
    const rst = await resetBookingCleanerLineEarnings(admin, id);
    if (!rst.ok) {
      void reportOperationalIssue("error", "admin_bookings_patch", `resetBookingCleanerLineEarnings: ${rst.error}`, {
        bookingId: id,
      });
      return NextResponse.json(
        { error: "Could not reset earnings for reassignment.", code: "earnings_reset_failed" },
        { status: 500 },
      );
    }
  }

  let earningsRecompute: {
    ok: boolean;
    code?: string;
    message?: string;
  } | null = null;

  if (cleanerWasChanged && newCleaner) {
    const { data: earnRefetch, error: earnRefetchErr } = await admin
      .from("bookings")
      .select(
        "cleaner_id, payout_owner_cleaner_id, is_team_job, team_id, refunded_at, refund_status, display_earnings_cents, status",
      )
      .eq("id", id)
      .maybeSingle();

    if (earnRefetchErr || !earnRefetch) {
      earningsRecompute = {
        ok: false,
        code: "refetch_failed",
        message: earnRefetchErr?.message ?? "Could not load booking for earnings recompute.",
      };
      void reportOperationalIssue("error", "admin_bookings_patch", "reassignment earnings refetch failed", {
        bookingId: id,
        error: earnRefetchErr?.message ?? "null_row",
      });
    } else if (bookingPaymentRecomputeBlockedByRefund(earnRefetch as BookingPaidSignalRow)) {
      earningsRecompute = {
        ok: false,
        code: "refund_or_reversal_blocked",
        message: "Earnings were not recomputed — booking is flagged for refund or reversal.",
      };
      void logSystemEvent({
        level: "warn",
        source: "admin_booking_reassignment",
        message: "earnings_recompute_skipped_refund",
        context: { booking_id: id },
      });
    } else {
      const st = String((earnRefetch as { status?: string | null }).status ?? "").toLowerCase();
      if (st === "cancelled" || st === "failed") {
        earningsRecompute = {
          ok: false,
          code: "terminal_booking_status",
          message: `Earnings were not recomputed for status=${st}.`,
        };
      } else {
        const persistCleanerId = resolvePersistCleanerIdForBooking(
          earnRefetch as {
            cleaner_id?: string | null;
            payout_owner_cleaner_id?: string | null;
            is_team_job?: boolean | null;
          },
        );
        if (!persistCleanerId) {
          earningsRecompute = {
            ok: false,
            code: "no_persist_cleaner_id",
            message:
              (earnRefetch as { is_team_job?: boolean | null }).is_team_job === true
                ? "Team job: set payout owner or roster before earnings can be persisted for this assignment."
                : "Could not resolve cleaner id for earnings persist.",
          };
          void reportOperationalIssue("warn", "admin_bookings_patch", "reassignment earnings skipped_no_persist_id", {
            bookingId: id,
            is_team_job: (earnRefetch as { is_team_job?: boolean | null }).is_team_job ?? null,
          });
        } else {
          try {
            const payout = await persistCleanerPayoutIfUnset({
              admin,
              bookingId: id,
              cleanerId: persistCleanerId,
              forceDisplayRecompute: true,
            });
            const displayAfter = await fetchBookingDisplayEarningsCents(admin, id);
            if (hasPersistedDisplayEarningsBasis(displayAfter)) {
              earningsRecompute = { ok: true };
            } else if (payout.ok === false) {
              earningsRecompute = {
                ok: false,
                code: payout.code ?? "payout_persist_failed",
                message: payout.error ?? "Earnings persist failed.",
              };
              void reportOperationalIssue("error", "admin_bookings_patch", "reassignment earnings persist_failed", {
                bookingId: id,
                cleanerId: persistCleanerId,
                code: payout.code ?? null,
              });
            } else if (payout.ok === true && "skipped" in payout && payout.skipped) {
              earningsRecompute = {
                ok: false,
                code: String(payout.skipReason ?? "persist_skipped"),
                message: `Earnings persist skipped: ${String(payout.skipReason ?? "unknown")}.`,
              };
              void reportOperationalIssue("warn", "admin_bookings_patch", "reassignment earnings persist_skipped", {
                bookingId: id,
                cleanerId: persistCleanerId,
                skipReason: payout.skipReason,
              });
            } else {
              earningsRecompute = {
                ok: false,
                code: "display_basis_missing",
                message: "Earnings persist did not leave a display earnings basis on the booking.",
              };
              void reportOperationalIssue("error", "admin_bookings_patch", "reassignment earnings display_still_null", {
                bookingId: id,
                cleanerId: persistCleanerId,
              });
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            earningsRecompute = { ok: false, code: "persist_threw", message: msg };
            void reportOperationalIssue("error", "admin_bookings_patch", `reassignment earnings persist_threw: ${msg}`, {
              bookingId: id,
              cleanerId: persistCleanerId,
            });
          }
        }
      }
    }
  }

  const earningsRevertDenyCodes = new Set(["refetch_failed", "refund_or_reversal_blocked", "terminal_booking_status"]);
  if (
    cleanerWasChanged &&
    newCleaner &&
    before &&
    bookingRequiresPersistedEarningsBeforeCleanerNotify(before as never) &&
    earningsRecompute &&
    earningsRecompute.ok === false &&
    (!earningsRecompute.code || !earningsRevertDenyCodes.has(earningsRecompute.code))
  ) {
    const rev = await revertAdminBookingAssignmentToBeforeRow(admin, id, before as never);
    assignmentRevertedForEarnings = true;
    if (!rev.ok) {
      void reportOperationalIssue("critical", "admin_bookings_patch", `earnings failed and assignment revert failed: ${rev.error}`, {
        bookingId: id,
      });
      return NextResponse.json(
        {
          ok: false,
          error: earningsRecompute.message ?? "Earnings could not be persisted after assignment.",
          code: earningsRecompute.code ?? "earnings_persist_failed",
          earnings_recompute: earningsRecompute,
          assignment_revert_failed: true,
        },
        { status: 500 },
      );
    }
    if (beforeRow) {
      const bd = typeof beforeRow.date === "string" ? beforeRow.date.trim() : "";
      const bt = normalizeTimeHm(String(beforeRow.time ?? ""));
      if (/^\d{4}-\d{2}-\d{2}$/.test(bd) && /^\d{2}:\d{2}$/.test(bt)) {
        invalidateCleanerAvailabilityCache(bd, bt);
      }
    }
    return NextResponse.json(
      {
        ok: false,
        error:
          earningsRecompute.message ??
          "Assignment was rolled back because a persisted earnings basis could not be created for this paid booking.",
        code: earningsRecompute.code ?? "earnings_persist_failed",
        earnings_recompute: earningsRecompute,
        assignment_reverted: true,
      },
      { status: 422 },
    );
  }

  const needsAssignedNotify =
    Boolean(newCleaner && cleanerWasChanged && !assignmentRevertedForEarnings) &&
    (earningsRecompute?.ok === true ||
      !before ||
      !bookingRequiresPersistedEarningsBeforeCleanerNotify(before as never));
  if (needsAssignedNotify && newCleaner) {
    await notifyCleanerAssignedBooking(admin, id, newCleaner);
  }

  const completedViaPatch = updates.status === "completed";
  const wasAlreadyCompleted = String(beforeStatus).toLowerCase() === "completed";
  const needsEarningsIntegrityGate = completedViaPatch && !wasAlreadyCompleted;

  async function revertBookingCompletionOnly(adminClient: SupabaseClient): Promise<void> {
    const patch: Record<string, unknown> = { status: beforeStatus, completed_at: beforeCompletedAt };
    if (completionDispatchNormalized) {
      patch.dispatch_status = beforeRow?.dispatch_status ?? null;
    }
    await adminClient.from("bookings").update(patch).eq("id", id);
  }

  if (completedViaPatch) {
    const { data: postRow, error: postErr } = await admin
      .from("bookings")
      .select("cleaner_id, payout_owner_cleaner_id, is_team_job, display_earnings_cents")
      .eq("id", id)
      .maybeSingle();

    if (postErr || !postRow) {
      if (needsEarningsIntegrityGate) {
        await revertBookingCompletionOnly(admin);
        await reportOperationalIssue("error", "admin_bookings_patch", "post-update booking refetch failed (completion gate)", {
          bookingId: id,
          error: postErr?.message ?? "null_row",
        });
        return NextResponse.json({ error: "Booking refetch failed after update." }, { status: 500 });
      }
    } else {
      const persistCleanerId = resolvePersistCleanerIdForBooking(
        postRow as {
          cleaner_id?: string | null;
          payout_owner_cleaner_id?: string | null;
          is_team_job?: boolean | null;
        },
      );

      if (needsEarningsIntegrityGate && !persistCleanerId) {
        await revertBookingCompletionOnly(admin);
        await logSystemEvent({
          level: "error",
          source: "admin_booking_completed",
          message: "Cannot complete without cleaner / payout owner for earnings",
          context: { bookingId: id },
        });
        return NextResponse.json(
          { error: "Cannot mark completed without a cleaner or team payout owner for earnings." },
          { status: 400 },
        );
      }

      if (persistCleanerId) {
        try {
          const payout = await persistCleanerPayoutIfUnset({ admin, bookingId: id, cleanerId: persistCleanerId });
          if (needsEarningsIntegrityGate && !payout.ok) {
            await revertBookingCompletionOnly(admin);
            await logSystemEvent({
              level: "error",
              source: "admin_booking_completed",
              message: `Payout missing after admin completion (reverted): ${payout.error}`,
              context: { bookingId: id, cleanerId: persistCleanerId },
            });
            return NextResponse.json({ error: payout.error ?? "Earnings persist failed." }, { status: 500 });
          }
          if (needsEarningsIntegrityGate) {
            const displayCents = await fetchBookingDisplayEarningsCents(admin, id);
            if (!isCompletableDisplayEarningsCents(displayCents)) {
              await revertBookingCompletionOnly(admin);
              await reportOperationalIssue("error", "admin_booking_completed", "CRITICAL display_earnings not positive after persist (reverted completion)", {
                bookingId: id,
                cleanerId: persistCleanerId,
              });
              await logSystemEvent({
                level: "error",
                source: "admin_booking_completed",
                message: "Earnings verification failed after completion (reverted)",
                context: { bookingId: id, cleanerId: persistCleanerId },
              });
              return NextResponse.json({ error: "Earnings verification failed after completion." }, { status: 500 });
            }
          } else if (!payout.ok) {
            scheduleStuckEarningsRecomputeDebounced({
              admin,
              bookingId: id,
              cleanerId: persistCleanerId,
              recomputeSource: "admin_patch_already_completed_persist_failed",
            });
            await reportOperationalIssue("error", "admin_booking_completed", `Payout persist failed on already-completed booking: ${payout.error}`, {
              bookingId: id,
              cleanerId: persistCleanerId,
            });
            return NextResponse.json(
              {
                error: "Completed booking has missing earnings — integrity violation.",
                code: "INTEGRITY_COMPLETED_MISSING_EARNINGS",
              },
              { status: 422 },
            );
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (needsEarningsIntegrityGate) {
            await revertBookingCompletionOnly(admin);
            await logSystemEvent({
              level: "error",
              source: "admin_booking_completed",
              message: `Payout persist threw after admin completion (reverted): ${msg}`,
              context: { bookingId: id, cleanerId: persistCleanerId },
            });
            return NextResponse.json({ error: "Earnings persist failed." }, { status: 500 });
          }
          scheduleStuckEarningsRecomputeDebounced({
            admin,
            bookingId: id,
            cleanerId: persistCleanerId,
            recomputeSource: "admin_patch_already_completed_persist_threw",
          });
          await reportOperationalIssue("error", "admin_booking_completed", `Payout persist threw (already completed): ${msg}`, {
            bookingId: id,
            cleanerId: persistCleanerId,
          });
          return NextResponse.json(
            {
              error: "Completed booking has missing earnings — integrity violation.",
              code: "INTEGRITY_COMPLETED_MISSING_EARNINGS",
            },
            { status: 422 },
          );
        }
      }
    }
  }

  const { data: intr0 } = await admin
    .from("bookings")
    .select("status, display_earnings_cents, cleaner_id, payout_owner_cleaner_id, is_team_job")
    .eq("id", id)
    .maybeSingle();
  const intrStatus = String(intr0?.status ?? "").toLowerCase();
  if (intrStatus === "completed" && !hasPersistedDisplayEarningsBasis((intr0 as { display_earnings_cents?: unknown }).display_earnings_cents)) {
    const intrPid = resolvePersistCleanerIdForBooking(
      intr0 as {
        cleaner_id?: string | null;
        payout_owner_cleaner_id?: string | null;
        is_team_job?: boolean | null;
      },
    );
    if (intrPid) {
      try {
        await persistCleanerPayoutIfUnset({ admin, bookingId: id, cleanerId: intrPid });
      } catch {
        /* final gate will still fail below if row unchanged */
      }
      scheduleStuckEarningsRecomputeDebounced({
        admin,
        bookingId: id,
        cleanerId: intrPid,
        recomputeSource: "admin_patch_final_integrity",
      });
    }
    const { data: intr1 } = await admin.from("bookings").select("display_earnings_cents").eq("id", id).maybeSingle();
    if (!hasPersistedDisplayEarningsBasis((intr1 as { display_earnings_cents?: unknown } | null)?.display_earnings_cents)) {
      await reportOperationalIssue("error", "admin_bookings_patch", "INTEGRITY: completed booking missing display_earnings_cents after PATCH", {
        bookingId: id,
      });
      return NextResponse.json(
        {
          error: "Completed booking has missing earnings — integrity violation.",
          code: "INTEGRITY_COMPLETED_MISSING_EARNINGS",
        },
        { status: 422 },
      );
    }
  }

  const { data: postPatchStatus } = await admin.from("bookings").select("status").eq("id", id).maybeSingle();
  if (String((postPatchStatus as { status?: string | null } | null)?.status ?? "").toLowerCase() === "completed") {
    void ensureCleanerEarningsLedgerRow({ admin, bookingId: id });
  }

  if (beforeRow) {
    const bd = typeof beforeRow.date === "string" ? beforeRow.date.trim() : "";
    const bt = normalizeTimeHm(String(beforeRow.time ?? ""));
    if (/^\d{4}-\d{2}-\d{2}$/.test(bd) && /^\d{2}:\d{2}$/.test(bt)) {
      invalidateCleanerAvailabilityCache(bd, bt);
    }
    const nd = typeof updates.date === "string" ? String(updates.date).trim() : bd;
    const ntSource = typeof updates.time === "string" ? updates.time : beforeRow.time;
    const nt = normalizeTimeHm(String(ntSource ?? ""));
    if (
      (updates.date != null ||
        updates.time != null ||
        "selected_cleaner_id" in updates ||
        "cleaner_id" in updates) &&
      /^\d{4}-\d{2}-\d{2}$/.test(nd) &&
      /^\d{2}:\d{2}$/.test(nt)
    ) {
      invalidateCleanerAvailabilityCache(nd, nt);
    }
  }

  return NextResponse.json({
    ok: true,
    ...(earningsRecompute != null ? { earnings_recompute: earningsRecompute } : {}),
  });
}

/**
 * Hard-delete a booking (cascades child rows). This is only for operationally
 * safe rows that have not entered payment, monthly invoice, or payout flows.
 */
export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminSession(request);
  if (!auth.ok) return auth.response;

  const { id: rawId } = await ctx.params;
  const id = rawId?.trim();
  if (!id) return NextResponse.json({ error: "Missing booking id." }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data: row, error: loadErr } = await admin
    .from("bookings")
    .select(
      "id, status, payment_status, payment_completed_at, paid_at, monthly_invoice_id, payout_id, payout_status, payout_frozen_cents, display_earnings_cents, amount_paid_cents, cleaner_id, date, time",
    )
    .eq("id", id)
    .maybeSingle();

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Booking not found." }, { status: 404 });

  const r = row as {
    status?: string | null;
    payment_status?: string | null;
    payment_completed_at?: string | null;
    paid_at?: string | null;
    monthly_invoice_id?: string | null;
    payout_id?: string | null;
    payout_status?: string | null;
    payout_frozen_cents?: number | string | null;
    display_earnings_cents?: number | string | null;
    amount_paid_cents?: number | string | null;
    cleaner_id?: string | null;
    date?: string | null;
    time?: string | null;
  };

  const st = String(r.status ?? "").toLowerCase();
  const deleteSafety = assertAdminBookingDeleteSafe(r);
  if (!deleteSafety.ok) {
    return NextResponse.json(
      buildAdminWarningPayload({
        error: deleteSafety.error,
        code: deleteSafety.code,
        blocks: deleteSafety.blocks,
        warning: {
          code: "admin.delete.financial_booking_blocked",
          domain: "delete",
          severity: "critical",
          action: "blocked",
          message: deleteSafety.error,
          diagnostics: { legacyCode: deleteSafety.code },
        },
      }),
      { status: 409 },
    );
  }

  const { error: delErr } = await admin.from("bookings").delete().eq("id", id);
  if (delErr) {
    await logSystemEvent({
      level: "error",
      source: "admin_booking_delete",
      message: "booking_delete_failed",
      context: { booking_id: id, admin_id: auth.user.id, pg: delErr.message },
    });
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  const bd = typeof r.date === "string" ? r.date.trim() : "";
  const bt = normalizeTimeHm(String(r.time ?? ""));
  if (/^\d{4}-\d{2}-\d{2}$/.test(bd) && /^\d{2}:\d{2}$/.test(bt)) {
    invalidateCleanerAvailabilityCache(bd, bt);
  }

  await logSystemEvent({
    level: "warn",
    source: "admin_booking_delete",
    message: "booking_deleted",
    context: { booking_id: id, admin_id: auth.user.id, prior_status: st },
  });

  return NextResponse.json({ ok: true });
}
