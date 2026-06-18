import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { chooseReviewModalAutoOpenIntent } from "../reviewModalAutoOpenIntent";
import {
  applyTeamLeadCleanerNamesToRows,
  extractTeamLeadCleanerIdsForEnrichment,
  type TeamLeadEnrichableRow,
} from "../teamLeadCleanerNameEnrichment";
import { mapBookingRow } from "../../dashboard/bookingUtils";
import type { BookingRow } from "../../dashboard/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * M-11: review-modal auto-open contract.
 *
 *   1. `?booking=<id>` deep links keep auto-opening (lifecycle email +
 *      dashboard CTA path — pre-existing behaviour).
 *   2. Exactly ONE reviewable booking auto-opens (M-11 fix).
 *   3. Multiple reviewable bookings NEVER auto-open (so we never funnel
 *      feedback to the wrong booking).
 *   4. Latches via `alreadyOpened` so a refetch can't reopen the modal
 *      after the customer dismissed it.
 *
 * M-15: cleaner-name surface in modal selection + review list.
 *
 *   1. Solo bookings → name comes from `cleaners(full_name)` embed.
 *   2. Team-assigned bookings (H-8: `cleaner_id` cleared, lead in
 *      `payout_owner_cleaner_id`) → name comes from server-enriched
 *      `payout_owner_cleaner_name`.
 *   3. Server enrichment is roster-safe — only the lead UUIDs already on
 *      the row payload are looked up, never `team_members.cleaner_id`.
 *   4. Solo bookings are NEVER queried by the enricher (no extra
 *      round-trip on dashboards without team jobs).
 */

function basePlanInputs(
  overrides: Partial<Parameters<typeof chooseReviewModalAutoOpenIntent>[0]>,
): Parameters<typeof chooseReviewModalAutoOpenIntent>[0] {
  return {
    queryBookingId: null,
    reviewableIds: [],
    alreadyOpened: false,
    bookingsLoading: false,
    reviewsLoading: false,
    ...overrides,
  };
}

describe("M-11: chooseReviewModalAutoOpenIntent", () => {
  describe("?booking= deep links (pre-existing behaviour preserved)", () => {
    it("auto-opens the modal on the requested booking when it is reviewable", () => {
      const out = chooseReviewModalAutoOpenIntent(
        basePlanInputs({
          queryBookingId: "bk-2",
          reviewableIds: ["bk-1", "bk-2", "bk-3"],
        }),
      );
      expect(out).toEqual({ kind: "by_query", bookingId: "bk-2" });
    });

    it("trims whitespace around the query value before matching", () => {
      const out = chooseReviewModalAutoOpenIntent(
        basePlanInputs({
          queryBookingId: "  bk-2  ",
          reviewableIds: ["bk-1", "bk-2"],
        }),
      );
      expect(out).toEqual({ kind: "by_query", bookingId: "bk-2" });
    });

    it("ignores ?booking= when the requested id is not reviewable (e.g. already reviewed)", () => {
      const out = chooseReviewModalAutoOpenIntent(
        basePlanInputs({
          queryBookingId: "bk-stale",
          reviewableIds: ["bk-1", "bk-2"],
        }),
      );
      // Falls through to the normal multi-eligible behaviour: no auto-open.
      expect(out).toEqual({ kind: "none" });
    });

    it("?booking= wins over single-eligible auto-open when both apply", () => {
      const out = chooseReviewModalAutoOpenIntent(
        basePlanInputs({
          queryBookingId: "bk-only",
          reviewableIds: ["bk-only"],
        }),
      );
      // The deep-link is the more specific intent — preserve as `by_query`
      // for analytics / KPIs that distinguish the two trigger sources.
      expect(out.kind).toBe("by_query");
    });
  });

  describe("single-eligible auto-open (M-11)", () => {
    it("auto-opens when there is exactly one reviewable booking", () => {
      const out = chooseReviewModalAutoOpenIntent(
        basePlanInputs({ reviewableIds: ["bk-only"] }),
      );
      expect(out).toEqual({ kind: "single_eligible", bookingId: "bk-only" });
    });

    it("does NOT auto-open when there are multiple reviewable bookings", () => {
      const out = chooseReviewModalAutoOpenIntent(
        basePlanInputs({ reviewableIds: ["bk-1", "bk-2"] }),
      );
      expect(out).toEqual({ kind: "none" });
    });

    it("does NOT auto-open when there are zero reviewable bookings", () => {
      const out = chooseReviewModalAutoOpenIntent(
        basePlanInputs({ reviewableIds: [] }),
      );
      expect(out).toEqual({ kind: "none" });
    });
  });

  describe("loading + latch guards", () => {
    it("waits for bookings to finish loading before deciding", () => {
      const out = chooseReviewModalAutoOpenIntent(
        basePlanInputs({
          reviewableIds: ["bk-only"],
          bookingsLoading: true,
        }),
      );
      expect(out).toEqual({ kind: "none" });
    });

    it("waits for reviews to finish loading before deciding", () => {
      const out = chooseReviewModalAutoOpenIntent(
        basePlanInputs({
          reviewableIds: ["bk-only"],
          reviewsLoading: true,
        }),
      );
      expect(out).toEqual({ kind: "none" });
    });

    it("never reopens once `alreadyOpened` latches (post-dismiss safety)", () => {
      const out = chooseReviewModalAutoOpenIntent(
        basePlanInputs({
          queryBookingId: "bk-only",
          reviewableIds: ["bk-only"],
          alreadyOpened: true,
        }),
      );
      expect(out).toEqual({ kind: "none" });
    });
  });
});

describe("M-15: extractTeamLeadCleanerIdsForEnrichment (roster-safe)", () => {
  function row(overrides: Partial<TeamLeadEnrichableRow>): TeamLeadEnrichableRow {
    return {
      is_team_job: false,
      cleaner_id: null,
      payout_owner_cleaner_id: null,
      ...overrides,
    } as TeamLeadEnrichableRow;
  }

  it("returns the lead UUID for team jobs with cleared cleaner_id", () => {
    const ids = extractTeamLeadCleanerIdsForEnrichment([
      row({ is_team_job: true, cleaner_id: null, payout_owner_cleaner_id: "lead-A" }),
    ]);
    expect(ids).toEqual(["lead-A"]);
  });

  it("dedupes lead UUIDs across multiple team-job rows", () => {
    const ids = extractTeamLeadCleanerIdsForEnrichment([
      row({ is_team_job: true, cleaner_id: null, payout_owner_cleaner_id: "lead-A" }),
      row({ is_team_job: true, cleaner_id: null, payout_owner_cleaner_id: "lead-A" }),
      row({ is_team_job: true, cleaner_id: null, payout_owner_cleaner_id: "lead-B" }),
    ]);
    expect(ids.sort()).toEqual(["lead-A", "lead-B"]);
  });

  it("skips solo bookings (cleaner_id set) — names already resolved by the embed", () => {
    const ids = extractTeamLeadCleanerIdsForEnrichment([
      row({
        is_team_job: false,
        cleaner_id: "solo-cleaner-id",
        payout_owner_cleaner_id: "solo-cleaner-id",
      }),
      row({
        is_team_job: true, // mid-handoff — cleaner_id still set, embed still works
        cleaner_id: "transition-cleaner-id",
        payout_owner_cleaner_id: "transition-lead",
      }),
    ]);
    expect(ids).toEqual([]);
  });

  it("skips team rows without a payout_owner_cleaner_id (legacy / unassigned)", () => {
    const ids = extractTeamLeadCleanerIdsForEnrichment([
      row({ is_team_job: true, cleaner_id: null, payout_owner_cleaner_id: null }),
      row({ is_team_job: true, cleaner_id: null, payout_owner_cleaner_id: "  " }),
    ]);
    expect(ids).toEqual([]);
  });

  it("returns ONLY lead UUIDs already on rows — never invents team_members ids", () => {
    /* This is the structural guarantee that keeps M-15 from leaking the team
     * roster: the helper has no Supabase client, no team_members lookup, and
     * cannot pull anything not already present on the input rows. */
    const inputs = [
      row({ is_team_job: true, cleaner_id: null, payout_owner_cleaner_id: "lead-A" }),
    ];
    const ids = extractTeamLeadCleanerIdsForEnrichment(inputs);
    expect(ids).toEqual(["lead-A"]);
    // Belt-and-braces: the function is referentially transparent and cannot
    // mutate its inputs.
    expect(inputs[0]!.payout_owner_cleaner_id).toBe("lead-A");
  });
});

describe("M-15: applyTeamLeadCleanerNamesToRows (in-place merge)", () => {
  it("sets `payout_owner_cleaner_name` on team rows whose lead UUID resolved a name", () => {
    const rows: TeamLeadEnrichableRow[] = [
      { is_team_job: true, cleaner_id: null, payout_owner_cleaner_id: "lead-A" },
      { is_team_job: true, cleaner_id: null, payout_owner_cleaner_id: "lead-B" },
    ];
    const mutated = applyTeamLeadCleanerNamesToRows(
      rows,
      new Map([
        ["lead-A", "Alice Lead"],
        ["lead-B", "Bea Lead"],
      ]),
    );
    expect(mutated).toBe(2);
    expect(rows[0]!.payout_owner_cleaner_name).toBe("Alice Lead");
    expect(rows[1]!.payout_owner_cleaner_name).toBe("Bea Lead");
  });

  it("leaves solo bookings untouched", () => {
    const rows: TeamLeadEnrichableRow[] = [
      { is_team_job: false, cleaner_id: "solo", payout_owner_cleaner_id: "solo" },
    ];
    const mutated = applyTeamLeadCleanerNamesToRows(
      rows,
      new Map([["solo", "Solo Cleaner"]]),
    );
    expect(mutated).toBe(0);
    expect(rows[0]!.payout_owner_cleaner_name).toBeUndefined();
  });

  it("leaves team rows untouched when the lead is missing from the name map (graceful degradation)", () => {
    const rows: TeamLeadEnrichableRow[] = [
      { is_team_job: true, cleaner_id: null, payout_owner_cleaner_id: "lead-X" },
    ];
    const mutated = applyTeamLeadCleanerNamesToRows(rows, new Map());
    expect(mutated).toBe(0);
    expect(rows[0]!.payout_owner_cleaner_name).toBeUndefined();
  });

  it("ignores blank / whitespace lead names without writing a falsy display string", () => {
    const rows: TeamLeadEnrichableRow[] = [
      { is_team_job: true, cleaner_id: null, payout_owner_cleaner_id: "lead-A" },
    ];
    const mutated = applyTeamLeadCleanerNamesToRows(
      rows,
      new Map([["lead-A", "   "]]),
    );
    expect(mutated).toBe(0);
    expect(rows[0]!.payout_owner_cleaner_name).toBeUndefined();
  });
});

describe("M-15: cleanerFromRow displays the right cleaner for solo + team bookings", () => {
  function bookingFixture(overrides: Partial<BookingRow>): BookingRow {
    return {
      id: "bk-1",
      user_id: "user-1",
      service: "Standard cleaning",
      date: "2026-05-12",
      time: "09:00",
      location: "1 Long St, Cape Town",
      total_paid_zar: 800,
      amount_paid_cents: 80000,
      currency: "ZAR",
      status: "completed",
      booking_snapshot: null,
      created_at: "2026-05-10T12:00:00.000Z",
      paystack_reference: "REF-1",
      cleaners: null,
      ...overrides,
    } as BookingRow;
  }

  it("solo booking — embed name wins (canonical, unchanged)", () => {
    const b = mapBookingRow(
      bookingFixture({
        cleaner_id: "solo-id",
        cleaners: { full_name: "Solo Cleaner", phone: "+27000000001" },
      }),
    );
    expect(b.cleaner?.name).toBe("Solo Cleaner");
    expect(b.cleaner?.phone).toBe("+27000000001");
  });

  it("team-assigned booking (H-8) — server-enriched lead name surfaces", () => {
    const b = mapBookingRow(
      bookingFixture({
        is_team_job: true,
        cleaner_id: null,
        payout_owner_cleaner_id: "lead-id",
        payout_owner_cleaner_name: "Lead Cleaner",
        cleaners: null,
      }),
    );
    expect(b.cleaner?.name).toBe("Lead Cleaner");
  });

  it("team-assigned booking — lead name supersedes a stale snapshot.cleaner_name", () => {
    /* Pre-checkout the customer may have selected a specific cleaner whose
     * name is captured in `booking_snapshot.cleaner_name`; if the booking is
     * later team-assigned to a different lead, M-15 must show the LEAD name
     * (the cleaner the review will actually be saved against) — never the
     * stale pre-checkout pick. */
    const b = mapBookingRow(
      bookingFixture({
        is_team_job: true,
        cleaner_id: null,
        payout_owner_cleaner_id: "lead-id",
        payout_owner_cleaner_name: "Current Lead",
        booking_snapshot: { v: 1, cleaner_name: "Originally Picked" } as unknown as BookingRow["booking_snapshot"],
        cleaners: null,
      }),
    );
    expect(b.cleaner?.name).toBe("Current Lead");
  });

  it("team-assigned booking with no lead name resolved — falls back to snapshot, then null", () => {
    const withSnap = mapBookingRow(
      bookingFixture({
        is_team_job: true,
        cleaner_id: null,
        payout_owner_cleaner_id: "lead-id",
        payout_owner_cleaner_name: null,
        booking_snapshot: { v: 1, cleaner_name: "Snapshot Name" } as unknown as BookingRow["booking_snapshot"],
        cleaners: null,
      }),
    );
    expect(withSnap.cleaner?.name).toBe("Snapshot Name");

    const empty = mapBookingRow(
      bookingFixture({
        is_team_job: true,
        cleaner_id: null,
        payout_owner_cleaner_id: "lead-id",
        payout_owner_cleaner_name: null,
        cleaners: null,
      }),
    );
    expect(empty.cleaner).toBeNull();
  });

  it("`payout_owner_cleaner_name` is IGNORED when `is_team_job=false` (no widening for solo rows)", () => {
    const b = mapBookingRow(
      bookingFixture({
        is_team_job: false,
        cleaner_id: null,
        payout_owner_cleaner_id: "owner-id",
        payout_owner_cleaner_name: "Should NOT show",
        cleaners: null,
      }),
    );
    expect(b.cleaner).toBeNull();
  });
});

describe("M-15: source-level contract — review hooks/route surface the cleaner name", () => {
  const useReviewsSrc = readFileSync(
    path.resolve(__dirname, "..", "..", "..", "hooks", "useReviews.ts"),
    "utf8",
  );
  const reviewsPageSrc = readFileSync(
    path.resolve(__dirname, "..", "..", "..", "app", "dashboard", "reviews", "page.tsx"),
    "utf8",
  );
  const customerLoaderSrc = readFileSync(
    path.resolve(__dirname, "..", "..", "customer", "customerBookingsForUser.ts"),
    "utf8",
  );

  it("useReviews fetches `cleaners(full_name)` so the list can show the cleaner name", () => {
    expect(useReviewsSrc).toMatch(/cleaners\(full_name\)/);
    expect(useReviewsSrc).toMatch(/cleanerName/);
  });

  it("useReviews exposes a `cleanerName: string | null` field on each item", () => {
    expect(useReviewsSrc).toMatch(/cleanerName:\s*string\s*\|\s*null/);
  });

  it("reviews page renders the selected-cleaner subtitle inside the modal", () => {
    expect(reviewsPageSrc).toMatch(/data-testid="rev-selected-cleaner"/);
    expect(reviewsPageSrc).toMatch(/You(?:'|&apos;)re reviewing/);
  });

  it("reviews page renders the cleaner name on each review-list card", () => {
    expect(reviewsPageSrc).toMatch(/r\.cleanerName/);
  });

  it("reviews page wires the M-11 single-eligible auto-open helper (not the legacy ?booking-only effect)", () => {
    expect(reviewsPageSrc).toMatch(/chooseReviewModalAutoOpenIntent/);
    expect(reviewsPageSrc).toMatch(/single_eligible|reviewableIds/);
  });

  it("customer-bookings loader queries cleaners by id IN (lead_uuids) — never a roster table", () => {
    /* M-15 roster-safety contract: the enricher must NEVER call into the
     * `team_members` table from this loader, must always limit lookups to
     * `cleaners` filtered by an `IN (...)` of UUIDs already on the row
     * payload, and must scope the SELECT to display fields only. */
    expect(customerLoaderSrc).not.toMatch(/from\(["']team_members["']\)/);
    expect(customerLoaderSrc).toMatch(/from\("cleaners"\)/);
    expect(customerLoaderSrc).toMatch(/\.select\("id, full_name"\)/);
    expect(customerLoaderSrc).toMatch(/\.in\("id",\s*allIds\)/);
  });

  it("customer-bookings loader uses extractCustomerDisplayCleanerIds for preferred/assigned cleaners", () => {
    expect(customerLoaderSrc).toMatch(/extractCustomerDisplayCleanerIds/);
    expect(customerLoaderSrc).toMatch(/applyCustomerDisplayCleanerNamesToRows/);
  });

  it("customer-bookings loader uses extractTeamLeadCleanerIdsForEnrichment so lead-id source can't drift", () => {
    expect(customerLoaderSrc).toMatch(/extractTeamLeadCleanerIdsForEnrichment/);
    expect(customerLoaderSrc).toMatch(/applyTeamLeadCleanerNamesToRows/);
  });
});
