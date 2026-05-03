"use client";

/**
 * Supabase Realtime for cleaner-scoped rows. Triggers **API refetch** callbacks only — never apply
 * partial `payload.new` to React state (Realtime payloads are not a full row contract).
 *
 * Replication: enable `bookings`, `cleaner_change_requests`, `cleaner_locations`, `cleaner_availability`
 * under Database → Replication in Supabase, and ensure RLS allows `select` for the authenticated cleaner.
 */

import { useEffect, useRef, type MutableRefObject } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

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
  onBookingChange?: () => void;
  onWorkSettingsChange?: () => void;
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

  const onBookingRef = useRef(opts.onBookingChange);
  const onWorkRef = useRef(opts.onWorkSettingsChange);
  onBookingRef.current = opts.onBookingChange;
  onWorkRef.current = opts.onWorkSettingsChange;

  const bookingTimerRef = useRef<number | null>(null);
  const workTimerRef = useRef<number | null>(null);

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

    void sb.auth.getSession().then(({ data: { session } }) => {
      if (cancelled || !session?.user) return;

      const listenBookings = subscribeBookings && !!onBookingRef.current;
      const listenWork = subscribeWorkSettings && !!onWorkRef.current;
      if (!listenBookings && !listenWork) return;

      const ch = sb.channel(`cleaner-realtime-v1-${id}${workspaceBookings ? "-ws" : ""}`);
      if (listenBookings) {
        ch.on("postgres_changes", { event: "*", schema: "public", table: "bookings", filter: `cleaner_id=eq.${id}` }, bumpBookings);
        if (workspaceBookings) {
          ch.on(
            "postgres_changes",
            { event: "*", schema: "public", table: "bookings", filter: `payout_owner_cleaner_id=eq.${id}` },
            bumpBookings,
          );
          for (const tid of workspaceTeamIds) {
            const t = String(tid ?? "").trim();
            if (!t) continue;
            ch.on("postgres_changes", { event: "*", schema: "public", table: "bookings", filter: `team_id=eq.${t}` }, bumpBookings);
          }
          ch.on(
            "postgres_changes",
            { event: "*", schema: "public", table: "booking_cleaners", filter: `cleaner_id=eq.${id}` },
            bumpBookings,
          );
        }
      }
      if (listenWork) {
        ch.on(
          "postgres_changes",
          { event: "*", schema: "public", table: "cleaner_change_requests", filter: `cleaner_id=eq.${id}` },
          bumpWork,
        );
        ch.on("postgres_changes", { event: "*", schema: "public", table: "cleaner_locations", filter: `cleaner_id=eq.${id}` }, bumpWork);
        ch.on(
          "postgres_changes",
          { event: "*", schema: "public", table: "cleaner_availability", filter: `cleaner_id=eq.${id}` },
          bumpWork,
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
      if (channel) void sb.removeChannel(channel);
    };
  }, [
    opts.cleanerId,
    debounceMs,
    subscribeBookings,
    subscribeWorkSettings,
    workspaceBookings,
    workspaceTeamIds,
  ]);
}
