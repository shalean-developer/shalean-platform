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
 * - `dispatch.retry_queue.rescheduled` — failed wave rescheduled (`delaySec`, `retriesDone`).
 * - `dispatch.offer_cap_exceeded` — offer rows exceeded per-booking cap (`totalOffers`, `offerCap`).
 * - `dispatch.admin_terminal_reset` — admin reset terminal dispatch (`from` = prior `dispatch_status`).
 * - Accept latency: `dispatch.offer.accepted` already emits `latency_ms` (WhatsApp/SMS anchor vs accept).
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
  increment(name: string, fields?: Record<string, unknown>): void {
    if (process.env.NODE_ENV === "test") return;
    try {
      console.info("[metric]", JSON.stringify({ name, ts: new Date().toISOString(), ...fields }));
    } catch {
      /* ignore */
    }
  },
};
