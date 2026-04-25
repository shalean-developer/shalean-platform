import { describe, expect, it } from "vitest";
import { assignTeamToBooking } from "@/lib/dispatch/assignTeamToBooking";

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
        if (!Array.isArray(f.value) || !f.value.includes(value)) return false;
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
    if (name === "claim_team_capacity_slot") {
      const teamId = String(args.p_team_id ?? "");
      const date = String(args.p_booking_date ?? "");
      const capacity = Number(args.p_capacity_per_day ?? 0);
      const used = this.tables.bookings.filter(
        (b) =>
          b.team_id === teamId &&
          b.is_team_job === true &&
          b.date === date &&
          ["pending", "assigned", "in_progress"].includes(String(b.status ?? "")),
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
    expect(supabase.tables.booking_team_assignments).toHaveLength(1);
  });
});

