import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const mockState: { admin: MockSupabaseClient | null } = { admin: null };

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => mockState.admin,
}));

class QueryBuilder {
  private filters: Array<{ kind: "eq" | "is" | "not_is"; column: string; value: unknown }> = [];
  private op: "select" | "update" | "insert" | "delete" = "select";
  private patch: Row = {};
  private insertRows: Row[] = [];
  private single = false;

  constructor(
    private table: string,
    private db: MockSupabaseClient,
  ) {}

  select(_columns?: string) {
    if (this.op !== "update") {
      this.op = "select";
    }
    return this;
  }

  update(values: Row) {
    this.op = "update";
    this.patch = { ...values };
    return this;
  }

  insert(values: Row[] | Row) {
    this.op = "insert";
    this.insertRows = Array.isArray(values) ? values.map((v) => ({ ...v })) : [{ ...values }];
    return this;
  }

  delete() {
    this.op = "delete";
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ kind: "eq", column, value });
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
    return this.execute();
  }

  then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<{ data: unknown; error: null }> {
    if (this.op === "insert") {
      this.db.insertCount[this.table] = (this.db.insertCount[this.table] ?? 0) + 1;
      if (!Array.isArray(this.db.tables[this.table])) this.db.tables[this.table] = [];
      (this.db.tables[this.table] as Row[]).push(...this.insertRows.map((r) => ({ ...r })));
      return { data: this.insertRows, error: null };
    }

    if (this.op === "delete") {
      const rows = (this.db.tables[this.table] as Row[] | undefined) ?? [];
      const next = rows.filter((row) => !this.matches(row));
      this.db.tables[this.table] = next;
      return { data: null, error: null };
    }

    const rows = (this.db.tables[this.table] as Row[] | undefined) ?? [];
    const matches = rows.filter((row) => this.matches(row));

    if (this.op === "update") {
      this.db.updateCount[this.table] = (this.db.updateCount[this.table] ?? 0) + 1;
      for (const row of matches) {
        Object.assign(row, this.patch);
      }
      return { data: matches.map((r) => ({ id: r.id })), error: null };
    }

    if (this.table === "service_earning_caps") {
      this.db.serviceCapSelects += 1;
    }

    if (this.single) return { data: matches[0] ?? null, error: null };
    return { data: matches, error: null };
  }

  private matches(row: Row): boolean {
    for (const f of this.filters) {
      const value = row[f.column];
      if (f.kind === "eq" && value !== f.value) return false;
      if (f.kind === "is") {
        if (f.value === null) {
          if (value !== null && value !== undefined) return false;
        } else if (value !== f.value) {
          return false;
        }
      }
      if (f.kind === "not_is" && f.value === null) {
        if (value === null || value === undefined) return false;
      }
    }
    return true;
  }
}

class MockSupabaseClient {
  tables: Record<string, Row[]>;
  updateCount: Record<string, number> = {};
  insertCount: Record<string, number> = {};
  serviceCapSelects = 0;

  constructor(seed?: Partial<Record<string, Row[]>>) {
    this.tables = {
      bookings: [],
      cleaners: [],
      service_earning_caps: [],
      team_members: [],
      team_job_member_payouts: [],
      booking_cleaners: [],
      ...(seed ?? {}),
    };
  }

  from(table: string) {
    return new QueryBuilder(table, this);
  }
}

describe("persistCleanerPayoutIfUnset", { timeout: 60_000 }, () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("dual-writes individual booking earnings and keeps legacy fields", { timeout: 60_000 }, async () => {
    const admin = new MockSupabaseClient({
      bookings: [
        {
          id: "b1",
          cleaner_id: "c1",
          team_id: null,
          is_team_job: false,
          date: "2026-04-20",
          time: "10:00:00",
          total_paid_zar: 500,
          total_paid_cents: 50_000,
          amount_paid_cents: 50_000,
          base_amount_cents: 50_000,
          service_fee_cents: 0,
          service: "Standard Cleaning",
          booking_snapshot: { locked: { service: "standard" } },
          cleaner_payout_cents: null,
          cleaner_bonus_cents: null,
          company_revenue_cents: null,
          display_earnings_cents: null,
        },
      ],
      cleaners: [{ id: "c1", joined_at: "2026-03-01T00:00:00.000Z", created_at: "2026-03-01T00:00:00.000Z" }],
      service_earning_caps: [{ service_id: "standard", cap_cents: 25_000, is_active: true }],
    });
    mockState.admin = admin;

    const { persistCleanerPayoutIfUnset } = await import("@/lib/payout/persistCleanerPayout");
    const result = await persistCleanerPayoutIfUnset({ admin: admin as unknown as never, bookingId: "b1", cleanerId: "c1" });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.skipped).toBe(false);

    const booking = admin.tables.bookings[0]!;
    expect(booking.display_earnings_cents).toBe(25_000);
    expect(booking.payout_earnings_cents).toBe(25_000);
    expect(booking.internal_earnings_cents).toBe(30_000);
    expect(booking.earnings_percentage_applied).toBe(0.6);
    expect(booking.earnings_cap_cents_applied).toBe(25_000);
    expect(Number(booking.earnings_tenure_months_at_assignment)).toBeGreaterThanOrEqual(0);

    expect(booking.cleaner_payout_cents).toBe(30_000);
    expect(booking.cleaner_bonus_cents).toBe(0);
    expect(booking.company_revenue_cents).toBe(20_000);
    expect(Number(booking.display_earnings_cents)).toBeLessThanOrEqual(Number(booking.earnings_cap_cents_applied));
    expect(Number(booking.display_earnings_cents)).toBeGreaterThanOrEqual(0);
    expect(Number(booking.payout_earnings_cents)).toBe(Number(booking.display_earnings_cents));
  });

  it("creates team member payouts and writes team-fixed booking values", async () => {
    const teamBookingId = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
    const teamId = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
    const cLead = "11111111-1111-4111-8111-111111111111";
    const cMem2 = "22222222-2222-4222-8222-222222222222";
    const cMem3 = "33333333-3333-4333-8333-333333333333";

    const admin = new MockSupabaseClient({
      bookings: [
        {
          id: teamBookingId,
          cleaner_id: cLead,
          team_id: teamId,
          is_team_job: true,
          date: "2026-04-20",
          time: "11:00:00",
          total_paid_zar: 900,
          total_paid_cents: 90_000,
          amount_paid_cents: 90_000,
          base_amount_cents: 90_000,
          service_fee_cents: 0,
          service: "Deep Cleaning",
          booking_snapshot: { locked: { service: "deep" } },
          cleaner_payout_cents: null,
          cleaner_bonus_cents: null,
          company_revenue_cents: null,
          display_earnings_cents: null,
        },
      ],
      team_members: [
        { team_id: teamId, cleaner_id: cLead, active_from: null, active_to: null },
        { team_id: teamId, cleaner_id: cMem2, active_from: null, active_to: null },
        { team_id: teamId, cleaner_id: cMem3, active_from: null, active_to: null },
      ],
      booking_cleaners: [
        { booking_id: teamBookingId, cleaner_id: cLead, role: "lead", payout_weight: 1, lead_bonus_cents: 0 },
        { booking_id: teamBookingId, cleaner_id: cMem2, role: "member", payout_weight: 1, lead_bonus_cents: 0 },
        { booking_id: teamBookingId, cleaner_id: cMem3, role: "member", payout_weight: 1, lead_bonus_cents: 0 },
      ],
    });
    mockState.admin = admin;

    const { persistCleanerPayoutIfUnset } = await import("@/lib/payout/persistCleanerPayout");
    const result = await persistCleanerPayoutIfUnset({ admin: admin as unknown as never, bookingId: teamBookingId, cleanerId: cLead });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.skipped).toBe(false);

    const booking = admin.tables.bookings[0]!;
    expect(booking.display_earnings_cents).toBe(25_000);
    expect(booking.payout_earnings_cents).toBe(25_000);
    expect(booking.internal_earnings_cents).toBe(25_000);
    expect(booking.cleaner_payout_cents).toBe(0);
    expect(booking.cleaner_bonus_cents).toBe(0);
    expect(booking.payout_type).toBe("team_fixed");

    const payouts = admin.tables.team_job_member_payouts;
    expect(payouts).toHaveLength(3);
    const sum = payouts.reduce((s, row) => s + Number((row as { payout_cents?: number }).payout_cents ?? 0), 0);
    expect(sum).toBe(25_000);
    const byId = new Map(payouts.map((row) => [(row as { cleaner_id: string }).cleaner_id, row as { payout_cents: number }]));
    expect(byId.get(cLead)!.payout_cents).toBe(8334);
    expect(byId.get(cMem2)!.payout_cents).toBe(8333);
    expect(byId.get(cMem3)!.payout_cents).toBe(8333);
  });

  it("freezes on rerun and avoids second write", async () => {
    const admin = new MockSupabaseClient({
      bookings: [
        {
          id: "b3",
          cleaner_id: "c1",
          team_id: null,
          is_team_job: false,
          date: "2026-04-20",
          time: "12:00:00",
          total_paid_zar: 500,
          total_paid_cents: 50_000,
          amount_paid_cents: 50_000,
          base_amount_cents: 50_000,
          service_fee_cents: 0,
          service: "Standard Cleaning",
          booking_snapshot: { locked: { service: "standard" } },
          cleaner_payout_cents: null,
          cleaner_bonus_cents: null,
          company_revenue_cents: null,
          display_earnings_cents: null,
        },
      ],
      cleaners: [{ id: "c1", joined_at: "2026-03-01T00:00:00.000Z", created_at: "2026-03-01T00:00:00.000Z" }],
      service_earning_caps: [{ service_id: "standard", cap_cents: 25_000, is_active: true }],
    });
    mockState.admin = admin;

    const { persistCleanerPayoutIfUnset } = await import("@/lib/payout/persistCleanerPayout");
    const first = await persistCleanerPayoutIfUnset({ admin: admin as unknown as never, bookingId: "b3", cleanerId: "c1" });
    const second = await persistCleanerPayoutIfUnset({ admin: admin as unknown as never, bookingId: "b3", cleanerId: "c1" });

    expect(first.ok).toBe(true);
    if (first.ok) expect(first.skipped).toBe(false);
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.skipped).toBe(true);
      if (second.skipped) {
        expect(second.skipReason).toMatch(/display_earnings_already_set|solo_line_finalized_with_ledger/);
      }
    }
    expect(admin.updateCount.bookings ?? 0).toBe(1);
    expect(admin.serviceCapSelects).toBeGreaterThanOrEqual(1);
  });

  it("does not apply cap when percentage earnings are below cap", async () => {
    const admin = new MockSupabaseClient({
      bookings: [
        {
          id: "b4",
          cleaner_id: "c1",
          team_id: null,
          is_team_job: false,
          date: "2026-04-20",
          time: "09:00:00",
          total_paid_zar: 200,
          total_paid_cents: 20_000,
          amount_paid_cents: 20_000,
          base_amount_cents: 20_000,
          service_fee_cents: 0,
          service: "Standard Cleaning",
          booking_snapshot: { locked: { service: "standard" } },
          cleaner_payout_cents: null,
          cleaner_bonus_cents: null,
          company_revenue_cents: null,
          display_earnings_cents: null,
        },
      ],
      cleaners: [{ id: "c1", joined_at: "2026-03-01T00:00:00.000Z", created_at: "2026-03-01T00:00:00.000Z" }],
      service_earning_caps: [{ service_id: "standard", cap_cents: 25_000, is_active: true }],
    });
    mockState.admin = admin;

    const { persistCleanerPayoutIfUnset } = await import("@/lib/payout/persistCleanerPayout");
    const result = await persistCleanerPayoutIfUnset({ admin: admin as unknown as never, bookingId: "b4", cleanerId: "c1" });

    expect(result.ok).toBe(true);
    const booking = admin.tables.bookings[0]!;
    expect(booking.display_earnings_cents).toBe(12_000);
    expect(Number(booking.display_earnings_cents)).toBeLessThanOrEqual(Number(booking.earnings_cap_cents_applied));
    expect(Number(booking.display_earnings_cents)).toBeGreaterThanOrEqual(0);
    expect(Number(booking.payout_earnings_cents)).toBe(Number(booking.display_earnings_cents));
  });

  it("missing cap still writes display earnings", async () => {
    const admin = new MockSupabaseClient({
      bookings: [
        {
          id: "b5",
          cleaner_id: "c1",
          team_id: null,
          is_team_job: false,
          date: "2026-04-20",
          time: "09:30:00",
          total_paid_zar: 400,
          total_paid_cents: 40_000,
          amount_paid_cents: 40_000,
          base_amount_cents: 40_000,
          service_fee_cents: 0,
          service: "Standard Cleaning",
          booking_snapshot: { locked: { service: "standard" } },
          cleaner_payout_cents: null,
          cleaner_bonus_cents: null,
          company_revenue_cents: null,
          display_earnings_cents: null,
        },
      ],
      cleaners: [{ id: "c1", joined_at: "2026-03-01T00:00:00.000Z", created_at: "2026-03-01T00:00:00.000Z" }],
      service_earning_caps: [],
    });
    mockState.admin = admin;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { persistCleanerPayoutIfUnset } = await import("@/lib/payout/persistCleanerPayout");
    const result = await persistCleanerPayoutIfUnset({ admin: admin as unknown as never, bookingId: "b5", cleanerId: "c1" });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.skipped).toBe(false);
    expect(admin.updateCount.bookings ?? 0).toBeGreaterThanOrEqual(1);

    const booking = admin.tables.bookings[0]!;
    expect(booking.display_earnings_cents).toBe(24_000);
    expect(booking.payout_earnings_cents).toBe(24_000);
    expect(booking.internal_earnings_cents).toBe(24_000);
    expect(booking.earnings_cap_cents_applied).toBeNull();

    expect(errorSpy).toHaveBeenCalledWith(
      "EARNINGS_CAP_MISSING",
      expect.objectContaining({ serviceId: "standard", reason: "no_active_cap" }),
    );
  });

  it("recomputes solo display when stuck at 0 but customer payment columns show paid amount", async () => {
    const admin = new MockSupabaseClient({
      bookings: [
        {
          id: "b-zero-stuck",
          cleaner_id: "c1",
          team_id: null,
          is_team_job: false,
          date: "2026-04-20",
          time: "10:00:00",
          total_paid_zar: 500,
          total_paid_cents: 50_000,
          amount_paid_cents: 50_000,
          base_amount_cents: 50_000,
          service_fee_cents: 0,
          service: "Standard Cleaning",
          booking_snapshot: { locked: { service: "standard" } },
          cleaner_payout_cents: null,
          cleaner_bonus_cents: null,
          company_revenue_cents: null,
          display_earnings_cents: 0,
        },
      ],
      cleaners: [{ id: "c1", joined_at: "2026-03-01T00:00:00.000Z", created_at: "2026-03-01T00:00:00.000Z" }],
      service_earning_caps: [{ service_id: "standard", cap_cents: 25_000, is_active: true }],
    });
    mockState.admin = admin;

    const { persistCleanerPayoutIfUnset } = await import("@/lib/payout/persistCleanerPayout");
    const result = await persistCleanerPayoutIfUnset({ admin: admin as unknown as never, bookingId: "b-zero-stuck", cleanerId: "c1" });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.skipped).toBe(false);
    expect(admin.tables.bookings[0]!.display_earnings_cents).toBe(25_000);
  });
});
