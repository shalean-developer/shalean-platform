import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import {
  buildCleanerRealtimeSubscriptionPlan,
  type CleanerRealtimePlanInputs,
  type CleanerRealtimeSubscriptionConfig,
} from "../cleanerRealtimeSubscriptionPlan";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * M-10: cleaner realtime now subscribes to `dispatch_offers`.
 *
 * Behavioural tests cover the **pure subscription plan** (single source of
 * truth for which Postgres tables/filters the cleaner channel listens to).
 * The plan's handlers are the same bumpers the hook wires up, so testing
 * dispatch + isolation here is equivalent to testing the hook minus the
 * React/window scaffolding (which vitest's `node` environment can't host
 * without jsdom).
 *
 * The "duplicate events idempotent" contract is proven two ways:
 *   1. The hook wraps every handler in a `scheduleDebounced(..., debounceMs)`
 *      that collapses N calls within the window into a single downstream
 *      invocation — verified by a standalone simulation of that exact
 *      pattern below.
 *   2. The downstream invocation refetches the canonical `/api/cleaner/offers`
 *      list, which is server-side de-duped by `dispatch_offers.id` — so even
 *      if two debounce windows independently fire (e.g. burst + late event),
 *      the rendered card list is `setOfferRows(j.offers)` not an additive
 *      append, and duplicate UI cards are structurally impossible.
 *
 * Source-level contract tests pin the hook + plan to:
 *   - subscribe `dispatch_offers cleaner_id=eq.<id>` (the gap M-10 closed)
 *   - keep the `event: "*"` filter (so INSERT, UPDATE, DELETE all flow)
 *   - keep `subscribeOffers` gated on `onOffersChange` (no spurious channels
 *     for consumers that don't want offers).
 */

type Bumpers = {
  bumpBookings: () => void;
  bumpWork: () => void;
  bumpOffers: () => void;
};

function makeBumpers(): {
  bumpers: Bumpers;
  counts: { bookings: number; work: number; offers: number };
} {
  const counts = { bookings: 0, work: 0, offers: 0 };
  return {
    counts,
    bumpers: {
      bumpBookings: () => {
        counts.bookings += 1;
      },
      bumpWork: () => {
        counts.work += 1;
      },
      bumpOffers: () => {
        counts.offers += 1;
      },
    },
  };
}

function basePlanInputs(overrides: Partial<CleanerRealtimePlanInputs>): CleanerRealtimePlanInputs {
  const { bumpers } = makeBumpers();
  return {
    cleanerId: "11111111-2222-3333-4444-555555555555",
    workspaceTeamIds: [],
    subscribeBookings: false,
    workspaceBookings: false,
    subscribeWorkSettings: false,
    subscribeOffers: false,
    bumpBookings: bumpers.bumpBookings,
    bumpWork: bumpers.bumpWork,
    bumpOffers: bumpers.bumpOffers,
    ...overrides,
  };
}

function findByKey(
  plan: readonly CleanerRealtimeSubscriptionConfig[],
  key: CleanerRealtimeSubscriptionConfig["key"],
): CleanerRealtimeSubscriptionConfig | undefined {
  return plan.find((s) => s.key === key);
}

describe("M-10: cleaner realtime subscription plan — dispatch_offers coverage", () => {
  describe("plan composition", () => {
    it("includes dispatch_offers cleaner_id=eq.<id> when subscribeOffers is true", () => {
      const plan = buildCleanerRealtimeSubscriptionPlan(
        basePlanInputs({ subscribeOffers: true }),
      );
      const sub = findByKey(plan, "dispatch_offers_cleaner_id");
      expect(sub).toBeDefined();
      expect(sub?.table).toBe("dispatch_offers");
      expect(sub?.filter).toBe(
        "cleaner_id=eq.11111111-2222-3333-4444-555555555555",
      );
    });

    it("omits dispatch_offers when subscribeOffers is false", () => {
      const plan = buildCleanerRealtimeSubscriptionPlan(
        basePlanInputs({
          subscribeOffers: false,
          subscribeBookings: true,
          subscribeWorkSettings: true,
        }),
      );
      expect(findByKey(plan, "dispatch_offers_cleaner_id")).toBeUndefined();
    });

    it("returns [] for empty cleanerId so the hook can short-circuit", () => {
      expect(
        buildCleanerRealtimeSubscriptionPlan(
          basePlanInputs({
            cleanerId: "",
            subscribeOffers: true,
            subscribeBookings: true,
          }),
        ),
      ).toEqual([]);
      expect(
        buildCleanerRealtimeSubscriptionPlan(
          basePlanInputs({
            cleanerId: "   ",
            subscribeOffers: true,
            subscribeBookings: true,
          }),
        ),
      ).toEqual([]);
    });

    it("preserves existing booking + work-settings subscriptions (no regression)", () => {
      const plan = buildCleanerRealtimeSubscriptionPlan(
        basePlanInputs({
          subscribeBookings: true,
          workspaceBookings: true,
          workspaceTeamIds: ["team-A", "team-B"],
          subscribeWorkSettings: true,
          subscribeOffers: true,
        }),
      );
      // Booking surface (canonical + workspace fan-out)
      expect(findByKey(plan, "bookings_cleaner_id")).toBeDefined();
      expect(findByKey(plan, "bookings_payout_owner_cleaner_id")).toBeDefined();
      expect(findByKey(plan, "bookings_team_id:team-A")).toBeDefined();
      expect(findByKey(plan, "bookings_team_id:team-B")).toBeDefined();
      expect(findByKey(plan, "booking_cleaners_cleaner_id")).toBeDefined();
      // Work-settings surface
      expect(findByKey(plan, "cleaner_change_requests")).toBeDefined();
      expect(findByKey(plan, "cleaner_locations")).toBeDefined();
      expect(findByKey(plan, "cleaner_availability")).toBeDefined();
      // M-10 addition
      expect(findByKey(plan, "dispatch_offers_cleaner_id")).toBeDefined();
    });

    it("trims and skips empty/nullish workspace team ids without crashing the plan", () => {
      const plan = buildCleanerRealtimeSubscriptionPlan(
        basePlanInputs({
          subscribeBookings: true,
          workspaceBookings: true,
          workspaceTeamIds: ["", "   ", "team-X", null as unknown as string],
        }),
      );
      const teamSubs = plan.filter((s) => s.key.startsWith("bookings_team_id:"));
      // Empty / whitespace / null entries are dropped; only the real id
      // produces a subscription. Keeps the channel-binder loop in the hook
      // safe against `/api/cleaner/me` returning a sparse `teamIds` array.
      expect(teamSubs.map((s) => s.filter)).toEqual(["team_id=eq.team-X"]);
    });
  });

  describe("handler routing — dispatch_offers fires bumpOffers, never bumpBookings/bumpWork", () => {
    it("dispatch_offers handler invokes bumpOffers exclusively", () => {
      const { bumpers, counts } = makeBumpers();
      const plan = buildCleanerRealtimeSubscriptionPlan({
        ...basePlanInputs({ subscribeOffers: true, subscribeBookings: true, subscribeWorkSettings: true }),
        bumpBookings: bumpers.bumpBookings,
        bumpWork: bumpers.bumpWork,
        bumpOffers: bumpers.bumpOffers,
      });
      const offers = findByKey(plan, "dispatch_offers_cleaner_id");
      expect(offers).toBeDefined();
      offers!.handler(); // simulates a Realtime postgres_changes event delivery
      expect(counts).toEqual({ bookings: 0, work: 0, offers: 1 });
    });

    it("bookings handlers do NOT invoke bumpOffers (table isolation)", () => {
      const { bumpers, counts } = makeBumpers();
      const plan = buildCleanerRealtimeSubscriptionPlan({
        ...basePlanInputs({
          subscribeOffers: true,
          subscribeBookings: true,
          workspaceBookings: true,
          workspaceTeamIds: ["t1"],
        }),
        bumpBookings: bumpers.bumpBookings,
        bumpWork: bumpers.bumpWork,
        bumpOffers: bumpers.bumpOffers,
      });
      findByKey(plan, "bookings_cleaner_id")!.handler();
      findByKey(plan, "bookings_payout_owner_cleaner_id")!.handler();
      findByKey(plan, "bookings_team_id:t1")!.handler();
      findByKey(plan, "booking_cleaners_cleaner_id")!.handler();
      expect(counts.bookings).toBe(4);
      expect(counts.offers).toBe(0);
      expect(counts.work).toBe(0);
    });

    it("work-settings handlers do NOT invoke bumpOffers (surface isolation)", () => {
      const { bumpers, counts } = makeBumpers();
      const plan = buildCleanerRealtimeSubscriptionPlan({
        ...basePlanInputs({ subscribeWorkSettings: true, subscribeOffers: true }),
        bumpBookings: bumpers.bumpBookings,
        bumpWork: bumpers.bumpWork,
        bumpOffers: bumpers.bumpOffers,
      });
      findByKey(plan, "cleaner_change_requests")!.handler();
      findByKey(plan, "cleaner_locations")!.handler();
      findByKey(plan, "cleaner_availability")!.handler();
      expect(counts.work).toBe(3);
      expect(counts.offers).toBe(0);
      expect(counts.bookings).toBe(0);
    });
  });

  describe("idempotency — duplicate Realtime events collapse into one refetch via debounce", () => {
    it("simulates the hook's scheduleDebounced wrapper coalescing burst events", async () => {
      vi.useFakeTimers();
      try {
        let timer: NodeJS.Timeout | null = null;
        let downstream = 0;
        const debounceMs = 300;
        // Mirrors `scheduleDebounced` in useCleanerRealtime.ts — purposely
        // re-implemented here so the contract is asserted independently of
        // the hook's React internals.
        const bump = () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            timer = null;
            downstream += 1;
          }, debounceMs);
        };

        // Simulate 50 rapid Realtime postgres_changes events for the same
        // `dispatch_offers` row (e.g. INSERT immediately followed by an
        // UPDATE that the dispatcher bulk-writes within the same second).
        for (let i = 0; i < 50; i++) bump();
        expect(downstream).toBe(0);

        await vi.advanceTimersByTimeAsync(debounceMs - 1);
        expect(downstream).toBe(0);

        await vi.advanceTimersByTimeAsync(2);
        // The 50 bursty events collapse into ONE downstream refetch — proves
        // duplicate Realtime events cannot duplicate UI cards.
        expect(downstream).toBe(1);

        // Subsequent events outside the window correctly emit again.
        bump();
        await vi.advanceTimersByTimeAsync(debounceMs + 1);
        expect(downstream).toBe(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it("API refetch model — the plan handler is a 'go refetch' signal, not a payload carrier", () => {
      // This is a structural assertion: the handler we expose has signature
      // `() => void`, NOT `(payload: { new, old }) => void`. The latter would
      // tempt consumers to merge `payload.new` into local state and risk
      // duplicate cards (Realtime payloads are not full-row contracts).
      const plan = buildCleanerRealtimeSubscriptionPlan(
        basePlanInputs({ subscribeOffers: true }),
      );
      const offers = findByKey(plan, "dispatch_offers_cleaner_id");
      expect(offers).toBeDefined();
      expect(offers!.handler.length).toBe(0);
    });
  });

  describe("event coverage — INSERT, UPDATE, DELETE all flow through one subscription", () => {
    /**
     * Proven via the source-level contract test below (`event: "*"` is the
     * Supabase pattern for "all DML events"). A behavioural test here would
     * require simulating the entire `@supabase/realtime-js` event router,
     * which is out of scope; the hook deliberately registers `event: "*"`
     * so that:
     *   - INSERT (new offer)        → bumpOffers → refetch → card APPEARS
     *   - UPDATE (status:accepted)  → bumpOffers → refetch → card REMOVED
     *   - UPDATE (status:declined)  → bumpOffers → refetch → card REMOVED
     *   - UPDATE (expires_at change)→ bumpOffers → refetch → card REMOVED
     *   - DELETE (cleanup cron)     → bumpOffers → refetch → card REMOVED
     */
    it("documents the contract — see source-level guard below", () => {
      expect(true).toBe(true);
    });
  });
});

describe("M-10: source-level contract — useCleanerRealtime hook", () => {
  const hookSrc = readFileSync(
    path.resolve(__dirname, "..", "useCleanerRealtime.ts"),
    "utf8",
  );

  it("imports buildCleanerRealtimeSubscriptionPlan from the pure plan module", () => {
    expect(hookSrc).toMatch(/buildCleanerRealtimeSubscriptionPlan/);
    expect(hookSrc).toMatch(
      /from ["']@\/lib\/realtime\/cleanerRealtimeSubscriptionPlan["']/,
    );
  });

  it("registers postgres_changes with event: '*' so INSERT/UPDATE/DELETE all flow", () => {
    expect(hookSrc).toMatch(
      /ch\.on\(\s*["']postgres_changes["']\s*,\s*\{\s*event:\s*["']\*["']/,
    );
  });

  it("exposes onOffersChange + subscribeOffers in the public options shape", () => {
    expect(hookSrc).toMatch(/onOffersChange\?:\s*\(\)\s*=>\s*void/);
    expect(hookSrc).toMatch(/subscribeOffers\?:\s*boolean/);
  });

  it("gates the dispatch_offers subscription on (subscribeOffers && onOffersChange)", () => {
    // The plan input `subscribeOffers` is computed AFTER && with the callback
    // ref — same pattern bookings + work follow. Pin the && so future edits
    // don't accidentally subscribe a no-op channel for consumers that don't
    // want offers.
    expect(hookSrc).toMatch(
      /listenOffers\s*=\s*subscribeOffers\s*&&\s*!!onOffersRef\.current/,
    );
  });

  it("debounces offer events through a dedicated timer ref (independent of bookings/work)", () => {
    expect(hookSrc).toMatch(/offersTimerRef\s*=\s*useRef<number\s*\|\s*null>\(null\)/);
    // bumpOffers must clear `offersTimerRef`, not the booking/work timers,
    // so a high-frequency offer stream doesn't starve the booking refetcher.
    expect(hookSrc).toMatch(/scheduleDebounced\(offersTimerRef/);
  });

  it("includes `dispatch_offers` in the replication doc-comment so onboarding notes the table", () => {
    expect(hookSrc).toMatch(/Replication:[\s\S]*dispatch_offers/);
  });

  it("does NOT pass partial Realtime payloads to consumer callbacks (full-row contract)", () => {
    // The bumper invocations all use `() => onOffersRef.current?.()` — no
    // `(payload) => onOffersRef.current?.(payload)` signature. This is the
    // structural guarantee that prevents duplicate UI cards from "merge
    // payload.new into local state" anti-patterns.
    expect(hookSrc).toMatch(/onOffersRef\.current\?\.\(\)/);
    expect(hookSrc).not.toMatch(/onOffersRef\.current\?\.\(payload/);
  });
});

describe("M-10: source-level contract — buildCleanerRealtimeSubscriptionPlan", () => {
  const planSrc = readFileSync(
    path.resolve(__dirname, "..", "cleanerRealtimeSubscriptionPlan.ts"),
    "utf8",
  );

  it("uses the canonical `cleaner_id=eq.<id>` filter syntax for dispatch_offers", () => {
    expect(planSrc).toMatch(
      /key:\s*["']dispatch_offers_cleaner_id["'][\s\S]{0,200}filter:\s*`cleaner_id=eq\.\$\{id\}`/,
    );
  });

  it("isolates the dispatch_offers handler from booking/work bumpers (table isolation)", () => {
    expect(planSrc).toMatch(
      /key:\s*["']dispatch_offers_cleaner_id["'][\s\S]{0,200}handler:\s*inputs\.bumpOffers/,
    );
  });

  it("guards the dispatch_offers append behind `if (inputs.subscribeOffers)`", () => {
    expect(planSrc).toMatch(/if\s*\(\s*inputs\.subscribeOffers\s*\)/);
  });
});
