/**
 * ## Parallel booking creation paths — audit snapshot (read-only)
 *
 * **Purpose:** Single map of every **application** path that inserts a `bookings` row (or equivalent Paystack pending row),
 * so stabilization work can compare defaults against {@link bookingLifecycleContract}, {@link dashboardVisibilityContract},
 * {@link assignmentLifecycleContract}, {@link bookingCompletionIntegrity}, `bookingPayoutPersistEligibility.ts`,
 * and {@link paystackRouteResponsibilityContract}.
 *
 * Database triggers may attach `monthly_invoice_id`, payment flags, etc. after insert — those are **not** duplicated here.
 *
 * ---
 *
 * ### Path → defaults (authoritative columns at insert time unless noted)
 *
 * **1. Customer Paystack — pending row** — {@link insertPendingPaymentBookingRow}
 * - `status`: `pending_payment`
 * - `dispatch_status`: `searching`
 * - `amount_paid_cents`: `0`
 * - `user_id`: `null` (may be filled later via `updatePendingPaymentBookingForInit` / triggers)
 * - `customer_email`: normalized from checkout
 * - `selected_cleaner_id` / `cleaner_id`: unset at minimal insert; init update may set `selected_cleaner_id` + `assignment_type` for admin/user-selected checkout
 * - `payment_status` / `payment_completed_at`: unset at minimal insert
 * - Snapshots: `booking_snapshot` minimal; `price_snapshot` provisional from lock
 *
 * **2. Customer Paystack — paid finalize** — {@link upsertBookingFromPaystack} (after webhook/verify)
 * - `status`: `pending` **or** `pending_assignment` when user-selected cleaner honored (no `cleaner_id` until accept per constraints)
 * - `dispatch_status`: `searching` at patch baseline; auto-assign branch can move toward assigned flows via embedded assignment patch
 * - `payment_completed_at`: set; amounts from Paystack
 * - `user_id` / `customer_*`: from snapshot + metadata resolution
 * - `assignment_type` / `fallback_reason` / `attempted_cleaner_id`: from checkout cleaner resolution
 * - `price_snapshot` / `booking_snapshot`: full checkout snapshot
 *
 * **3. Admin — monthly** — `POST /api/admin/bookings` + {@link insertBookingRowUnified} (`source: admin_monthly`)
 * - `status`: `pending` \| `assigned` \| `completed` (`admin_mark_completed`, `selectedCleanerId`)
 * - `dispatch_status`: `assigned` if cleaner chosen else `searching`
 * - With cleaner: `cleaner_id` = `selected_cleaner_id`, `assignment_type`: `user_selected`, **skips** dispatch-offer funnel (product shortcut vs Paystack user-selected)
 * - `admin_mark_completed` without cleaner: requires `is_team_job` + active `team_id` + roster-derived `payout_owner_cleaner_id` (DB invariant); merges {@link buildCompletionCoherencePatch}
 * - `amount_paid_cents` / totals from admin quote; invoice attachment via DB triggers
 *
 * **3b. Admin — payment already received** — same route + {@link insertBookingRowUnified} (`source: admin_payment_already_received`)
 * then {@link settleAdminBookingPaymentAlreadyReceived} (`adminMarkBookingPaidOperation` + awaited invoice sync + `payment_confirmed` email)
 * - No Paystack link / recovery / unpaid invoice email
 * - `status`: `pending` \| `assigned`; `payment_status` starts `pending`, then `success` after settlement
 * - `billing_type`: `per_booking`; `is_monthly_billing_booking`: false
 * - Synthetic ref `adm_ar_<uuid>` (preserved on mark-paid per M-2)
 *
 * **4. Admin — per-booking Paystack link** — same route → {@link processPaystackInitializeBody} (pending row + link), not a second insert shape beyond (1)+(init update).
 *
 * **5. Dashboard monthly self-service** — `POST /api/dashboard/bookings` + {@link insertBookingRowUnified} (`dashboard_monthly`)
 * - `status`: `pending`; `dispatch_status`: `searching`
 * - `user_id`: auth user; `amount_paid_cents`: `0`; monthly bundle line items
 * - Customer-visible (`pending`, not `pending_payment`) per dashboard visibility contract
 *
 * **6. Recurring cron — pay-per occurrence** — {@link insertRecurringOccurrenceBooking}
 * - `status`: `pending_payment`; `dispatch_status`: `searching`
 * - `payment_status`: `pending`; `is_recurring_generated`: `true`; `user_id`: plan customer
 * - Cleaner list visibility: recurring `pending_payment` allowed; customer API hides `pending_payment`
 *
 * **7. Recurring cron — monthly fixed-schedule occurrence** — {@link insertMonthlyRecurringOccurrenceBooking}
 * - `status`: `pending` (**not** `pending_payment`)
 * - `payment_status`: `pending_monthly`; `is_monthly_billing_booking`: `true`; `billing_type`: `recurring_invoice`
 * - Operational phase derives as normal `pending`, not `pending_payment_recurring` (different from weekly unpaid row)
 *
 * **8. Homepage widget draft row** — `POST /api/booking/widget-draft` → {@link insertWidgetDraftBookingRow} (`homepage_widget`)
 * - `status`: `pending`; `dispatch_status`: `searching`
 * - `service_slug`: normalized widget service key (`adminBookingServiceSlug`, same convention as Paystack pending inserts)
 * - `user_id`: set when the caller sends a valid Bearer session (same verification as `/api/customer/bookings`)
 * - `customer_email`: normalized when present — verified auth email wins when authenticated; otherwise optional body `customer_email` / `email` for guests (never derives `user_id` from email alone)
 * - Anonymous guest draft (no email) remains allowed when the client omits contact fields; dashboard visibility stays email-orphan until a later rescue/handoff attaches identity
 *
 * **9. Dispatch load-test seed** — `POST /api/test/create-booking` (`dispatch_load_test`)
 * - Default `status`: `pending`; optional `linkUserId` / `customer_email` (Gap 4 Playwright) mirror production linkage for `/api/customer/bookings`
 * - Optional `dispatchVariant`: `user_selected_offer` → `pending_assignment` + `assignment_type` `user_selected` + one `createDispatchOfferRow` (no smart-assign pool); otherwise runs `ensureBookingAssignment`
 *
 * **10. Manual / admin mark-paid** — {@link adminMarkBookingPaid} and related: **updates** existing rows, not a creation path.
 *
 * ---
 *
 * ### Known drifts (documented; fix in a later slice unless trivial)
 *
 * - **Admin monthly `admin_mark_completed`:** API requires {@link validateAdminMonthlyCompletedAssignee} (`selected_cleaner_id` or `is_team_job` + valid `team_id`); insert merges {@link buildCompletionCoherencePatch} so completed rows do not keep `dispatch_status` in `searching`/`offered`.
 * - **Admin monthly with cleaner:** immediate `assigned` + `cleaner_id` differs from Paystack **user_selected** path (`pending_assignment` + offers) — intentional admin shortcut; dashboards should treat both as “has assignee” once columns agree.
 * - **Widget draft without `/api/booking/widget-draft`:** older clients that only hydrate `/booking` from localStorage never insert server-side; Paystack pending rows may still have `user_id` null until init metadata resolution — unchanged.
 *
 * @module bookingCreationPathsAudit
 */

export {};
