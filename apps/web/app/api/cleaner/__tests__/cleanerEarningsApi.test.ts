import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const mockState: { admin: MockSupabaseClient | null; cleanerId: string | null } = {
  admin: null,
  cleanerId: "cleaner-1",
};

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => mockState.admin,
}));

vi.mock("@/lib/cleaner/session", () => ({
  resolveCleanerIdFromRequest: async () => ({ cleanerId: mockState.cleanerId, status: 200 }),
}));

function matchesBookingsVisibilityOr(row: Row, expr: string): boolean {
  const head = /^cleaner_id\.eq\.([^,]+)/.exec(expr);
  if (head && String(row.cleaner_id ?? "") === head[1]) return true;
  if (!expr.includes("team_id.in.")) return false;
  const inMatch = /team_id\.in\.\(([^)]*)\)/.exec(expr);
  if (!inMatch) return false;
  const list = inMatch[1].split(",").map((s) => s.trim()).filter(Boolean);
  const hasTeamPred = expr.includes("is_team_job.is.true") || expr.includes("is_team_job.eq.true");
  if (!hasTeamPred) return false;
  return row.is_team_job === true && list.includes(String(row.team_id ?? ""));
}

class QueryBuilder {
  private filters: Array<{ kind: "eq" | "in" | "not_eq"; column: string; value: unknown }> = [];
  private single = false;
  private selectedColumns: string[] | null = null;
  private orExpr: string | null = null;

  constructor(
    private table: string,
    private db: MockSupabaseClient,
  ) {}

  or(expr: string) {
    this.orExpr = expr;
    return this;
  }

  select(columns?: string) {
    if (typeof columns === "string" && columns.trim()) {
      this.selectedColumns = columns
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);
    }
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ kind: "eq", column, value });
    return this;
  }

  not(column: string, op: string, value: unknown) {
    if (op === "eq") this.filters.push({ kind: "not_eq", column, value });
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push({ kind: "in", column, value: values });
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
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<{ data: unknown; error: null }> {
    const rows = (this.db.tables[this.table] as Row[] | undefined) ?? [];
    const filtered = rows.filter((row) => this.matches(row)).map((row) => this.projectRow(row));
    return { data: this.single ? filtered[0] ?? null : filtered, error: null };
  }

  private matches(row: Row): boolean {
    if (this.table === "bookings" && this.orExpr) {
      if (!matchesBookingsVisibilityOr(row, this.orExpr)) return false;
    }
    for (const f of this.filters) {
      if (f.kind === "eq" && row[f.column] !== f.value) return false;
      if (f.kind === "not_eq" && row[f.column] === f.value) return false;
      if (f.kind === "in") {
        const values = Array.isArray(f.value) ? f.value : [];
        if (!values.includes(row[f.column])) return false;
      }
    }
    return true;
  }

  private projectRow(row: Row): Row {
    if (!this.selectedColumns || this.selectedColumns.length === 0 || this.selectedColumns.includes("*")) {
      return { ...row };
    }
    const out: Row = {};
    for (const col of this.selectedColumns) {
      out[col] = row[col];
    }
    return out;
  }
}

class MockSupabaseClient {
  tables: Record<string, Row[]>;
  constructor(seed?: Partial<Record<string, Row[]>>) {
    this.tables = {
      cleaners: [],
      bookings: [],
      dispatch_offers: [],
      team_members: [],
      ...(seed ?? {}),
    };
  }
  from(table: string) {
    return new QueryBuilder(table, this);
  }
}

describe("cleaner API earnings contracts", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockState.cleanerId = "cleaner-1";
  });

  it("jobs response exposes displayEarningsCents and hides internal payout fields", async () => {
    mockState.admin = new MockSupabaseClient({
      cleaners: [{ id: "cleaner-1" }],
      bookings: [
        {
          id: "b1",
          cleaner_id: "cleaner-1",
          service: "Standard Cleaning",
          status: "assigned",
          display_earnings_cents: 25_000,
          cleaner_payout_cents: 30_000,
          cleaner_bonus_cents: 5_000,
          payout_earnings_cents: 25_000,
          internal_earnings_cents: 30_000,
        },
      ],
    });

    const { GET } = await import("@/app/api/cleaner/jobs/route");
    const res = await GET(new Request("http://localhost/api/cleaner/jobs"));
    const json = (await res.json()) as { jobs: Array<Record<string, unknown>> };
    const row = json.jobs[0]!;

    expect(row.displayEarningsCents).toBeDefined();
    expect(row.displayEarningsCents).toBe(25_000);
    expect(row.earnings_cents).toBe(25_000);
    expect(row.earnings_estimated).toBe(false);
    expect(row.cleaner_bonus_cents).toBeUndefined();
    expect(row.payout_earnings_cents).toBeUndefined();
    expect(row.internal_earnings_cents).toBeUndefined();
  });

  it("offers response includes positive displayEarningsCents", async () => {
    mockState.admin = new MockSupabaseClient({
      dispatch_offers: [
        { id: "o1", booking_id: "b2", cleaner_id: "cleaner-1", status: "pending", expires_at: "2099-01-01T00:00:00Z" },
      ],
      bookings: [
        {
          id: "b2",
          service: "Standard Cleaning",
          display_earnings_cents: 18_000,
          cleaner_payout_cents: 18_000,
          status: "pending",
        },
      ],
    });

    const { GET } = await import("@/app/api/cleaner/offers/route");
    const res = await GET(new Request("http://localhost/api/cleaner/offers"));
    const json = (await res.json()) as { offers: Array<Record<string, unknown>> };
    const offer = json.offers[0]!;

    expect(offer.displayEarningsCents).toBeDefined();
    expect(Number(offer.displayEarningsCents)).toBeGreaterThan(0);
    expect(offer.earnings_cents).toBe(offer.displayEarningsCents);
  });

  it("offers include row with null when earnings cannot be resolved", async () => {
    mockState.admin = new MockSupabaseClient({
      dispatch_offers: [
        { id: "o-none", booking_id: "b-none", cleaner_id: "cleaner-1", status: "pending", expires_at: "2099-01-01T00:00:00Z" },
      ],
      bookings: [
        {
          id: "b-none",
          service: "Standard Cleaning",
          display_earnings_cents: null,
          cleaner_payout_cents: null,
          payout_frozen_cents: null,
          amount_paid_cents: null,
          total_paid_zar: null,
          booking_snapshot: null,
          status: "pending",
        },
      ],
    });

    const { GET } = await import("@/app/api/cleaner/offers/route");
    const res = await GET(new Request("http://localhost/api/cleaner/offers"));
    const json = (await res.json()) as { offers: Array<Record<string, unknown>> };

    expect(json.offers).toHaveLength(1);
    expect(json.offers[0]!.displayEarningsCents).toBeNull();
    expect(json.offers[0]!.earnings_cents).toBeNull();
  });

  it("offers return null display when booking has no stored cleaner earnings", async () => {
    mockState.admin = new MockSupabaseClient({
      dispatch_offers: [
        { id: "o-est", booking_id: "b-est", cleaner_id: "cleaner-1", status: "pending", expires_at: "2099-01-01T00:00:00Z" },
      ],
      bookings: [
        {
          id: "b-est",
          service: "Standard Cleaning",
          is_team_job: false,
          display_earnings_cents: null,
          cleaner_payout_cents: null,
          amount_paid_cents: null,
          total_paid_zar: null,
          payout_frozen_cents: null,
          booking_snapshot: { locked: { finalPrice: 1000 } },
          status: "pending",
        },
      ],
    });

    const { GET } = await import("@/app/api/cleaner/offers/route");
    const res = await GET(new Request("http://localhost/api/cleaner/offers"));
    const json = (await res.json()) as { offers: Array<Record<string, unknown>> };
    const offer = json.offers[0]!;

    expect(offer.displayEarningsCents).toBeNull();
    expect(offer.displayEarningsIsEstimate).toBe(false);
    expect(offer.earnings_cents).toBeNull();
    expect(offer.earnings_estimated).toBe(false);
  });

  it("team job offer has null display when booking has no stored cleaner earnings", async () => {
    mockState.admin = new MockSupabaseClient({
      dispatch_offers: [
        { id: "o2", booking_id: "b3", cleaner_id: "cleaner-1", status: "pending", expires_at: "2099-01-01T00:00:00Z" },
      ],
      bookings: [
        {
          id: "b3",
          service: "Deep Cleaning",
          is_team_job: true,
          display_earnings_cents: null,
          cleaner_payout_cents: null,
          payout_frozen_cents: null,
          status: "pending",
        },
      ],
    });

    const { GET } = await import("@/app/api/cleaner/offers/route");
    const res = await GET(new Request("http://localhost/api/cleaner/offers"));
    const json = (await res.json()) as { offers: Array<Record<string, unknown>> };

    expect(json.offers[0]!.displayEarningsCents).toBeNull();
    expect(json.offers[0]!.displayEarningsIsEstimate).toBe(false);
  });

  it("jobs use frozen then display only (no cleaner_payout path in API)", async () => {
    mockState.admin = new MockSupabaseClient({
      cleaners: [{ id: "cleaner-1" }],
      bookings: [
        {
          id: "b4",
          cleaner_id: "cleaner-1",
          service: "Standard Cleaning",
          status: "assigned",
          display_earnings_cents: null,
          cleaner_payout_cents: 19_000,
          payout_frozen_cents: null,
        },
      ],
    });

    const { GET } = await import("@/app/api/cleaner/jobs/route");
    const res = await GET(new Request("http://localhost/api/cleaner/jobs"));
    const json = (await res.json()) as { jobs: Array<Record<string, unknown>> };

    expect(json.jobs[0]!.displayEarningsCents).toBeNull();
    expect(json.jobs[0]!.displayEarningsIsEstimate).toBe(false);
  });

  it("team job without stored display earnings returns null from jobs API", async () => {
    mockState.admin = new MockSupabaseClient({
      cleaners: [{ id: "cleaner-1" }],
      bookings: [
        {
          id: "b-team",
          cleaner_id: "cleaner-1",
          service: "Deep Cleaning",
          status: "assigned",
          is_team_job: true,
          team_id: "team-1",
          display_earnings_cents: null,
          cleaner_payout_cents: null,
          payout_frozen_cents: null,
        },
      ],
    });

    const { GET } = await import("@/app/api/cleaner/jobs/route");
    const res = await GET(new Request("http://localhost/api/cleaner/jobs"));
    const json = (await res.json()) as { jobs: Array<Record<string, unknown>> };

    expect(json.jobs[0]!.displayEarningsCents).toBeNull();
    expect(json.jobs[0]!.displayEarningsIsEstimate).toBe(false);
  });
});

