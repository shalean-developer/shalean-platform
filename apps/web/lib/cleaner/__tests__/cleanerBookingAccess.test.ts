import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  appendRosterBookingIdsToOrFilter,
  bookingsVisibilityOrFilter,
  cleanerHasBookingAccess,
  fetchCleanerTeamIds,
  fetchCleanerVisibleBookingsMerged,
  isExplicitCleanerBookingAttribution,
} from "@/lib/cleaner/cleanerBookingAccess";

describe("isExplicitCleanerBookingAttribution", () => {
  const roster = new Set(["booking-on-roster"]);

  it("allows roster, direct, and payout-owner assignments", () => {
    expect(isExplicitCleanerBookingAttribution({ id: "booking-on-roster" }, "c1", roster)).toBe(true);
    expect(isExplicitCleanerBookingAttribution({ cleaner_id: "c1" }, "c1", roster)).toBe(true);
    expect(isExplicitCleanerBookingAttribution({ payout_owner_cleaner_id: "c1" }, "c1", roster)).toBe(true);
  });

  it("rejects team-only visibility that has no booking-level assignment", () => {
    expect(
      isExplicitCleanerBookingAttribution(
        { id: "other-booking", is_team_job: true, team_id: "current-team" },
        "c1",
        roster,
      ),
    ).toBe(false);
  });
});

describe("appendRosterBookingIdsToOrFilter", () => {
  it("appends id.in when roster ids present", () => {
    const base = "cleaner_id.eq.a";
    const out = appendRosterBookingIdsToOrFilter(base, ["11111111-1111-4111-8111-111111111111"]);
    expect(out).toContain("cleaner_id.eq.a");
    expect(out).toContain("id.in.(11111111-1111-4111-8111-111111111111)");
  });

  it("ignores invalid uuid tokens", () => {
    expect(appendRosterBookingIdsToOrFilter("x", ["not-a-uuid"])).toBe("x");
  });
});

describe("bookingsVisibilityOrFilter", () => {
  it("does not branch on selected_cleaner_id (pending user-selected jobs surface via /api/cleaner/offers)", () => {
    expect(bookingsVisibilityOrFilter("cleaner-a", [])).not.toMatch(/selected_cleaner/i);
  });

  it("uses cleaner_id and payout_owner when no teams", () => {
    expect(bookingsVisibilityOrFilter("cleaner-a", [])).toBe(
      "cleaner_id.eq.cleaner-a,payout_owner_cleaner_id.eq.cleaner-a",
    );
  });

  it("adds team OR branch when cleaner has teams", () => {
    const f = bookingsVisibilityOrFilter("cleaner-a", ["t1", "t2"]);
    expect(f).toContain("cleaner_id.eq.cleaner-a");
    expect(f).toContain("payout_owner_cleaner_id.eq.cleaner-a");
    expect(f.includes("is_team_job.is.true") || f.includes("is_team_job.eq.true")).toBe(true);
    expect(f).toContain("team_id.in.(t1,t2)");
  });
});

describe("fetchCleanerTeamIds", () => {
  it("dedupes team ids", async () => {
    const admin = {
      from: () => ({
        select: () => ({
          eq: () => ({
            not: () => ({
              then(onF: (v: { data: unknown; error: null }) => void) {
                const payload = {
                  data: [{ team_id: "t1" }, { team_id: "t1" }, { team_id: "t2" }],
                  error: null as null,
                };
                if (onF) onF(payload);
                return Promise.resolve(payload);
              },
            }),
          }),
        }),
      }),
    };
    const ids = await fetchCleanerTeamIds(admin as never, "c1");
    expect(ids.sort()).toEqual(["t1", "t2"]);
  });
});

describe("cleanerHasBookingAccess", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("allows individual assignment", async () => {
    const admin = { from: vi.fn() };
    const ok = await cleanerHasBookingAccess(admin as never, "c1", {
      cleaner_id: "c1",
      is_team_job: false,
    });
    expect(ok).toBe(true);
    expect(admin.from).not.toHaveBeenCalled();
  });

  it("denies team job when not a member", async () => {
    const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: null, error: null }) };
    const admin = { from: vi.fn(() => query) };
    const ok = await cleanerHasBookingAccess(admin as never, "c1", {
      id: "b1",
      cleaner_id: null,
      payout_owner_cleaner_id: null,
      team_id: "t9",
      is_team_job: true,
    });
    expect(ok).toBe(false);
    expect(admin.from).toHaveBeenCalledWith("booking_cleaners");
  });

  it("allows team job when member", async () => {
    const admin = {
      from: vi.fn(() => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: { team_id: "t9" }, error: null }),
            }),
          }),
        }),
      })),
    };
    const ok = await cleanerHasBookingAccess(admin as never, "c1", {
      id: "b1",
      cleaner_id: null,
      payout_owner_cleaner_id: null,
      team_id: "t9",
      is_team_job: true,
    });
    expect(ok).toBe(true);
    expect(admin.from).toHaveBeenCalledWith("booking_cleaners");
  });

  it("allows access when listed on booking_cleaners roster", async () => {
    const admin = {
      from: vi.fn((table: string) => {
        if (table === "booking_cleaners") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: () => Promise.resolve({ data: { id: "bc1" }, error: null }),
                }),
              }),
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      }),
    };
    const ok = await cleanerHasBookingAccess(admin as never, "c1", {
      id: "b1",
      cleaner_id: null,
      payout_owner_cleaner_id: null,
      team_id: "t9",
      is_team_job: true,
    });
    expect(ok).toBe(true);
    expect(admin.from).toHaveBeenCalledWith("booking_cleaners");
  });
});


describe("open roster visibility pagination", () => {
  it("retains roster-only work beyond the 500 most recent memberships with bounded ID filters", async () => {
    const ids = Array.from({ length: 501 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    const batches: string[][] = [];
    const rosterPages: number[] = [];
    const admin = { from: (table: string) => {
      let selected: string[] = [];
      const query = {
        select: () => query, eq: () => query, not: () => query, order: () => query, or: () => query,
        in: (_column: string, values: string[]) => { selected = values; batches.push(values); return query; },
        range: async (start: number, end: number) => {
          if (table === "booking_cleaners") {
            rosterPages.push(start);
            return { data: ids.slice(start, end + 1).map((booking_id) => ({ booking_id })), error: null };
          }
          return { data: selected.slice(start, end + 1).map((id) => ({ id, status: "assigned" })), error: null };
        },
        limit: async () => ({ data: [], error: null }),
        then: (resolve: (v: { data: unknown[]; error: null }) => unknown) => Promise.resolve(resolve({ data: [], error: null })),
      };
      return query;
    } };
    const result = await fetchCleanerVisibleBookingsMerged(admin as never, "cleaner", {
      select: "id,status", perBranchLimit: 300, pageAllBranches: true,
    });
    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(501);
    expect(result.data?.at(-1)?.id).toBe(ids[500]);
    expect(rosterPages).toEqual([0, 500]);
    expect(batches.every((ids) => ids.length <= 100)).toBe(true);
  });
});
