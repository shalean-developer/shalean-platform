import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  bookingsVisibilityOrFilter,
  cleanerHasBookingAccess,
  fetchCleanerTeamIds,
} from "@/lib/cleaner/cleanerBookingAccess";

describe("bookingsVisibilityOrFilter", () => {
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
    const admin = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
        }),
      }),
    };
    const ok = await cleanerHasBookingAccess(admin as never, "c1", {
      cleaner_id: null,
      team_id: "t9",
      is_team_job: true,
    });
    expect(ok).toBe(false);
  });

  it("allows team job when member", async () => {
    const admin = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: { team_id: "t9" }, error: null }),
            }),
          }),
        }),
      }),
    };
    const ok = await cleanerHasBookingAccess(admin as never, "c1", {
      cleaner_id: null,
      team_id: "t9",
      is_team_job: true,
    });
    expect(ok).toBe(true);
  });
});
