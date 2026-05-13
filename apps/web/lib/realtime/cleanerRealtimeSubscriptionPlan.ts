/**
 * Pure subscription plan for {@link useCleanerRealtime}. Extracted as a
 * standalone module so M-10 can verify the table/filter contract without a
 * React/DOM harness (vitest runs in `node` environment — see `vitest.config.ts`).
 *
 * The plan is the **single source of truth** for which `postgres_changes`
 * subscriptions a cleaner-scoped channel should register. The hook walks the
 * returned array and calls `channel.on("postgres_changes", { ... }, handler)`
 * for each entry. This eliminates ad-hoc table lists drifting between the
 * hook body and downstream consumers.
 *
 * M-10: `dispatch_offers cleaner_id=eq.<id>` is now part of the shared plan
 * so every consumer of {@link useCleanerRealtime} that opts in receives offer
 * INSERT/UPDATE/DELETE events directly — closing the gap where
 * `app/cleaner/jobs/{,[id]/}page.tsx` only ever saw offer-driven booking
 * changes second-hand via `bookings.cleaner_id` writes.
 */

export type CleanerRealtimeSubscriptionKey =
  | "bookings_cleaner_id"
  | "bookings_payout_owner_cleaner_id"
  | `bookings_team_id:${string}`
  | "booking_cleaners_cleaner_id"
  | "dispatch_offers_cleaner_id"
  | "cleaner_change_requests"
  | "cleaner_locations"
  | "cleaner_availability";

export type CleanerRealtimeSubscriptionConfig = {
  /** Stable identifier — used by tests + diagnostics, never sent to the wire. */
  key: CleanerRealtimeSubscriptionKey;
  /** Postgres table name in the `public` schema. */
  table: string;
  /** PostgREST-style filter expression (e.g. `cleaner_id=eq.<uuid>`). */
  filter: string;
  /** Invoked on any INSERT/UPDATE/DELETE matching {@link filter}. */
  handler: () => void;
};

export type CleanerRealtimePlanInputs = {
  /** Always `cleaners.id` from `/api/cleaner/me`, NOT `auth.uid()`. */
  cleanerId: string;
  /** Team ids for the cleaner — only used when `workspaceBookings` is true. */
  workspaceTeamIds: readonly string[];
  /** When false, no booking/offer-via-bookings subscriptions are added. */
  subscribeBookings: boolean;
  /**
   * When true, also subscribe `payout_owner_cleaner_id`, `team_id` (per id in
   * {@link workspaceTeamIds}), and `booking_cleaners` — matches the legacy
   * `useCleanerDashboardData` channel surface.
   */
  workspaceBookings: boolean;
  /** When false, no `cleaner_*` work-settings subscriptions are added. */
  subscribeWorkSettings: boolean;
  /**
   * M-10: when false, no `dispatch_offers cleaner_id` subscription is added.
   * Defaults true at the hook entry point but is also gated on the presence
   * of an `onOffersChange` callback — same gating pattern as bookings/work.
   */
  subscribeOffers: boolean;
  /** Bumped (debounced upstream) on any booking-table event. */
  bumpBookings: () => void;
  /** Bumped (debounced upstream) on any work-settings event. */
  bumpWork: () => void;
  /**
   * M-10: bumped (debounced upstream) on any `dispatch_offers` event for the
   * cleaner. Consumers should treat this as a "go refetch the offers list"
   * trigger, never as a partial-row payload — Realtime payloads are not a
   * full-row contract (same rule as the existing booking/work bumpers).
   */
  bumpOffers: () => void;
};

/**
 * Build the deterministic ordered list of `postgres_changes` subscriptions a
 * cleaner-scoped channel should register. Pure — no Supabase client, no
 * React, no timers — so it can be unit-tested cheaply.
 *
 * Empty `cleanerId` returns `[]` so callers can short-circuit before
 * acquiring a Supabase channel; the hook already does this guard.
 */
export function buildCleanerRealtimeSubscriptionPlan(
  inputs: CleanerRealtimePlanInputs,
): readonly CleanerRealtimeSubscriptionConfig[] {
  const id = inputs.cleanerId.trim();
  if (!id) return [];

  const plan: CleanerRealtimeSubscriptionConfig[] = [];

  if (inputs.subscribeBookings) {
    plan.push({
      key: "bookings_cleaner_id",
      table: "bookings",
      filter: `cleaner_id=eq.${id}`,
      handler: inputs.bumpBookings,
    });
    if (inputs.workspaceBookings) {
      plan.push({
        key: "bookings_payout_owner_cleaner_id",
        table: "bookings",
        filter: `payout_owner_cleaner_id=eq.${id}`,
        handler: inputs.bumpBookings,
      });
      for (const tidRaw of inputs.workspaceTeamIds) {
        const tid = String(tidRaw ?? "").trim();
        if (!tid) continue;
        plan.push({
          key: `bookings_team_id:${tid}`,
          table: "bookings",
          filter: `team_id=eq.${tid}`,
          handler: inputs.bumpBookings,
        });
      }
      plan.push({
        key: "booking_cleaners_cleaner_id",
        table: "booking_cleaners",
        filter: `cleaner_id=eq.${id}`,
        handler: inputs.bumpBookings,
      });
    }
  }

  // M-10: `dispatch_offers` is a first-class subscription in the shared plan.
  // It deliberately fires `bumpOffers` (not `bumpBookings`) so downstream
  // consumers can fan out to a separate `/api/cleaner/offers` refetcher
  // without dragging the heavier `/api/cleaner/dashboard` reload along on
  // every offer event. This is what makes new INSERTs surface immediately
  // and accepted/declined/expired UPDATEs disappear from the offer list
  // without polling. Independent of booking/work toggles so a consumer can
  // listen to ONLY offers if that's all it cares about.
  if (inputs.subscribeOffers) {
    plan.push({
      key: "dispatch_offers_cleaner_id",
      table: "dispatch_offers",
      filter: `cleaner_id=eq.${id}`,
      handler: inputs.bumpOffers,
    });
  }

  if (inputs.subscribeWorkSettings) {
    plan.push({
      key: "cleaner_change_requests",
      table: "cleaner_change_requests",
      filter: `cleaner_id=eq.${id}`,
      handler: inputs.bumpWork,
    });
    plan.push({
      key: "cleaner_locations",
      table: "cleaner_locations",
      filter: `cleaner_id=eq.${id}`,
      handler: inputs.bumpWork,
    });
    plan.push({
      key: "cleaner_availability",
      table: "cleaner_availability",
      filter: `cleaner_id=eq.${id}`,
      handler: inputs.bumpWork,
    });
  }

  return plan;
}
