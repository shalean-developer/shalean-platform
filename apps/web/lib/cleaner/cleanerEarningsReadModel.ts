/**
 * Earnings read model (authoritative layering):
 *
 * - **`cleaner_earnings` ledger** (and related payout run tables) are the **source of truth** for settled / paid history.
 * - **`bookings` payout columns** (`display_earnings_cents`, `cleaner_earnings_total_cents`, `payout_frozen_cents`, …)
 *   are the **per-job snapshot** written at completion and used for fast cleaner job lists / dashboard cards.
 *
 * Cleaner job APIs intentionally hydrate from **booking snapshots** for latency; reconciliation jobs should compare
 * ledger vs booking when investigating drift.
 */

export const CLEANER_EARNINGS_READ_MODEL_VERSION = 1;
