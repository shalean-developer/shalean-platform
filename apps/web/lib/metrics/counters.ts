/**
 * Cheap counters for log drains (Datadog / Vercel / etc.). Extend with StatsD when needed.
 * Skipped in Vitest (`NODE_ENV === "test"`) to keep CI signal clean.
 *
 * --- Cleaner offer A/B: decision thresholds (lock before reading results) ---
 * - Primary win: `dispatch.kpi.time_to_accept_ms` p50/p90 down ≥ ~10% vs control (same cohort tags).
 * - Secondary win: accept rate up ≥ ~3–5% (same window).
 * - Guardrail: `dispatch.kpi.offers_per_booking` must not increase materially (no “speed up by spamming offers”).
 *
 * --- Cleaner offer A/B: pre-agreed KPIs ---
 * - Primary: lower `dispatch.kpi.time_to_accept_ms` (p50 / p90).
 * - Secondary: higher accept rate, lower `dispatch.kpi.offers_per_booking`.
 * - Funnel conversion (derive in BI / logs processor, do not emit as a single counter):
 *   `accepted_per_exposed = count(dispatch.offer.accepted) / count(dispatch.offer.exposed)` grouped by `ux_variant`
 *   (and by `attempt_bucket`, `time_window`, `location_zone`). Join accepted ↔ exposed rows on `offerId` (same
 *   `offer_id` on both events) so numerators/denominators line up; then group by `ux_variant` + cohort tags.
 *   Surfaces “faster accept but lower conversion”.
 * - Offer funnel events carry cohort cuts: `attempt_bucket`, `time_window` (peak vs off-peak, `DISPATCH_METRICS_TZ`),
 *   `location_zone` (coarse bucket from booking `location`).
 *
 * --- Exposure dedupe ---
 * - `POST .../offers/:id/exposed`: Redis `SET offer_exposed:<id> NX EX 300` when `UPSTASH_REDIS_REST_URL` +
 *   `UPSTASH_REDIS_REST_TOKEN` are set; else Postgres `dispatch_offer_exposure_dedupe` insert (PK per offer).
 *   Rows are pruned monthly via `public.prune_dispatch_offer_exposure_dedupe(30)` (pg_cron when extension exists).
 *   For long in-flight experiments, run manually with a larger window, e.g. `select public.prune_dispatch_offer_exposure_dedupe(90);`
 *   (cron still defaults to 30). Each run logs `deleted` + `retention_days` to `system_logs` (source
 *   `prune_dispatch_offer_exposure_dedupe`).
 *
 * --- Prune job monitoring (from `system_logs`, source `prune_dispatch_offer_exposure_dedupe`) ---
 * - Ready-made queries: `supabase/queries/prune_exposure_dedupe_monitoring.sql`.
 * - Read `context->>'deleted'` (integer) and `context->>'retention_days'` per run.
 * - **Stalled job:** `deleted = 0` for **≥ 2–3 consecutive** scheduled monthly runs *while* you expect dedupe churn
 *   (Postgres fallback in use) → check pg_cron, migration apply order, or errors on `system_logs`.
 * - **Spike / anomaly:** `deleted` jumps **far above** a rolling baseline (e.g. > p99 of prior 90d or **N×** median)
 *   → investigate exposure storms, retention override mistakes, or bulk replays.
 *
 * --- BI dashboard (minimal set to pick winners) ---
 * - Optional weekly KPI store: `public.dispatch_experiment_snapshots` (schema `20260514_dispatch_experiment_snapshots.sql`;
 *   filled by `public.refresh_dispatch_experiment_snapshots(date)` weekly pg_cron job `refresh-dispatch-experiment-snapshots`, migration `20260515_dispatch_experiment_snapshots_weekly_cron.sql`).
 * - `dispatch.kpi.time_to_accept_ms`: p50 / p90 / **p95** by `ux_variant` (+ optional: `attempt_bucket`, `time_window`,
 *   `location_zone`).
 * - Accept rate: `count(dispatch.offer.accepted) / count(dispatch.offer.exposed)` by `ux_variant` (join on `offerId`).
 * - `dispatch.kpi.offers_per_booking` by `ux_variant` (and cohort tags when slicing).
 *
 * --- Disciplined experiment order (high signal first) ---
 * - sound_on vs control; cta_v2 vs control; urgency threshold variants (e.g. 12s vs 18–20s) as separate cells.
 * - Decision: use the thresholds above (latency, accept rate, offers_per_booking guardrail).
 *
 * --- Future: tie wins into dispatch scoring (not implemented here) ---
 * - Example: score += w1 * fastAcceptRate(cleaner); score += w2 * acceptanceRate(cleaner); score -= w3 * timeoutRate(cleaner).
 *
 * --- Future (not implemented) ---
 * - Cross-service variant allocation: small RPC or `ux_variant` on `cleaners` if you need long-lived cohorts beyond
 *   hash(cleaner_id) in app code.
 * - **Experiment guardrail automation:** scheduled job or BI rule to flag `ux_variant` cells where
 *   `dispatch.kpi.offers_per_booking` rises vs control (guardrail breach) or `time_to_accept_ms` **p95** degrades vs
 *   prior week — reduces manual review as variant count grows.
 *
 * --- Dispatch queue / caps (`[metric]` JSON logs → wire to dashboards) ---
 * - `dispatch.retry_queue.assigned` — assign succeeded from `dispatch_retry_queue` (fields: `retriesDone`).
 * - `dispatch.stranded.enqueued` — batch from `enqueueStrandedBookings` (`count` = rows inserted this run).
 * - `dispatch.retry_queue.rescheduled` — failed wave rescheduled (`delaySec`, `retriesDone`).
 * - `dispatch.offer_cap_exceeded` — offer rows exceeded per-booking cap (`totalOffers`, `offerCap`).
 * - `dispatch.admin_terminal_reset` — admin reset terminal dispatch (`from` = prior `dispatch_status`).
 * - Accept latency: `dispatch.offer.accepted` already emits `latency_ms` (WhatsApp/SMS anchor vs accept).
 * - `dispatch.offer.sms_send_ok` / `dispatch.offer.sms_send_failed` — Twilio offer SMS outcome (`bookingId`, `offerId`, optional `phase`).
 * - `dispatch.offer.sms_tracked_link_click` — GET `/r/offer/:token` redirect before `/offer/:token` (SMS click funnel).
 *   Emitted at most once per token per 5-minute bucket (`notification_idempotency_claims` + `dispatch_offer_tracked_link_open`).
 * - `dispatch_offer_click_raw` — system_logs only: every tracked-link GET (UA + IP hash); not counted toward CTR.
 *
 * --- Suggested external alerts (wire in your log/metrics sink) ---
 * - `dispatch.lease.stolen` — spike rate vs 7d baseline (cron overlap / contention).
 * - `dispatch_status=failed` share of pending paid bookings — threshold on % or count.
 * - `dispatch.kpi.time_to_first_offer_ms` — p95 / p99 week-over-week regression.
 * - `dispatch.recovery.success_after_failure` — non-zero sustained = resilience working.
 * - Experiments: `dispatch.kpi.time_to_accept_ms` **p95 by `ux_variant`** (and optionally same cohort tags) — alert on
 *   regression vs prior-week baseline per variant when rolling UI changes.
 * - Prune: combine with "Prune job monitoring" above (stalled `deleted=0` vs spike alerts on `context.deleted`).
 */
export const metrics = {
  /**
   * Cleaner job issue reports (`POST /api/cleaner/jobs/:id/issue`):
   * - `cleaner_issue_report_created` — new row persisted
   * - `cleaner_issue_report_rate_limited` — 429 (5 reports / 10 min per booking+cleaner)
   * - `cleaner_issue_report_duplicate_ignored` — idempotency key replay or same reason within 2 min (fields: `kind`)
   *
   * Includes `legacy_cleaner_auth_used_count` (fields: `kind` = `x_cleaner_id_header` | `legacy_id_row_match`) for cutover tracking.
   * Cleaner lifecycle idempotency: `cleaner_job_lifecycle_idempotency_conflict` — duplicate idempotency key (derive conflict rate vs `job_action_attempted` in logs).
   * Cleaner session refresh (single-flight): `cleaner_auth_refresh_attempt` | `cleaner_auth_refresh_success` | `cleaner_auth_refresh_failure`.
   *
   * --- Payout / earnings integrity (JSON `[metric]` logs) ---
   * - `payout.invalid_paid_rows_count` — GET `/api/cleaner/earnings` exposed ≥1 invalid / integrity row (`rows` = count that request).
   * - `payout.stuck_earnings_triggered` — DB claimed a stuck-null earnings recompute slot (`recompute_source` =
   *   `jobs_list` | `job_detail`).
   * - `cleaner.earnings_fetch` — GET `/api/cleaner/earnings` completed; fields: `latency_ms`, `rows_count`,
   *   `earnings_chart_points_count` (7-day chart bucket count, always 7).
   * - `cleaner.earnings_negative_estimate_seen` — card row had `customer_paid_cents` strictly less than cleaner
   *   `amount_cents`;
   *   `platform_fee_cents` omitted (`null`); fields: `booking_id`, `customer_paid_cents`, `cleaner_amount_cents`.
   * - `cleaner.earnings_invariant_mismatch` — GET `/api/cleaner/earnings/reconcile` intersection drift (card vs
   *   `cleaner_earnings` for same booking ids); fields: `compared_bookings`, `intersection_booking_count`,
   *   `amount_mismatch_booking_count`, `missing_ledger_row_count`, `sum_card_intersection_cents`,
   *   `sum_ledger_intersection_cents`, `delta_intersection_cents`, `strict`.
   * - `cleaner.earnings_shadow_totals_mismatch` — GET `/api/cleaner/earnings` card slice vs ledger slice bucket/delta
   *   drift; fields: `booking_ids_in_slice`, `delta_all_cents`, `bucket_aligned`, `card_all_cents`, `ledger_all_cents`.
   * - `cleaner.earnings_missing_ledger_rows` — solo slice rows with finalized `cleaner_earnings_total_cents` but no
   *   `cleaner_earnings` row; fields: `count` (soft + hard).
   * - `cleaner.earnings_missing_ledger_rows_soft` — missing expected row, completion within async window (~12m);
   *   trend-only — **wire pages/alerts on `hard` only** (soft is normal async lag).
   * - `cleaner.earnings_missing_ledger_rows_hard` — missing expected row beyond soft window (**alert**).
   * - `cleaner.earnings_bucket_mapping_mismatch` — same `booking_id` in card + ledger but mapped status mismatch
   *   (e.g. card `eligible` vs ledger `pending`); fields: `count`.
   * - `cleaner.earnings_cutoff_assignment_mismatch` — (a) `kind: earnings_api_probe` — GET earnings cutoff probe
   *   global mismatch; (b) `kind: weekly_batch_per_booking` — weekly job:
   *   per candidate booking, UI payout Friday at completion vs batch pay Friday for that run (`count`, `period_*`).
   * - `cleaner.earnings_ledger_flip_ready` — GET earnings: `ready` 1/0 when shadow is safe to flip ledger totals
   *   (`shadow_mismatch`, hard missing, bucket map, `delta_all_cents` all clear); fields: `use_ledger_totals`.
   * - `cleaner.earnings_cutoff_edge_case` — weekly payout batch scan: completions within ±5m of Thu 23:59:59.999 SAST
   *   cutoff; fields: `count`, `period_start`, `period_end`, `source` (= `generateWeeklyPayouts`).
   * - `cleaner.earnings_payout_request_clicked` — client opened “Request payout” info (fields optional).
   * - `flush_cycle_metrics` logs (lifecycle telemetry): `flush_items_attempted`, `flush_items_succeeded`,
   *   `flush_items_failed`, `flush_items_deferred` — derive success rate and starvation vs timeout.
   * - `payout.stuck_earnings_recompute_skipped_cooldown` — skipped path; fields: `reason` = `cooldown` (includes
   *   **`next_allowed_at_utc`**) | `missing_booking` | `deleted_booking` (prefetch miss) |
   *   `deleted_booking_after_prefetch` (TOCTOU after prefetch) | `recent_success` (reserved); `recompute_source` as above.
   * - `payout.mark_paid_readback_failures` — read-back guard (`kind`, optional `error_id` `PP-…`).
   * Money-path correlation ids: **`PP-…`** (persist / mark-paid / earnings integrity logs), **`TA-…`** (team assignment).
   * Daily DB rollup (trends): POST `/api/cron/payout-integrity-daily` + `supabase/queries/payout_metrics_daily_monitoring.sql`.
   */
  increment(name: string, fields?: Record<string, unknown>): void {
    if (process.env.NODE_ENV === "test") return;
    try {
      console.info("[metric]", JSON.stringify({ name, ts: new Date().toISOString(), ...fields }));
    } catch {
      /* ignore */
    }
  },
};
