import { canonicalDbBookingStatus } from "@/lib/booking/canonicalBookingStatus";
import {
  deriveBookingOperationalPhase,
  isAuthoritativeBookingCompleted,
  type BookingOperationalPhase,
  type PhaseRow,
} from "@/lib/booking/deriveBookingOperationalPhase";
import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";
import type { LifecycleWireLike } from "@/lib/cleaner/cleanerJobLifecyclePhaseRank";
import { isAssignableForCleanerLifecycleStatus } from "@/lib/cleaner/cleanerBookingLifecycleStatuses";
import {
  bookingMatchesRecurringCleanerPendingPayment,
  cleanerPendingPaymentBannerForRow,
  isCleanerAssignmentAcceptedRecord,
} from "@/lib/cleaner/cleanerBookingAccess";
import {
  bookingIsRecurringPendingPayment,
  recurringPendingPaymentLifecycleAllowsAction,
  recurringPendingPaymentProgressionBlockedMessage,
} from "@/lib/cleaner/cleanerRecurringPendingPaymentLifecycle";
import { assignedOfferPastAcceptanceDeadline } from "@/lib/cleaner/cleanerAssignedOfferExpiry";
import {
  pairedRosterMemberShouldShowComplete,
  type ViewerRosterContext,
} from "@/lib/cleaner/pairedRosterMemberLifecycle";
import { isBookingPayoutPaid } from "@/lib/cleaner/cleanerPayoutPaid";
import { CLEANER_RESPONSE } from "@/lib/dispatch/cleanerResponseStatus";

export type OperationalViewer = "admin" | "customer" | "cleaner";

export type LifecycleCapabilities = {
  accept: boolean;
  reject: boolean;
  travel: boolean;
  start: boolean;
  complete: boolean;
};

/** Primary cleaner field actions (canonical, shared with mobile lifecycle). */
export type CleanerJobUiState =
  | { phase: "none" }
  | { phase: "expired" }
  | { phase: "accept"; canReject: boolean }
  | { phase: "on_my_way" }
  | { phase: "start" }
  | { phase: "complete" };

export type CleanerMobilePhase = "pending" | "assigned" | "en_route" | "in_progress" | "completed";

export type OperationalVisibilityMode =
  | "admin_full"
  /** Customer apps: list/detail visibility is RBAC + row ownership, not cleaner unpaid-list rules. */
  | "customer_dashboard"
  | "cleaner_jobs_list_visible"
  | "cleaner_jobs_list_hidden_unpaid_one_shot"
  | "cleaner_recurring_unpaid_visible";

export type DescribeBookingOperationalStateInput = {
  row: Record<string, unknown>;
  viewer: OperationalViewer;
  nowMs?: number;
  telemetryBookingId?: string;
  /** Client-only hints echoed into {@link DescribeBookingOperationalStateResult.diagnostics} (never affects derivation). */
  clientHints?: {
    optimistic_overlay?: boolean;
    realtime_source?: string | null;
  };
};

export type OperationalDisplayTone = "neutral" | "success" | "warning" | "danger" | "muted";

/** Queue / POST actions aligned with {@link import("@/lib/cleaner/cleanerJobPendingLifecycleQueue").PendingLifecycleAction}. */
export type OperationalLifecycleQueueAction = "accept" | "reject" | "en_route" | "start" | "complete";

export type DescribeBookingOperationalStateResult = {
  operationalPhase: BookingOperationalPhase;
  lifecycleCapabilities: LifecycleCapabilities;
  /** Cleaner-facing capability matrix for the same row (admin surfaces use this for parity). */
  cleanerLifecycleCapabilities: LifecycleCapabilities;
  visibilityMode: OperationalVisibilityMode;
  paymentState: string;
  recurringState: string;
  payoutState: "n_a" | "pending" | "eligible" | "paid" | "invalid";
  displayBadge: string;
  displayTone: OperationalDisplayTone;
  isEstimate: boolean;
  progressionBlockedReason: string | null;
  canAdminOverride: boolean;
  overrideReason: string | null;
  overrideType: string | null;
  /** Persisted marker: admin completed while recurring unpaid policy applied. */
  overrideApplied: boolean;
  overrideRecordedAt: string | null;
  overrideRecordedBy: string | null;
  cleanerJobUi: CleanerJobUiState;
  cleanerMobilePhase: CleanerMobilePhase;
  adminTimeline: {
    createdDone: boolean;
    paidDone: boolean;
    assignedDone: boolean;
    acceptedDone: boolean;
    inProgressDone: boolean;
    completedDone: boolean;
    payoutPaid: boolean;
  };
  /** Ordered keys for payment/lifecycle/payout timelines (done flags only — labels stay in UI formatters). */
  timelineSteps: ReadonlyArray<{ key: string; done: boolean }>;
  timelineFlags: {
    adminRecurringUnpaidCompletionOverride: boolean;
    recurringSettlementOutstanding: boolean;
  };
  diagnostics: {
    operational_state_source: "describeBookingOperationalState";
    operational_phase: BookingOperationalPhase;
    payment_state: string;
    recurring_state: string;
    payout_state: "n_a" | "pending" | "eligible" | "paid" | "invalid";
    lifecycle_capabilities: LifecycleCapabilities;
    cleaner_lifecycle_capabilities: LifecycleCapabilities;
    display_badge: string;
    display_tone: OperationalDisplayTone;
    visibility_mode: OperationalVisibilityMode;
    override_active: boolean;
    override_applied: boolean;
    override_reason: string | null;
    override_type: string | null;
    optimistic_state?: boolean;
    realtime_source?: string | null;
  };
};

const NO_CAPS: LifecycleCapabilities = {
  accept: false,
  reject: false,
  travel: false,
  start: false,
  complete: false,
};

function overrideAppliedFromRow(row: Record<string, unknown>): boolean {
  return Boolean(String(row.admin_recurring_unpaid_completion_override_at ?? "").trim());
}

function overrideRecordedAtFromRow(row: Record<string, unknown>): string | null {
  const raw = row.admin_recurring_unpaid_completion_override_at;
  const s = raw == null ? "" : String(raw).trim();
  return s || null;
}

function overrideRecordedByFromRow(row: Record<string, unknown>): string | null {
  const raw = row.admin_recurring_unpaid_completion_override_by;
  const s = raw == null ? "" : String(raw).trim();
  return s || null;
}

function buildTimelineSteps(
  adminT: DescribeBookingOperationalStateResult["adminTimeline"],
  overrideApplied: boolean,
): ReadonlyArray<{ key: string; done: boolean }> {
  return [
    { key: "created", done: adminT.createdDone },
    { key: "paid", done: adminT.paidDone },
    { key: "assigned", done: adminT.assignedDone },
    { key: "accepted", done: adminT.acceptedDone },
    { key: "progress", done: adminT.inProgressDone },
    { key: "completed", done: adminT.completedDone },
    { key: "admin_override", done: overrideApplied },
    { key: "payout", done: adminT.payoutPaid },
  ];
}

const TONE_BADGE_CLASS: Record<OperationalDisplayTone, string> = {
  neutral: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
  success: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
  warning: "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
  danger: "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200",
  muted: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
};

/** Tailwind classes for canonical operational tone (admin list pills, shared badges). */
export function operationalDisplayBadgeClassName(tone: OperationalDisplayTone): string {
  return TONE_BADGE_CLASS[tone] ?? TONE_BADGE_CLASS.neutral;
}

export function resolveOperationalBadge(input: DescribeBookingOperationalStateInput): string {
  return describeBookingOperationalState(input).displayBadge;
}

export function resolveOperationalTone(input: DescribeBookingOperationalStateInput): OperationalDisplayTone {
  return describeBookingOperationalState(input).displayTone;
}

/** Alias of {@link resolveOperationalBadge} — single operational meaning string. */
export function resolveOperationalLabel(input: DescribeBookingOperationalStateInput): string {
  return resolveOperationalBadge(input);
}

/** Maps minimal flush/peek wire into a row suitable for {@link describeBookingOperationalState}. */
export function operationalRecordFromLifecycleWire(w: LifecycleWireLike): Record<string, unknown> {
  const o = w as Record<string, unknown>;
  return {
    status: w.status ?? null,
    cleaner_response_status: w.cleaner_response_status ?? null,
    completed_at: w.completed_at ?? null,
    started_at: w.started_at ?? null,
    en_route_at: w.en_route_at ?? null,
    accepted_at: w.accepted_at ?? null,
    dispatch_status: o.dispatch_status ?? null,
    is_recurring_generated: o.is_recurring_generated ?? null,
    billing_type: o.billing_type ?? null,
    monthly_invoice_id: o.monthly_invoice_id ?? null,
    is_team_job: o.is_team_job ?? null,
  };
}

export function isLifecycleActionAllowedByCapabilities(
  action: OperationalLifecycleQueueAction,
  caps: LifecycleCapabilities,
): boolean {
  switch (action) {
    case "accept":
      return caps.accept;
    case "reject":
      return caps.reject;
    case "en_route":
      return caps.travel;
    case "start":
      return caps.start;
    case "complete":
      return caps.complete;
    default:
      return false;
  }
}

/** Minimal row projection for {@link deriveBookingOperationalPhase} — shared by dashboards + read models. */
export function phaseRowFromBookingRecord(row: Record<string, unknown>): PhaseRow {
  return {
    status: row.status as string | null | undefined,
    cleaner_response_status: row.cleaner_response_status as string | null | undefined,
    en_route_at: row.en_route_at as string | null | undefined,
    started_at: row.started_at as string | null | undefined,
    completed_at: row.completed_at as string | null | undefined,
    dispatch_status: row.dispatch_status as string | null | undefined,
    is_recurring_generated: row.is_recurring_generated as boolean | null | undefined,
    billing_type: row.billing_type as string | null | undefined,
    monthly_invoice_id: row.monthly_invoice_id as string | null | undefined,
  };
}

function visibilityModeFor(viewer: OperationalViewer, row: Record<string, unknown>): OperationalVisibilityMode {
  if (viewer === "admin") return "admin_full";
  if (viewer === "customer") return "customer_dashboard";
  const st = String(row.status ?? "").trim().toLowerCase();
  if (st === "pending_payment") {
    return bookingMatchesRecurringCleanerPendingPayment(row)
      ? "cleaner_recurring_unpaid_visible"
      : "cleaner_jobs_list_hidden_unpaid_one_shot";
  }
  return "cleaner_jobs_list_visible";
}

function paymentStateFromRow(row: Record<string, unknown>): string {
  const st = String(row.status ?? "").trim().toLowerCase();
  if (st === "pending_payment") {
    return bookingMatchesRecurringCleanerPendingPayment(row)
      ? "awaiting_recurring_settlement"
      : "awaiting_checkout_payment";
  }
  if (Boolean(String(row.payment_completed_at ?? "").trim())) return "captured";
  if (st === "cancelled") return "cancelled";
  if (st === "failed") return "failed";
  return "open";
}

function recurringStateFromRow(row: Record<string, unknown>): string {
  if (bookingIsRecurringPendingPayment(row)) return "recurring_unpaid_visible";
  const st = String(row.status ?? "").trim().toLowerCase();
  if (st === "pending_payment") return "one_time_pending_payment_hidden_from_cleaner_lists";
  if (row.is_recurring_generated === true) return "recurring_generated_other_status";
  return "none";
}

function payoutStateFromRow(row: Record<string, unknown>): DescribeBookingOperationalStateResult["payoutState"] {
  const st = String(row.status ?? "").trim().toLowerCase();
  if (st !== "completed") return "n_a";
  const ps = String(row.payout_status ?? "")
    .trim()
    .toLowerCase();
  if (ps === "paid") {
    if (isBookingPayoutPaid({ payout_status: row.payout_status, payout_paid_at: row.payout_paid_at })) return "paid";
    return "invalid";
  }
  if (ps === "eligible") return "eligible";
  return "pending";
}

function viewerRosterContextFromAugmentedRow(row: Record<string, unknown>): ViewerRosterContext | null {
  if (row.viewer_is_paired_roster_member !== true) return null;
  const roleRaw = String(row.viewer_roster_role ?? "").trim().toLowerCase();
  return {
    pairedRosterJob: row.paired_roster_job === true,
    viewerOnRoster: row.viewer_on_roster === true,
    viewerRosterRole: roleRaw === "lead" ? "lead" : roleRaw === "member" ? "member" : null,
    viewerRosterCompletedAt: String(row.viewer_roster_completed_at ?? "").trim() || null,
    viewerIsPairedRosterMember: true,
  };
}

function computeCleanerJobUiStateRecord(row: Record<string, unknown>, nowMs?: number): CleanerJobUiState {
  const rosterCtx = viewerRosterContextFromAugmentedRow(row);
  if (rosterCtx?.viewerRosterCompletedAt) {
    return { phase: "none" };
  }
  if (rosterCtx && pairedRosterMemberShouldShowComplete(row, rosterCtx)) {
    return { phase: "complete" };
  }

  const st = String(row.status ?? "").toLowerCase();
  const dst = String(row.dispatch_status ?? "").trim().toLowerCase();
  if (dst === "expired" && (st === "pending" || st === "offered" || st === "pending_assignment")) {
    return { phase: "expired" };
  }
  if (isAuthoritativeBookingCompleted(row) || st === "cancelled" || st === "failed") return { phase: "none" };
  if (st === "in_progress") return { phase: "complete" };

  const isTeam = row.is_team_job === true;
  if (bookingIsRecurringPendingPayment(row)) {
    const responseAccepted = isCleanerAssignmentAcceptedRecord(row);
    if (!responseAccepted) {
      if (assignedOfferPastAcceptanceDeadline(row as CleanerBookingRow, nowMs)) return { phase: "expired" };
      return { phase: "accept", canReject: !isTeam };
    }
    return { phase: "none" };
  }

  const raw = row.cleaner_response_status;
  const r = raw == null || raw === "" ? "" : String(raw).trim().toLowerCase();
  const responseAccepted = isCleanerAssignmentAcceptedRecord(row);
  const onMyWay = r === CLEANER_RESPONSE.ON_MY_WAY;
  const hasEnRoute = Boolean(row.en_route_at);

  if (isAssignableForCleanerLifecycleStatus(st)) {
    const readyToStart = hasEnRoute || onMyWay;
    if (readyToStart) return { phase: "start" };
    if (!responseAccepted) {
      if (assignedOfferPastAcceptanceDeadline(row as CleanerBookingRow, nowMs)) return { phase: "expired" };
      return { phase: "accept", canReject: !isTeam };
    }
    return { phase: "on_my_way" };
  }
  return { phase: "none" };
}

function lifecycleCapabilitiesForCleaner(row: Record<string, unknown>, ui: CleanerJobUiState): LifecycleCapabilities {
  const st = String(row.status ?? "").trim().toLowerCase();
  const rosterCtx = viewerRosterContextFromAugmentedRow(row);
  const pairedMemberCanComplete =
    rosterCtx != null && pairedRosterMemberShouldShowComplete(row, rosterCtx);
  if ((isAuthoritativeBookingCompleted(row) || st === "cancelled" || st === "failed") && !pairedMemberCanComplete) {
    return NO_CAPS;
  }
  if (st === "pending_payment") {
    return {
      accept: recurringPendingPaymentLifecycleAllowsAction("accept", row).allowed,
      reject: recurringPendingPaymentLifecycleAllowsAction("reject", row).allowed,
      travel: recurringPendingPaymentLifecycleAllowsAction("en_route", row).allowed,
      start: recurringPendingPaymentLifecycleAllowsAction("start", row).allowed,
      complete: recurringPendingPaymentLifecycleAllowsAction("complete", row).allowed,
    };
  }
  return {
    accept: ui.phase === "accept",
    reject: ui.phase === "accept" && ui.canReject,
    travel: ui.phase === "on_my_way",
    start: ui.phase === "start",
    complete: ui.phase === "complete",
  };
}

function lifecycleCapabilitiesForAdmin(row: Record<string, unknown>): LifecycleCapabilities {
  const st = String(row.status ?? "").toLowerCase();
  if (isAuthoritativeBookingCompleted(row) || st === "cancelled" || st === "failed") return NO_CAPS;
  return { accept: false, reject: false, travel: false, start: false, complete: true };
}

function computeCleanerMobilePhase(
  row: Record<string, unknown>,
  operationalPhase: BookingOperationalPhase,
): CleanerMobilePhase {
  const rosterCtx = viewerRosterContextFromAugmentedRow(row);
  if (rosterCtx?.viewerRosterCompletedAt) {
    return "completed";
  }
  if (rosterCtx && pairedRosterMemberShouldShowComplete(row, rosterCtx)) {
    return "in_progress";
  }

  const st = String(row.status ?? "").toLowerCase();
  if (operationalPhase === "completed" || operationalPhase === "cancelled" || operationalPhase === "failed") {
    return "completed";
  }
  if (operationalPhase === "active") return "in_progress";
  if (operationalPhase === "travelling") return "en_route";
  if (operationalPhase === "pending" && st === "pending" && row.en_route_at) return "en_route";
  if (operationalPhase === "accepted" || operationalPhase === "assigned") return "assigned";
  if (operationalPhase === "pending_payment" || operationalPhase === "pending_payment_recurring") {
    if (operationalPhase === "pending_payment_recurring" && isCleanerAssignmentAcceptedRecord(row)) return "assigned";
    return "pending";
  }
  if (operationalPhase === "pending" || operationalPhase === "expired") return "pending";
  return "pending";
}

function computeDisplayBadge(row: Record<string, unknown>, ui: CleanerJobUiState): string {
  const st = String(row.status ?? "").toLowerCase();
  if (st === "cancelled") return "Cancelled";
  const rosterCtx = viewerRosterContextFromAugmentedRow(row);
  if (
    rosterCtx &&
    !Boolean(String(row.viewer_roster_completed_at ?? "").trim()) &&
    pairedRosterMemberShouldShowComplete(row, rosterCtx)
  ) {
    return "Complete your visit";
  }
  if (
    row.viewer_is_paired_roster_member === true &&
    Boolean(String(row.viewer_roster_completed_at ?? "").trim())
  ) {
    return "Completed";
  }
  if (isAuthoritativeBookingCompleted(row) && overrideAppliedFromRow(row)) return "Completed by admin override";
  if (isAuthoritativeBookingCompleted(row)) return "Completed";
  if (st === "pending_payment") {
    if (bookingMatchesRecurringCleanerPendingPayment(row) && isCleanerAssignmentAcceptedRecord(row)) {
      const bt = String(row.billing_type ?? "").trim().toLowerCase();
      if (bt === "monthly_contract" || bt === "recurring_invoice") return "Awaiting invoice approval";
      const mid = row.monthly_invoice_id;
      if (mid != null && String(mid).trim() !== "") return "Awaiting invoice approval";
      return "Awaiting payment confirmation";
    }
    const line = cleanerPendingPaymentBannerForRow(row);
    if (line) return line;
    return bookingMatchesRecurringCleanerPendingPayment(row) ? "Awaiting customer payment" : "Awaiting payment";
  }
  const dst = String(row.dispatch_status ?? "").toLowerCase();
  if (dst === "expired") return "Dispatch expired";
  if (st === "in_progress") return "In progress";
  if (st === "pending") return row.en_route_at ? "En route" : "Pending";
  if (isAssignableForCleanerLifecycleStatus(st)) {
    if (ui.phase === "expired") return "Offer expired";
    if (ui.phase === "accept") return "Needs accept";
    if (ui.phase === "on_my_way") return "Accepted";
    if (ui.phase === "start" || row.en_route_at) return "En route";
    if (ui.phase === "complete") return "In progress";
    return "Assigned";
  }
  return "Open";
}

function displayToneFrom(row: Record<string, unknown>, operationalPhase: BookingOperationalPhase): OperationalDisplayTone {
  const st = String(row.status ?? "").trim().toLowerCase();
  if (st === "cancelled" || st === "failed") return "danger";
  if (overrideAppliedFromRow(row) && isAuthoritativeBookingCompleted(row)) return "warning";
  if (isAuthoritativeBookingCompleted(row) || operationalPhase === "completed") return "success";
  if (st === "pending_payment") return "warning";
  if (operationalPhase === "expired") return "muted";
  return "neutral";
}

function adminTimelineFromRow(row: Record<string, unknown>): DescribeBookingOperationalStateResult["adminTimeline"] {
  const st = String(row.status ?? "").trim().toLowerCase();
  const stCanon = canonicalDbBookingStatus(st);
  const payoutPs = String(row.payout_status ?? "").trim().toLowerCase();
  const paidDone = Boolean(String(row.payment_completed_at ?? "").trim());
  const authCompleted = isAuthoritativeBookingCompleted(row);
  const started = Boolean(String(row.started_at ?? "").trim());
  const assignedDone =
    Boolean(String(row.cleaner_id ?? "").trim()) ||
    (row.is_team_job === true && Boolean(String(row.team_id ?? "").trim())) ||
    (["assigned", "in_progress", "completed"].includes(stCanon) && Boolean(String(row.assigned_at ?? "").trim()));
  const crs = String(row.cleaner_response_status ?? "").trim().toLowerCase();
  const acceptedDone =
    crs === "accepted" ||
    crs === "on_my_way" ||
    crs === "started" ||
    crs === "completed" ||
    Boolean(String(row.accepted_at ?? "").trim());
  return {
    createdDone: true,
    paidDone,
    assignedDone,
    acceptedDone,
    inProgressDone: authCompleted || st === "in_progress" || started,
    completedDone: authCompleted,
    payoutPaid: payoutPs === "paid",
  };
}

function progressionBlockedReasonFor(
  viewer: OperationalViewer,
  row: Record<string, unknown>,
  caps: LifecycleCapabilities,
): string | null {
  if (viewer !== "cleaner") return null;
  if (caps.travel || caps.start || caps.complete) return null;
  if (bookingIsRecurringPendingPayment(row) && isCleanerAssignmentAcceptedRecord(row)) {
    return recurringPendingPaymentProgressionBlockedMessage();
  }
  return null;
}

/**
 * Single authoritative operational interpretation for a `bookings` row (admin, customer, cleaner).
 * `operationalPhase` / payment / recurring / payout strings are identical across viewers; capabilities and visibility differ.
 */
export function describeBookingOperationalState(
  input: DescribeBookingOperationalStateInput,
): DescribeBookingOperationalStateResult {
  const { row, viewer, nowMs, telemetryBookingId, clientHints } = input;
  const phaseRow = phaseRowFromBookingRecord(row);
  const operationalPhase = deriveBookingOperationalPhase(phaseRow, {
    telemetryBookingId: telemetryBookingId?.trim() || undefined,
  });
  const cleanerJobUi = computeCleanerJobUiStateRecord(row, nowMs);
  const cleanerLifecycleCapabilities = lifecycleCapabilitiesForCleaner(row, cleanerJobUi);
  const adminLifecycleCaps = lifecycleCapabilitiesForAdmin(row);
  const lifecycleCapabilities =
    viewer === "admin" ? adminLifecycleCaps : viewer === "customer" ? NO_CAPS : cleanerLifecycleCapabilities;

  const visibilityMode = visibilityModeFor(viewer, row);
  const paymentState = paymentStateFromRow(row);
  const recurringState = recurringStateFromRow(row);
  const payoutState = payoutStateFromRow(row);
  const displayBadge = computeDisplayBadge(row, cleanerJobUi);
  const displayTone = displayToneFrom(row, operationalPhase);
  const isEstimate =
    row.displayEarningsIsEstimate === true ||
    row.earnings_estimated === true ||
    row.earnings_is_estimate === true;

  const st = String(row.status ?? "").trim().toLowerCase();
  const canAdminOverride =
    bookingIsRecurringPendingPayment(row) &&
    !isAuthoritativeBookingCompleted(row) &&
    st !== "cancelled" &&
    st !== "failed";
  const overrideType = canAdminOverride ? "recurring_unpaid_admin_completion" : null;
  const overrideReason = canAdminOverride
    ? "Admin may mark this visit completed while customer or invoice payment is still unsettled; cleaner travel, start, and complete remain locked until payment is confirmed."
    : null;

  const progressionBlockedReason = progressionBlockedReasonFor(viewer, row, cleanerLifecycleCapabilities);
  const cleanerMobilePhase = computeCleanerMobilePhase(row, operationalPhase);
  const adminTimeline = adminTimelineFromRow(row);
  const overrideApplied = overrideAppliedFromRow(row);
  const overrideRecordedAt = overrideRecordedAtFromRow(row);
  const overrideRecordedBy = overrideRecordedByFromRow(row);
  const timelineSteps = buildTimelineSteps(adminTimeline, overrideApplied);
  const timelineFlags = {
    adminRecurringUnpaidCompletionOverride: overrideApplied,
    recurringSettlementOutstanding: bookingIsRecurringPendingPayment(row),
  } as const;

  const diagnostics: DescribeBookingOperationalStateResult["diagnostics"] = {
    operational_state_source: "describeBookingOperationalState",
    operational_phase: operationalPhase,
    payment_state: paymentState,
    recurring_state: recurringState,
    payout_state: payoutState,
    lifecycle_capabilities: lifecycleCapabilities,
    cleaner_lifecycle_capabilities: cleanerLifecycleCapabilities,
    display_badge: displayBadge,
    display_tone: displayTone,
    visibility_mode: visibilityMode,
    override_active: Boolean(canAdminOverride || overrideApplied),
    override_applied: overrideApplied,
    override_reason: overrideReason,
    override_type: overrideType,
    ...(clientHints?.optimistic_overlay !== undefined ? { optimistic_state: clientHints.optimistic_overlay } : {}),
    ...(clientHints?.realtime_source !== undefined ? { realtime_source: clientHints.realtime_source } : {}),
  };

  return {
    operationalPhase,
    lifecycleCapabilities,
    cleanerLifecycleCapabilities,
    visibilityMode,
    paymentState,
    recurringState,
    payoutState,
    displayBadge,
    displayTone,
    isEstimate,
    progressionBlockedReason,
    canAdminOverride,
    overrideReason,
    overrideType,
    overrideApplied,
    overrideRecordedAt,
    overrideRecordedBy,
    cleanerJobUi,
    cleanerMobilePhase,
    adminTimeline,
    timelineSteps,
    timelineFlags,
    diagnostics,
  };
}
