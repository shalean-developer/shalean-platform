/**
 * ## Dashboard visibility contract (read-only documentation + helpers)
 *
 * These helpers **explain** the same rules implemented in API routes; they do not grant access or query the DB.
 *
 * ---
 * ### Shared reference table
 *
 * | Situation | Payment / booking status | Assignment (informative) | Customer visible? | Cleaner jobs/dashboard? | Admin list (default GET)? |
 * |-----------|--------------------------|---------------------------|-----------------|-------------------------|---------------------------|
 * | Unpaid checkout | `pending_payment` | any | **Yes** if ownership OK; shown as awaiting payment | **No** (except recurring/invoice exception below) | **Yes** (in broad fetch) |
 * | Unpaid recurring / invoice-backed | `pending_payment` + recurring signals | assigned/roster paths | **Yes** if ownership OK | **Yes** if row merged via assignee/team/roster + {@link cleanerJobsListRowPostFilter} | **Yes** |
 * | Paid dispatchable | `pending`, `pending_assignment`, `offered`, … | unassigned → assigned | **Yes** if ownership OK | **Yes** only if cleaner is assignee, payout owner, team member, or **roster** + post-filter | **Yes** |
 * | Assigned active | `assigned`, `in_progress` | `cleaner_id` / team | **Yes** if ownership | **Yes** for linked cleaner(s) | **Yes** |
 * | Completed history | `completed` | any | **Yes** if ownership | **Yes** if still linked (history) | **Yes** — field coherence: {@link buildCompletionCoherencePatch} |
 * | Cancelled / failed | `cancelled`, `failed`, `payment_expired` | any | **Yes** except `payment_expired` hidden as terminal expiry | Cleaner lists hide `failed` / `payment_expired` | **Yes** |
 * | Dispatch offers API | — | pending offer for cleaner | N/A | **Yes**: `/api/cleaner/offers` pending, unexpired, visible_at passed; stale offers dropped if booking already assigned to viewer | N/A |
 *
 * **Customer ownership** ({@link customerCanAccessBookingRow}): `user_id === auth` OR (`user_id` null AND normalized `customer_email` matches viewer email). Another user’s `user_id` is never visible via email match.
 *
 * **Cleaner merged visibility** ({@link fetchCleanerVisibleBookingsMerged}): union of direct assignee / payout owner, team jobs on cleaner’s teams, and `booking_cleaners` roster IDs — then {@link cleanerJobsListRowPostFilter}.
 *
 * **Admin**: default query returns up to 4000 rows; `filter=sla` / `filter=follow-up` / `bookingStatus` **narrow** the server result set (rows outside filter are not returned — not a contradiction with customer/cleaner, different surface).
 *
 * ---
 * ### Known contradictions / limitations (explicit)
 *
 * 1. **Customer realtime** (`useBookings`): Supabase channel filters `user_id=eq.{uid}`. Email-orphan rows (`user_id` null) **do not** receive realtime events; they appear after full refetch only. **Homepage widget server draft** (`POST /api/booking/widget-draft`): authenticated callers should set `user_id` at insert so subscribed dashboards see the row without orphan rescue; guests still rely on `customer_email` match until they sign in and a safe handoff sets `user_id`.
 * 2. **Customer vs cleaner on `pending_payment`**: Customer APIs show customer-owned `pending_payment` bookings for payment recovery; cleaner lists still hide one-shot unpaid bookings unless recurring/invoice signals make them operationally valid.
 * 3. **Cleaner vs offers**: A cleaner may see a **dispatch offer** before the job appears on **jobs** list if booking isn’t merged yet — rare; offers route loads bookings by offer ids.
 * 4. **Admin SLA / follow-up filters**: Switching filters can hide rows that customer/cleaner still see — admin UI filter semantics, not RBAC contradiction.
 *
 * @module dashboardVisibilityContract
 */

import { customerCanAccessBookingRow, type BookingOwnershipProbe } from "@/lib/customer/customerBookingOwnership";
import { cleanerJobsListRowPostFilter } from "@/lib/cleaner/cleanerBookingAccess";

export type DashboardVisibilityExplanation = {
  visible: boolean;
  /** Stable machine-facing reason (logs, tests, support runbooks). */
  reason: string;
};

export type CustomerDashboardVisibilityRow = BookingOwnershipProbe & {
  status?: string | null;
};

/**
 * Mirrors {@link loadCustomerBookingRowsForUser} / {@link loadCustomerBookingRowForUser} visibility (status + ownership only).
 */
export function explainCustomerDashboardVisibility(
  row: CustomerDashboardVisibilityRow,
  authUserId: string,
  viewerEmailNormalized: string,
): DashboardVisibilityExplanation {
  const st = String(row.status ?? "").trim().toLowerCase();
  if (st === "payment_expired") {
    return { visible: false, reason: "customer_api_excludes_payment_expired_terminal" };
  }
  if (!customerCanAccessBookingRow(row, authUserId, viewerEmailNormalized)) {
    return { visible: false, reason: "customer_ownership_mismatch" };
  }
  if (st === "pending_payment") {
    return { visible: true, reason: "customer_owner_pending_payment_recovery" };
  }
  return { visible: true, reason: "customer_owner_or_verified_email_orphan" };
}

/**
 * Mirrors {@link cleanerJobsListRowPostFilter} only — does **not** assert roster/team/assignee merge (see module table).
 */
export function explainCleanerJobsListPostFilter(row: Record<string, unknown>): DashboardVisibilityExplanation {
  const ok = cleanerJobsListRowPostFilter(row);
  if (ok) {
    return { visible: true, reason: "cleaner_jobs_post_filter_passed" };
  }
  const st = String(row.status ?? "").trim().toLowerCase();
  if (st === "failed" || st === "payment_expired") {
    return { visible: false, reason: "cleaner_list_hides_failed_and_payment_expired" };
  }
  if (st === "pending_payment") {
    return { visible: false, reason: "cleaner_hides_one_shot_pending_payment_or_missing_recurring_signals" };
  }
  return { visible: false, reason: "cleaner_jobs_post_filter_rejected" };
}

export type AdminBookingsRouteFilterParams = {
  filter: string;
  bookingStatus: string | null | undefined;
  recurringScoped: boolean;
};

/** How GET `/api/admin/bookings` scopes rows before the client applies tabs/ops filters. */
export type AdminBookingsRouteScopeMode =
  | { scope: "broad_recent"; detail: string }
  | { scope: "server_narrowed"; detail: string };

/**
 * Documents when GET `/api/admin/bookings` **narrows** the SQL result set (absent rows are filter semantics, not RBAC denial).
 */
export function describeAdminBookingsRouteScope(params: AdminBookingsRouteFilterParams): AdminBookingsRouteScopeMode {
  const { filter, bookingStatus, recurringScoped } = params;
  const f = filter.trim().toLowerCase();
  if (!recurringScoped && f === "sla") {
    return {
      scope: "server_narrowed",
      detail: "pending + no cleaner_id + dispatch_status in (searching, offered), cap 800",
    };
  }
  if (!recurringScoped && f === "follow-up") {
    return {
      scope: "server_narrowed",
      detail: "payment_needs_follow_up = true, cap 2000",
    };
  }
  const bs = String(bookingStatus ?? "").trim().toLowerCase();
  if (bs && bs !== "all") {
    return { scope: "server_narrowed", detail: `status eq ${bs}` };
  }
  return { scope: "broad_recent", detail: "recent bookings ordered by created_at, cap 4000 (plus city/date/recurring filters when set)" };
}
