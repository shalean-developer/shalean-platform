import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as systemLog from "@/lib/logging/systemLog";
import { assignTeamToBooking, CAPACITY_STATUSES } from "@/lib/dispatch/assignTeamToBooking";

type Row = Record<string, unknown>;

class QueryBuilder {
  private filters: Array<{ kind: "eq" | "in" | "not_is" | "is"; column: string; value: unknown }> = [];
  private mode: "select" | "update" | "insert" = "select";
  private patch: Row = {};
  private single = false;

  constructor(
    private table: string,
    private db: MockSupabase,
  ) {}

  select() {
    return this;
  }

  update(values: Row) {
    this.mode = "update";
    this.patch = { ...values };
    return this;
  }

  insert(values: Row | Row[]) {
    this.mode = "insert";
    const rows = Array.isArray(values) ? values : [values];
    this.db.tables[this.table].push(...rows.map((r) => ({ ...r })));
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ kind: "eq", column, value });
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push({ kind: "in", column, value: values });
    return this;
  }

  is(column: string, value: unknown) {
    this.filters.push({ kind: "is", column, value });
    return this;
  }

  not(column: string, op: string, value: unknown) {
    if (op === "is") this.filters.push({ kind: "not_is", column, value });
    return this;
  }

  order() {
    return this;
  }

  limit() {
    return this;
  }

  maybeSingle() {
    this.single = true;
    return this.exec();
  }

  then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.exec().then(onfulfilled, onrejected);
  }

  private async exec(): Promise<{ data: unknown; error: null }> {
    const rows = this.db.tables[this.table] ?? [];
    const matched = rows.filter((r) => this.matches(r));
    if (this.mode === "update") {
      for (const row of matched) Object.assign(row, this.patch);
      return { data: this.single ? matched[0] ?? null : matched, error: null };
    }
    return { data: this.single ? matched[0] ?? null : matched, error: null };
  }

  private matches(row: Row): boolean {
    for (const f of this.filters) {
      const value = row[f.column];
      if (f.kind === "eq" && value !== f.value) return false;
      if (f.kind === "in") {
        if (!Array.isArray(f.value)) return false;
        if (!f.value.some((v) => v === value)) return false;
      }
      if (f.kind === "not_is" && f.value === null) {
        if (value === null || value === undefined) return false;
      }
      if (f.kind === "is" && f.value === null) {
        if (value !== null && value !== undefined) return false;
      }
    }
    return true;
  }
}

class MockSupabase {
  tables: Record<string, Row[]>;
  /** When set, `claim_team_capacity_slot` always returns false for this team (simulates race / full slot). */
  claimAlwaysRejectTeamId: string | null = null;
  /** When non-empty, claim RPC returns false for every team id in the set (persistent reject). */
  claimAlwaysRejectTeamIds = new Set<string>();
  /** Per team: return false from claim RPC this many times before applying normal capacity logic (transient contention). */
  claimTransientRejectRemaining: Record<string, number> = {};

  constructor(seed?: Partial<Record<string, Row[]>>) {
    this.tables = {
      teams: [],
      team_members: [],
      bookings: [],
      booking_team_assignments: [],
      ...(seed ?? {}),
    };
  }
  from(table: string) {
    if (!this.tables[table]) this.tables[table] = [];
    return new QueryBuilder(table, this);
  }
  async rpc(name: string, args: Record<string, unknown>) {
    if (name === "assign_team_and_sync_roster") {
      const bookingId = String(args.p_booking_id ?? "");
      const teamId = String(args.p_team_id ?? "");
      const payoutOwner = String(args.p_payout_owner_cleaner_id ?? "");
      const snapRaw = args.p_team_member_count_snapshot;
      const snap =
        typeof snapRaw === "number" && Number.isFinite(snapRaw) ? Math.max(0, Math.floor(snapRaw)) : null;
      const rows = this.tables.bookings ?? [];
      const hit = rows.find((b) => String(b.id) === bookingId);
      if (hit) {
        Object.assign(hit, {
          cleaner_id: null,
          payout_owner_cleaner_id: payoutOwner,
          is_team_job: true,
          team_id: teamId,
          status: "assigned",
          dispatch_status: "assigned",
          team_member_count_snapshot: snap,
          cleaner_response_status: "pending",
        });
      }
      return { data: { ok: true }, error: null };
    }
    if (name === "claim_team_capacity_slot") {
      const teamId = String(args.p_team_id ?? "");
      if (this.claimAlwaysRejectTeamId && this.claimAlwaysRejectTeamId === teamId) {
        return { data: false, error: null };
      }
      if (this.claimAlwaysRejectTeamIds.has(teamId)) {
        return { data: false, error: null };
      }
      const transient = this.claimTransientRejectRemaining[teamId] ?? 0;
      if (transient > 0) {
        this.claimTransientRejectRemaining[teamId] = transient - 1;
        return { data: false, error: null };
      }
      const date = String(args.p_booking_date ?? "");
      const capacity = Number(args.p_capacity_per_day ?? 0);
      const used = this.tables.bookings.filter(
        (b) =>
          b.team_id === teamId &&
          b.is_team_job === true &&
          b.date === date &&
          (CAPACITY_STATUSES as readonly string[]).includes(String(b.status ?? "")),
      ).length;
      return { data: used < capacity, error: null };
    }
    return { data: true, error: null };
  }
}

async function expectTeamAssignThrows(
  supabase: MockSupabase,
  booking: { id: string; status: string | null; cleaner_id: string | null; date: string | null },
  serviceType: "deep_cleaning" | "move_cleaning",
  expectedMessage: string,
) {
  await expect(
    (async () => {
      const result = await assignTeamToBooking(supabase as unknown as never, booking, serviceType);
      if (!result.ok) throw new Error(result.message ?? result.error);
    })(),
  ).rejects.toThrow(expectedMessage);
}

describe("assignTeamToBooking edge cases", () => {
  beforeEach(() => {
    vi.spyOn(systemLog, "logSystemEvent").mockImplementation(async () => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("fails when no team available", async () => {
    const supabase = new MockSupabase({ teams: [] });
    await expectTeamAssignThrows(
      supabase,
      { id: "b1", status: "pending", cleaner_id: null, date: "2026-04-25" },
      "deep_cleaning",
      "No team available",
    );
  });

  it("fails when no active team members", async () => {
    const supabase = new MockSupabase({
      teams: [{ id: "t1", service_type: "deep_cleaning", is_active: true, capacity_per_day: 3 }],
      team_members: [],
    });
    await expectTeamAssignThrows(
      supabase,
      { id: "b2", status: "pending", cleaner_id: null, date: "2026-04-25" },
      "deep_cleaning",
      "No active team members",
    );
  });

  it("fails when team capacity exceeded", async () => {
    const supabase = new MockSupabase({
      teams: [{ id: "t1", service_type: "deep_cleaning", is_active: true, capacity_per_day: 3 }],
      team_members: [{ id: "m1", team_id: "t1", cleaner_id: "c1", active_from: null, active_to: null }],
      bookings: [
        { id: "x1", team_id: "t1", is_team_job: true, date: "2026-04-25", status: "assigned" },
        { id: "x2", team_id: "t1", is_team_job: true, date: "2026-04-25", status: "assigned" },
        { id: "x3", team_id: "t1", is_team_job: true, date: "2026-04-25", status: "in_progress" },
      ],
    });
    await expectTeamAssignThrows(
      supabase,
      { id: "b3", status: "pending", cleaner_id: null, date: "2026-04-25" },
      "deep_cleaning",
      "Team capacity exceeded",
    );
    expect(vi.mocked(systemLog.logSystemEvent)).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "TEAM_ASSIGNMENT_NO_CANDIDATES",
        context: expect.objectContaining({
          saturationShortCircuit: true,
        }),
      }),
    );
  });

  it("assigns team successfully and sets booking identity fields safely", async () => {
    const supabase = new MockSupabase({
      teams: [{ id: "t1", service_type: "move_cleaning", is_active: true, capacity_per_day: 3 }],
      team_members: [
        { id: "m1", team_id: "t1", cleaner_id: "c1", active_from: null, active_to: null },
        { id: "m2", team_id: "t1", cleaner_id: "c2", active_from: null, active_to: null },
      ],
      bookings: [{ id: "b4", status: "pending", cleaner_id: null, date: "2026-04-25" }],
    });

    const result = await assignTeamToBooking(
      supabase as unknown as never,
      { id: "b4", status: "pending", cleaner_id: null, date: "2026-04-25" },
      "move_cleaning",
    );

    expect(result.ok).toBe(true);
    const booking = supabase.tables.bookings.find((b) => b.id === "b4")!;
    expect(booking.is_team_job).toBe(true);
    expect(booking.team_id).toBeTruthy();
    expect(booking.cleaner_id).toBeNull();
    expect(booking.team_member_count_snapshot).toBe(2);
    expect(supabase.tables.booking_team_assignments).toHaveLength(1);
  });

  it("picks least-loaded team by assigned+in_progress count on booking date", async () => {
    const supabase = new MockSupabase({
      teams: [
        { id: "t-busy", service_type: "deep_cleaning", is_active: true, capacity_per_day: 5 },
        { id: "t-lite", service_type: "deep_cleaning", is_active: true, capacity_per_day: 5 },
      ],
      team_members: [
        { id: "m1", team_id: "t-busy", cleaner_id: "c1", active_from: null, active_to: null },
        { id: "m2", team_id: "t-lite", cleaner_id: "c2", active_from: null, active_to: null },
      ],
      bookings: [
        {
          id: "x1",
          team_id: "t-busy",
          is_team_job: true,
          date: "2026-04-25",
          status: "assigned",
        },
        { id: "b-new", status: "pending", cleaner_id: null, date: "2026-04-25" },
      ],
    });

    const result = await assignTeamToBooking(
      supabase as unknown as never,
      { id: "b-new", status: "pending", cleaner_id: null, date: "2026-04-25" },
      "deep_cleaning",
    );

    expect(result.ok).toBe(true);
    expect((result as { ok: true; teamId: string }).teamId).toBe("t-lite");
  });

  it("falls back when first preferred team cannot claim capacity", async () => {
    const supabase = new MockSupabase({
      teams: [
        { id: "t-alpha", service_type: "deep_cleaning", is_active: true, capacity_per_day: 5 },
        { id: "t-beta", service_type: "deep_cleaning", is_active: true, capacity_per_day: 5 },
      ],
      team_members: [
        { id: "m1", team_id: "t-alpha", cleaner_id: "c1", active_from: null, active_to: null },
        { id: "m2", team_id: "t-beta", cleaner_id: "c2", active_from: null, active_to: null },
      ],
      bookings: [{ id: "b1", status: "pending", cleaner_id: null, date: "2026-04-25" }],
    });
    supabase.claimAlwaysRejectTeamId = "t-alpha";

    const result = await assignTeamToBooking(
      supabase as unknown as never,
      { id: "b1", status: "pending", cleaner_id: null, date: "2026-04-25" },
      "deep_cleaning",
    );

    expect(result.ok).toBe(true);
    expect((result as { ok: true; teamId: string }).teamId).toBe("t-beta");
    expect(vi.mocked(systemLog.logSystemEvent)).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "TEAM_ASSIGNMENT_FALLBACK",
        context: expect.objectContaining({
          attemptedTeams: ["t-alpha"],
          selectedTeam: "t-beta",
        }),
      }),
    );
  });

  it("tie bucket uses deterministic rotation to spread concurrent claim attempts", async () => {
    const supabase = new MockSupabase({
      teams: [
        { id: "t-mid", service_type: "deep_cleaning", is_active: true, capacity_per_day: 5 },
        { id: "t-zzz", service_type: "deep_cleaning", is_active: true, capacity_per_day: 5 },
      ],
      team_members: [
        { id: "m1", team_id: "t-mid", cleaner_id: "c1", active_from: null, active_to: null },
        { id: "m2", team_id: "t-zzz", cleaner_id: "c2", active_from: null, active_to: null },
      ],
      bookings: [{ id: "b-tie", status: "pending", cleaner_id: null, date: "2026-04-25" }],
    });

    const result = await assignTeamToBooking(
      supabase as unknown as never,
      { id: "b-tie", status: "pending", cleaner_id: null, date: "2026-04-25" },
      "deep_cleaning",
    );

    expect(result.ok).toBe(true);
    expect((result as { ok: true; teamId: string }).teamId).toBe("t-mid");
  });

  it("prefers team with lighter same-timeslot load when TEAM_ASSIGN_SLOT_LOAD_WEIGHT is set", async () => {
    vi.stubEnv("TEAM_ASSIGN_SLOT_LOAD_WEIGHT", "0.5");
    const supabase = new MockSupabase({
      teams: [
        { id: "t-slot-busy", service_type: "deep_cleaning", is_active: true, capacity_per_day: 5 },
        { id: "t-slot-free", service_type: "deep_cleaning", is_active: true, capacity_per_day: 5 },
      ],
      team_members: [
        { id: "m1", team_id: "t-slot-busy", cleaner_id: "c1", active_from: null, active_to: null },
        { id: "m2", team_id: "t-slot-free", cleaner_id: "c2", active_from: null, active_to: null },
      ],
      bookings: [
        {
          id: "x-slot",
          team_id: "t-slot-busy",
          is_team_job: true,
          date: "2026-04-25",
          status: "assigned",
          time: "09:00",
        },
        {
          id: "x-other-time",
          team_id: "t-slot-free",
          is_team_job: true,
          date: "2026-04-25",
          status: "assigned",
          time: "14:00",
        },
        { id: "b-slot", status: "pending", cleaner_id: null, date: "2026-04-25" },
      ],
    });

    const result = await assignTeamToBooking(
      supabase as unknown as never,
      {
        id: "b-slot",
        status: "pending",
        cleaner_id: null,
        date: "2026-04-25",
        time: "09:00",
      },
      "deep_cleaning",
    );

    expect(result.ok).toBe(true);
    expect((result as { ok: true; teamId: string }).teamId).toBe("t-slot-free");
  });

  it("retries capacity claim once after transient rejection", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const supabase = new MockSupabase({
      teams: [{ id: "t1", service_type: "deep_cleaning", is_active: true, capacity_per_day: 3 }],
      team_members: [{ id: "m1", team_id: "t1", cleaner_id: "c1", active_from: null, active_to: null }],
      bookings: [{ id: "b-retry", status: "pending", cleaner_id: null, date: "2026-04-25" }],
    });
    supabase.claimTransientRejectRemaining = { t1: 1 };

    const p = assignTeamToBooking(
      supabase as unknown as never,
      { id: "b-retry", status: "pending", cleaner_id: null, date: "2026-04-25" },
      "deep_cleaning",
    );
    await vi.runAllTimersAsync();
    const result = await p;

    expect(result.ok).toBe(true);
    expect((result as { ok: true; teamId: string }).teamId).toBe("t1");
    expect(vi.mocked(systemLog.logSystemEvent)).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "TEAM_ASSIGNMENT_ALLOCATION_METRIC",
        context: expect.objectContaining({
          metricSchemaVersion: 3,
          outcome: "success",
          attemptIndex: 1,
          attemptCount: 1,
          selectedTeamRank: 0,
          selectedTeamId: "t1",
          capacityBackoffCount: 1,
          claimRpcCallCount: 2,
        }),
      }),
    );
    vi.useRealTimers();
  });

  it("treats booking time 8:0 as same slot as stored 08:00", async () => {
    vi.stubEnv("TEAM_ASSIGN_SLOT_LOAD_WEIGHT", "0.5");
    const supabase = new MockSupabase({
      teams: [
        { id: "t-slot-busy", service_type: "deep_cleaning", is_active: true, capacity_per_day: 5 },
        { id: "t-slot-free", service_type: "deep_cleaning", is_active: true, capacity_per_day: 5 },
      ],
      team_members: [
        { id: "m1", team_id: "t-slot-busy", cleaner_id: "c1", active_from: null, active_to: null },
        { id: "m2", team_id: "t-slot-free", cleaner_id: "c2", active_from: null, active_to: null },
      ],
      bookings: [
        {
          id: "x-slot",
          team_id: "t-slot-busy",
          is_team_job: true,
          date: "2026-04-25",
          status: "assigned",
          time: "08:00",
        },
        {
          id: "x-other-time",
          team_id: "t-slot-free",
          is_team_job: true,
          date: "2026-04-25",
          status: "assigned",
          time: "14:00",
        },
        { id: "b-8", status: "pending", cleaner_id: null, date: "2026-04-25" },
      ],
    });

    const result = await assignTeamToBooking(
      supabase as unknown as never,
      {
        id: "b-8",
        status: "pending",
        cleaner_id: null,
        date: "2026-04-25",
        time: "8:0",
      },
      "deep_cleaning",
    );

    expect(result.ok).toBe(true);
    expect((result as { ok: true; teamId: string }).teamId).toBe("t-slot-free");
  });

  it("clamps TEAM_ASSIGN_SLOT_LOAD_WEIGHT above 2 for scoring", async () => {
    vi.stubEnv("TEAM_ASSIGN_SLOT_LOAD_WEIGHT", "99");
    const supabase = new MockSupabase({
      teams: [{ id: "t1", service_type: "deep_cleaning", is_active: true, capacity_per_day: 3 }],
      team_members: [{ id: "m1", team_id: "t1", cleaner_id: "c1", active_from: null, active_to: null }],
      bookings: [{ id: "b-clamp", status: "pending", cleaner_id: null, date: "2026-04-25" }],
    });

    const result = await assignTeamToBooking(
      supabase as unknown as never,
      { id: "b-clamp", status: "pending", cleaner_id: null, date: "2026-04-25" },
      "deep_cleaning",
    );

    expect(result.ok).toBe(true);
    expect(vi.mocked(systemLog.logSystemEvent)).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "TEAM_ASSIGNMENT_ALLOCATION_METRIC",
        context: expect.objectContaining({
          metricSchemaVersion: 3,
          teamAssignSlotLoadWeight: 2,
          selectedTeamId: "t1",
          attemptCount: 1,
        }),
      }),
    );
  });

  it("applies progressive backoff before third team after two capacity rejects", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const supabase = new MockSupabase({
      teams: [
        { id: "t-a", service_type: "deep_cleaning", is_active: true, capacity_per_day: 5 },
        { id: "t-b", service_type: "deep_cleaning", is_active: true, capacity_per_day: 5 },
        { id: "t-c", service_type: "deep_cleaning", is_active: true, capacity_per_day: 5 },
      ],
      team_members: [
        { id: "m1", team_id: "t-a", cleaner_id: "c1", active_from: null, active_to: null },
        { id: "m2", team_id: "t-b", cleaner_id: "c2", active_from: null, active_to: null },
        { id: "m3", team_id: "t-c", cleaner_id: "c3", active_from: null, active_to: null },
      ],
      bookings: [
        {
          id: "x-busy-c",
          team_id: "t-c",
          is_team_job: true,
          date: "2026-04-25",
          status: "assigned",
        },
        { id: "b-inter", status: "pending", cleaner_id: null, date: "2026-04-25" },
      ],
    });
    supabase.claimAlwaysRejectTeamIds = new Set(["t-a", "t-b"]);

    const p = assignTeamToBooking(
      supabase as unknown as never,
      { id: "b-inter", status: "pending", cleaner_id: null, date: "2026-04-25" },
      "deep_cleaning",
    );
    await vi.runAllTimersAsync();
    const result = await p;

    expect(result.ok).toBe(true);
    expect((result as { ok: true; teamId: string }).teamId).toBe("t-c");
    expect(vi.mocked(systemLog.logSystemEvent)).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "TEAM_ASSIGNMENT_ALLOCATION_METRIC",
        context: expect.objectContaining({
          metricSchemaVersion: 3,
          outcome: "success",
          attemptIndex: 3,
          attemptCount: 3,
          selectedTeamRank: 2,
          selectedTeamId: "t-c",
          interTeamBackoffMsTotal: expect.any(Number),
          capacityRejectTryCount: 2,
        }),
      }),
    );
    const metricCall = vi.mocked(systemLog.logSystemEvent).mock.calls.find(
      (c) => (c[0] as { source?: string }).source === "TEAM_ASSIGNMENT_ALLOCATION_METRIC",
    );
    const ctx = (metricCall?.[0] as { context?: { interTeamBackoffMsTotal?: number } }).context;
    expect(ctx?.interTeamBackoffMsTotal).toBeGreaterThanOrEqual(40);
    vi.useRealTimers();
  });

  it("logs exhaustedReason when all candidates reject capacity", async () => {
    const supabase = new MockSupabase({
      teams: [
        { id: "t1", service_type: "deep_cleaning", is_active: true, capacity_per_day: 3 },
        { id: "t2", service_type: "deep_cleaning", is_active: true, capacity_per_day: 3 },
      ],
      team_members: [
        { id: "m1", team_id: "t1", cleaner_id: "c1", active_from: null, active_to: null },
        { id: "m2", team_id: "t2", cleaner_id: "c2", active_from: null, active_to: null },
      ],
      bookings: [{ id: "b-ex", status: "pending", cleaner_id: null, date: "2026-04-25" }],
    });
    supabase.claimAlwaysRejectTeamIds = new Set(["t1", "t2"]);

    const result = await assignTeamToBooking(
      supabase as unknown as never,
      { id: "b-ex", status: "pending", cleaner_id: null, date: "2026-04-25" },
      "deep_cleaning",
    );

    expect(result.ok).toBe(false);
    expect(vi.mocked(systemLog.logSystemEvent)).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "TEAM_ASSIGNMENT_ALLOCATION_METRIC",
        context: expect.objectContaining({
          outcome: "exhausted",
          exhaustedReason: "all_capacity_rejected",
          selectedTeamRank: null,
          selectedTeamId: null,
          attemptCount: 2,
          attemptIndex: 2,
          metricSchemaVersion: 3,
        }),
      }),
    );
  });

  it("includes candidateSample in allocation metric when sample rate is 1", async () => {
    vi.stubEnv("TEAM_ASSIGN_CANDIDATE_METRIC_SAMPLE_RATE", "1");
    const supabase = new MockSupabase({
      teams: [{ id: "t1", service_type: "deep_cleaning", is_active: true, capacity_per_day: 3 }],
      team_members: [{ id: "m1", team_id: "t1", cleaner_id: "c1", active_from: null, active_to: null }],
      bookings: [{ id: "b-sample", status: "pending", cleaner_id: null, date: "2026-04-25" }],
    });

    await assignTeamToBooking(
      supabase as unknown as never,
      { id: "b-sample", status: "pending", cleaner_id: null, date: "2026-04-25" },
      "deep_cleaning",
    );

    expect(vi.mocked(systemLog.logSystemEvent)).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "TEAM_ASSIGNMENT_ALLOCATION_METRIC",
        context: expect.objectContaining({
          candidateSample: [
            expect.objectContaining({
              id: "t1",
              load: 0,
              remaining: 3,
              roster: 1,
            }),
          ],
        }),
      }),
    );
  });

  it("skips slot weighting when booking time is not HH:MM", async () => {
    vi.stubEnv("TEAM_ASSIGN_SLOT_LOAD_WEIGHT", "0.5");
    const supabase = new MockSupabase({
      teams: [
        { id: "t-slot-busy", service_type: "deep_cleaning", is_active: true, capacity_per_day: 5 },
        { id: "t-slot-free", service_type: "deep_cleaning", is_active: true, capacity_per_day: 5 },
      ],
      team_members: [
        { id: "m1", team_id: "t-slot-busy", cleaner_id: "c1", active_from: null, active_to: null },
        { id: "m2", team_id: "t-slot-free", cleaner_id: "c2", active_from: null, active_to: null },
      ],
      bookings: [
        {
          id: "x-slot",
          team_id: "t-slot-busy",
          is_team_job: true,
          date: "2026-04-25",
          status: "assigned",
          time: "09:00",
        },
        { id: "b-badtime", status: "pending", cleaner_id: null, date: "2026-04-25" },
      ],
    });

    const result = await assignTeamToBooking(
      supabase as unknown as never,
      {
        id: "b-badtime",
        status: "pending",
        cleaner_id: null,
        date: "2026-04-25",
        time: "9am",
      },
      "deep_cleaning",
    );

    expect(result.ok).toBe(true);
    expect((result as { ok: true; teamId: string }).teamId).toBe("t-slot-free");
  });
});

