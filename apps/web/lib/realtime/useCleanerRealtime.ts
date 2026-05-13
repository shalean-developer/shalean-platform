"use client";

/**
 * Supabase Realtime for cleaner-scoped rows. Triggers **API refetch** callbacks only — never apply
 * partial `payload.new` to React state (Realtime payloads are not a full row contract).
 *
 * Replication: enable `bookings`, `booking_cleaners`, `dispatch_offers`,
 * `cleaner_change_requests`, `cleaner_locations`, `cleaner_availability`
 * under Database → Replication in Supabase, and ensure RLS allows `select`
 * for the authenticated cleaner.
 *
 * M-10: `dispatch_offers` is now a first-class subscription in the shared
 * plan (see {@link buildCleanerRealtimeSubscriptionPlan}) — consumers that
 * pass `onOffersChange` get INSERT/UPDATE/DELETE events for their offer rows
 * directly, instead of inferring offer state from second-hand
 * `bookings.cleaner_id` writes. New offers appear immediately,
 * accepted/declined/expired offers drop off, and duplicate Realtime events
 * are coalesced by the per-bumper debounce so a refetch fires once per
 * burst (the API is the de-dup point, not the channel — same contract that
 * the bookings/work bumpers have always used).
 */

import { useEffect, useRef, type MutableRefObject } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import {
  buildCleanerRealtimeSubscriptionPlan,
  type CleanerRealtimePlanInputs,
} from "@/lib/realtime/cleanerRealtimeSubscriptionPlan";

const EMPTY_WORKSPACE_TEAMS: readonly string[] = [];

export type UseCleanerRealtimeOptions = {
  cleanerId: string | null | undefined;
  /** Default 300ms — coalesces bursty writes. */
  debounceMs?: number;
  /** Listen to `bookings` where `cleaner_id` matches. Default true. */
  subscribeBookings?: boolean;
  /**
   * When true, also listen to `bookings` via `payout_owner_cleaner_id`, `team_id` (for each entry in `workspaceTeamIds`),
   * and `booking_cleaners` — same triggers as `useCleanerDashboardData`. Pass `cleaners.id` from `/api/cleaner/me`, not the Supabase auth user id (they can differ when the row uses `auth_user_id`).
   */
  workspaceBookingsRealtime?: boolean;
  /** Team ids for this cleaner (from `/api/cleaner/me`). Ignored unless `workspaceBookingsRealtime` is true. */
  workspaceTeamIds?: readonly string[];
  /** Listen to work-settings sources for this cleaner. Default true. */
  subscribeWorkSettings?: boolean;
  /**
   * M-10: listen to `dispatch_offers` where `cleaner_id` matches. Default
   * true (so existing consumers that pass `onOffersChange` opt in
   * automatically). Subscription is only registered when both this flag
   * resolves true AND a non-null `onOffersChange` callback is provided —
   * symmetric with the existing booking/work gating.
   */
  subscribeOffers?: boolean;
  onBookingChange?: () => void;
  onWorkSettingsChange?: () => void;
  /**
   * M-10: invoked (debounced by {@link debounceMs}) on any
   * `dispatch_offers` INSERT/UPDATE/DELETE for this cleaner. Treat as a
   * "go refetch your offers list" trigger — never apply partial `payload.new`
   * directly (Realtime payloads are not a full-row contract; the API
   * response is the canonical de-dup + visibility filter).
   */
  onOffersChange?: () => void;
};

function scheduleDebounced(timerRef: MutableRefObject<number | null>, ms: number, run: () => void) {
  if (timerRef.current != null) window.clearTimeout(timerRef.current);
  timerRef.current = window.setTimeout(() => {
    timerRef.current = null;
    run();
  }, ms);
}

export function useCleanerRealtime(opts: UseCleanerRealtimeOptions): void {
  const debounceMs = opts.debounceMs ?? 300;
  const subscribeBookings = opts.subscribeBookings !== false;
  const workspaceBookings = opts.workspaceBookingsRealtime === true;
  const workspaceTeamIds = opts.workspaceTeamIds ?? EMPTY_WORKSPACE_TEAMS;
  const subscribeWorkSettings = opts.subscribeWorkSettings !== false;
  const subscribeOffers = opts.subscribeOffers !== false;

  const onBookingRef = useRef(opts.onBookingChange);
  const onWorkRef = useRef(opts.onWorkSettingsChange);
  const onOffersRef = useRef(opts.onOffersChange);
  onBookingRef.current = opts.onBookingChange;
  onWorkRef.current = opts.onWorkSettingsChange;
  onOffersRef.current = opts.onOffersChange;

  const bookingTimerRef = useRef<number | null>(null);
  const workTimerRef = useRef<number | null>(null);
  const offersTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const id = opts.cleanerId?.trim();
    if (!id) return;
    const sb = getSupabaseBrowser();
    if (!sb) return;

    let cancelled = false;
    let channel: ReturnType<typeof sb.channel> | null = null;

    const bumpBookings = () => {
      if (!onBookingRef.current) return;
      scheduleDebounced(bookingTimerRef, debounceMs, () => onBookingRef.current?.());
    };
    const bumpWork = () => {
      if (!onWorkRef.current) return;
      scheduleDebounced(workTimerRef, debounceMs, () => onWorkRef.current?.());
    };
    const bumpOffers = () => {
      if (!onOffersRef.current) return;
      scheduleDebounced(offersTimerRef, debounceMs, () => onOffersRef.current?.());
    };

    void sb.auth.getSession().then(({ data: { session } }) => {
      if (cancelled || !session?.user) return;

      const listenBookings = subscribeBookings && !!onBookingRef.current;
      const listenWork = subscribeWorkSettings && !!onWorkRef.current;
      const listenOffers = subscribeOffers && !!onOffersRef.current;
      if (!listenBookings && !listenWork && !listenOffers) return;

      // M-10: extend the channel-name suffix so consumers with different
      // surface combos don't collide on the same multiplexed channel
      // (was previously only `-ws`). Different combos → different channel
      // names so the realtime broker treats them independently.
      const suffix = `${workspaceBookings ? "-ws" : ""}${listenOffers ? "-of" : ""}`;
      const ch = sb.channel(`cleaner-realtime-v1-${id}${suffix}`);

      const planInputs: CleanerRealtimePlanInputs = {
        cleanerId: id,
        workspaceTeamIds,
        subscribeBookings: listenBookings,
        workspaceBookings: listenBookings && workspaceBookings,
        subscribeWorkSettings: listenWork,
        subscribeOffers: listenOffers,
        bumpBookings,
        bumpWork,
        bumpOffers,
      };

      for (const sub of buildCleanerRealtimeSubscriptionPlan(planInputs)) {
        ch.on(
          "postgres_changes",
          { event: "*", schema: "public", table: sub.table, filter: sub.filter },
          sub.handler,
        );
      }
      channel = ch;
      ch.subscribe();
    });

    return () => {
      cancelled = true;
      if (bookingTimerRef.current != null) {
        window.clearTimeout(bookingTimerRef.current);
        bookingTimerRef.current = null;
      }
      if (workTimerRef.current != null) {
        window.clearTimeout(workTimerRef.current);
        workTimerRef.current = null;
      }
      if (offersTimerRef.current != null) {
        window.clearTimeout(offersTimerRef.current);
        offersTimerRef.current = null;
      }
      if (channel) void sb.removeChannel(channel);
    };
  }, [
    opts.cleanerId,
    debounceMs,
    subscribeBookings,
    subscribeWorkSettings,
    subscribeOffers,
    workspaceBookings,
    workspaceTeamIds,
  ]);
}
