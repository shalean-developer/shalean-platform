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

class QueryBuilder {
  private filters: Array<{ kind: "eq" | "in" | "not_eq"; column: string; value: unknown }> = [];
  private single = false;
  private selectedColumns: string[] | null = null;

  constructor(
    private table: string,
    private db: MockSupabaseClient,
  ) {}

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
  });

  it("team job resolves cleaner-facing display earnings to 25000", async () => {
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
          status: "pending",
        },
      ],
    });

    const { GET } = await import("@/app/api/cleaner/offers/route");
    const res = await GET(new Request("http://localhost/api/cleaner/offers"));
    const json = (await res.json()) as { offers: Array<Record<string, unknown>> };

    expect(json.offers[0]!.displayEarningsCents).toBe(25_000);
  });

  it("uses fallback when display earnings missing and logs warning", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
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
        },
      ],
    });

    const { GET } = await import("@/app/api/cleaner/jobs/route");
    const res = await GET(new Request("http://localhost/api/cleaner/jobs"));
    const json = (await res.json()) as { jobs: Array<Record<string, unknown>> };

    expect(json.jobs[0]!.displayEarningsCents).toBe(19_000);
    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith("Fallback earnings used", "b4", "api/cleaner/jobs");
  });
});

