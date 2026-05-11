/**
 * ## Booking completion flow — integrity helpers (read-only diagnostics + patch fragments)
 *
 * ### Who marks completed (production)
 *
 * | Entry | Mechanism | `completed_at` | `dispatch_status` heal |
 * |-------|-----------|----------------|-------------------------|
 * | Cleaner | `POST /api/cleaner/jobs/:id` `{action:"complete"}` / `POST .../complete` → {@link markBookingCompleted} → `runCleanerBookingLifecycleAction("complete")` | Set to `now` with `status=completed` | Searching/offered → `assigned` via {@link buildCompletionCoherencePatch} |
 * | Admin | `PATCH /api/admin/bookings/:id` `{ status: "completed" }` | Was missing before fix; now filled when absent | Same heal when funnel still active |
 * | Cron | `markPastBookingsCompleted` in `/api/cron/booking-lifecycle` | Always set | Same heal when selected row has stale funnel |
 *
 * Payout verification runs before cleaner completion and after admin completion (existing gates). This module does **not** change payout math.
 *
 * ### Minimal coherence contract
 *
 * - Transitioning to **completed** should set **`completed_at`** when it was unset (admin/cron align with cleaner).
 * - Terminal jobs should not keep **`dispatch_status`** in `searching` \| `offered` — heal to `assigned`.
 * - **{@link deriveBookingOperationalPhase}** treats `status === "completed"` **or** non-empty `completed_at` as completed (defensive); callers should keep both aligned.
 * - **Payout persist** uses {@link evaluatePersistCleanerPayoutEligibility} inside `persistCleanerPayoutIfUnset` (completed vs documented pre-completion assignment basis).
 * - **Review / follow-up**: `evaluateCustomerReviewPromptEligibility` in `lib/reviews/customerReviewFollowUpContract.ts` aligns prompts with authoritative completion.
 *
 * @module bookingCompletionIntegrity
 */

function norm(s: string | null | undefined): string {
  return String(s ?? "")
    .trim()
    .toLowerCase();
}

function trimId(v: unknown): string | null {
  const s = v == null ? "" : String(v).trim();
  return s || null;
}

const DISPATCH_FUNNEL_ACTIVE = new Set(["searching", "offered"]);

export type BookingCompletionIntegrityIssue = {
  code: string;
  severity: "error" | "warn";
  detail: string;
};

/** Patch keys to merge into `bookings.update` when moving a row to completed. */
export type CompletionCoherencePatchResult = {
  patch: Record<string, unknown>;
  /** When true, any revert of a failed first-time completion must restore prior `dispatch_status`. */
  dispatchStatusNormalized: boolean;
};

/**
 * Fields applied atomically with `status: "completed"` so timestamps and dispatch funnel stay consistent.
 *
 * @param fillCompletedAtIfMissing — Admin/cron: true. Cleaner: false (row always gets explicit `completed_at: now`).
 */
export function buildCompletionCoherencePatch(opts: {
  beforeCompletedAt?: string | null;
  beforeDispatchStatus?: string | null;
  fillCompletedAtIfMissing: boolean;
  nowIso?: string;
}): CompletionCoherencePatchResult {
  const nowIso = opts.nowIso ?? new Date().toISOString();
  const patch: Record<string, unknown> = {};
  let dispatchStatusNormalized = false;

  if (opts.fillCompletedAtIfMissing) {
    const existing = opts.beforeCompletedAt != null && String(opts.beforeCompletedAt).trim() !== "";
    if (!existing) {
      patch.completed_at = nowIso;
    }
  }

  const ds = norm(opts.beforeDispatchStatus);
  if (DISPATCH_FUNNEL_ACTIVE.has(ds)) {
    patch.dispatch_status = "assigned";
    dispatchStatusNormalized = true;
  }

  return { patch, dispatchStatusNormalized };
}

/**
 * Gate for `POST /api/admin/bookings` monthly branch when `admin_mark_completed` is true.
 * Completed rows must have a solo cleaner or a validated team job ({@link listBookingCompletionConsistencyIssues}).
 */
export function validateAdminMonthlyCompletedAssignee(input: {
  selectedCleanerId: string | null | undefined;
  isTeamJobFlag: boolean;
  validatedTeamId: string | null | undefined;
}): { ok: true } | { ok: false; message: string; code: string } {
  const cleaner =
    input.selectedCleanerId != null && String(input.selectedCleanerId).trim()
      ? String(input.selectedCleanerId).trim()
      : null;
  if (cleaner) return { ok: true };
  const tid =
    input.validatedTeamId != null && String(input.validatedTeamId).trim()
      ? String(input.validatedTeamId).trim()
      : null;
  if (input.isTeamJobFlag && tid) return { ok: true };
  return {
    ok: false,
    code: "admin_monthly_completed_requires_assignee",
    message:
      "admin_mark_completed requires selected_cleaner_id, or is_team_job=true with a valid team_id.",
  };
}

/** Read-only diagnostics for support / drift detection (does not mutate). */
export function listBookingCompletionConsistencyIssues(row: Record<string, unknown>): BookingCompletionIntegrityIssue[] {
  const issues: BookingCompletionIntegrityIssue[] = [];
  const st = norm(row.status as string | null | undefined);
  const completedAt = String(row.completed_at ?? "").trim();
  const markedCompleted = st === "completed" || Boolean(completedAt);

  if (st === "completed" && !completedAt) {
    issues.push({
      code: "completed_status_missing_completed_at",
      severity: "warn",
      detail: "`status` is completed but `completed_at` is empty — dashboards and payouts may disagree.",
    });
  }

  if (completedAt && st !== "completed") {
    issues.push({
      code: "completed_at_with_non_completed_status",
      severity: "warn",
      detail: `completed_at is set but status=${st || "(empty)"}; operational phase still treats row as completed.`,
    });
  }

  if (markedCompleted) {
    const ds = norm(row.dispatch_status as string | null | undefined);
    if (DISPATCH_FUNNEL_ACTIVE.has(ds)) {
      issues.push({
        code: "completed_with_active_dispatch_funnel",
        severity: "warn",
        detail: `dispatch_status=${ds} after completion — funnel should be cleared or assigned.`,
      });
    }

    const cleanerId = trimId(row.cleaner_id);
    const teamId = trimId(row.team_id);
    const isTeam = row.is_team_job === true;
    if (!cleanerId && !(isTeam && teamId)) {
      issues.push({
        code: "completed_without_assignee",
        severity: "error",
        detail: "Completed booking has no cleaner_id and no team job (is_team_job + team_id).",
      });
    }

    if (isTeam && teamId && !trimId(row.payout_owner_cleaner_id)) {
      issues.push({
        code: "completed_team_missing_payout_owner",
        severity: "warn",
        detail: "Team completed job missing payout_owner_cleaner_id — payout rails may be ambiguous.",
      });
    }

    if (markedCompleted && st === "pending_assignment") {
      issues.push({
        code: "completed_timestamp_pending_assignment_status",
        severity: "error",
        detail: "status=pending_assignment contradicts completed job (`completed_at` or completed-derived phase).",
      });
    }
  }

  return issues;
}
