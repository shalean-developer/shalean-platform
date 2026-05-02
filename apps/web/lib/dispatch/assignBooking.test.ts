import { afterEach, describe, expect, it, vi } from "vitest";

class MockSupabase {
  constructor(private booking: Record<string, unknown> | null) {}
  from(_table: string) {
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: this.booking, error: null }),
        }),
      }),
    };
  }
}

vi.mock("@/lib/dispatch/assignCleaner", () => ({
  assignCleanerToBooking: vi.fn(async () => ({ ok: true, cleanerId: "cleaner-1" })),
}));

vi.mock("@/lib/dispatch/assignTeamToBooking", () => ({
  assignTeamToBooking: vi.fn(async () => ({ ok: true, teamId: "team-1" })),
}));

describe("assignBooking", { timeout: 20_000 }, () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("routes deep cleaning to team when feature flag enabled", async () => {
    vi.stubEnv("ENABLE_TEAM_ASSIGNMENT", "true");
    vi.stubEnv("TEAM_ASSIGN_ALLOWED_LOCATIONS", "");
    const { assignBooking } = await import("@/lib/dispatch/assignBooking");
    const result = await assignBooking(
      new MockSupabase({
        id: "b1",
        status: "pending",
        cleaner_id: null,
        date: "2026-04-25",
        service: "Deep Cleaning",
        location: "capetown",
        booking_snapshot: null,
      }) as unknown as never,
      "b1",
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.assignmentKind).toBe("team");
  });

  it("routes standard cleaning to individual path", async () => {
    vi.stubEnv("ENABLE_TEAM_ASSIGNMENT", "true");
    vi.stubEnv("TEAM_ASSIGN_ALLOWED_LOCATIONS", "");
    const { assignBooking } = await import("@/lib/dispatch/assignBooking");
    const result = await assignBooking(
      new MockSupabase({
        id: "b2",
        status: "pending",
        cleaner_id: null,
        date: "2026-04-25",
        service: "Standard Cleaning",
        location: "capetown",
        booking_snapshot: null,
      }) as unknown as never,
      "b2",
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.assignmentKind).toBe("individual");
  });

  it("uses existing individual flow when feature flag disabled", async () => {
    vi.stubEnv("ENABLE_TEAM_ASSIGNMENT", "false");
    vi.stubEnv("TEAM_ASSIGN_ALLOWED_LOCATIONS", "");
    const { assignBooking } = await import("@/lib/dispatch/assignBooking");
    const result = await assignBooking(
      new MockSupabase({
        id: "b3",
        status: "pending",
        cleaner_id: null,
        date: "2026-04-25",
        service: "Move In/Out Cleaning",
        location: "capetown",
        booking_snapshot: null,
      }) as unknown as never,
      "b3",
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.assignmentKind).toBe("individual");
  });

  it("falls back to individual when deep-only gate blocks service", async () => {
    vi.stubEnv("ENABLE_TEAM_ASSIGNMENT", "true");
    vi.stubEnv("TEAM_ASSIGN_DEEP_ONLY", "true");
    vi.stubEnv("TEAM_ASSIGN_ALLOWED_LOCATIONS", "capetown,stellenbosch");
    const { assignBooking } = await import("@/lib/dispatch/assignBooking");
    const result = await assignBooking(
      new MockSupabase({
        id: "b4",
        status: "pending",
        cleaner_id: null,
        date: "2026-04-25",
        service: "Standard Cleaning",
        location: "capetown",
        booking_snapshot: null,
      }) as unknown as never,
      "b4",
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.assignmentKind).toBe("individual");
  });

  it("rejects assignment while payment is still pending", async () => {
    vi.stubEnv("ENABLE_TEAM_ASSIGNMENT", "false");
    const { assignBooking } = await import("@/lib/dispatch/assignBooking");
    const result = await assignBooking(
      new MockSupabase({
        id: "b-unpaid",
        status: "pending_payment",
        cleaner_id: null,
        date: "2026-04-25",
        service: "Standard Cleaning",
        location: "capetown",
        booking_snapshot: null,
      }) as unknown as never,
      "b-unpaid",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("booking_not_pending");
  });

  it("falls back to individual when location is not allowed", async () => {
    vi.stubEnv("ENABLE_TEAM_ASSIGNMENT", "true");
    vi.stubEnv("TEAM_ASSIGN_ALLOWED_LOCATIONS", "capetown");
    const { assignBooking } = await import("@/lib/dispatch/assignBooking");
    const result = await assignBooking(
      new MockSupabase({
        id: "b5",
        status: "pending",
        cleaner_id: null,
        date: "2026-04-25",
        service: "Deep Cleaning",
        location: "johannesburg",
        booking_snapshot: null,
      }) as unknown as never,
      "b5",
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.assignmentKind).toBe("individual");
  });
});

